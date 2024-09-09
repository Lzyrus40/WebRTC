const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callButton = document.getElementById('callButton');
const acceptCallButton = document.getElementById('acceptCall');
const rejectCallButton = document.getElementById('rejectCall');
const muteButton = document.getElementById('muteButton');
const endCallButton = document.getElementById('endCall');
const statusMessage = document.getElementById('statusMessage');

const signalingServer = new WebSocket('ws://localhost:3000');

let localPeerConnection;
let remotePeerConnection;
let localStream;
let remoteStream = null;
let isCaller = false;
let isMuted = false;

let userId = null;
let targetUserId = null;

// Register the user ID
document.getElementById('registerButton').onclick = () => {
    userId = document.getElementById('userId').value;
    if (!userId) {
        alert('Please enter your user ID.');
        return;
    }

    signalingServer.send(JSON.stringify({ type: 'register', userId }));
    statusMessage.innerHTML = `Registered as ${userId}`;
};

// Get local video stream
async function getLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (error) {
        console.error('Error getting local stream:', error);
        return false;
    }
}

// Caller initiates the call
callButton.onclick = async () => {
    targetUserId = document.getElementById('targetUserId').value;
    if (!targetUserId) {
        alert('Please enter the target user ID.');
        return;
    }

    isCaller = true;
    if (await getLocalStream()) {
        // Start call signaling to the target user
        signalingServer.send(JSON.stringify({
            type: 'call-initiate',
            fromUserId: userId,
            targetUserId: targetUserId
        }));
        statusMessage.innerHTML = `Calling user ${targetUserId}...`;
    }
};

// Receiver accepts the call
acceptCallButton.onclick = async () => {
    if (await getLocalStream()) {
        statusMessage.innerHTML = 'Call accepted. Connecting...';

        // Notify the caller
        signalingServer.send(JSON.stringify({
            type: 'call-accept',
            fromUserId: userId,
            targetUserId: targetUserId
        }));

        // Create a new RTCPeerConnection and set up the remote stream
        remotePeerConnection = new RTCPeerConnection();
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;

        remotePeerConnection.ontrack = (event) => {
            remoteStream.addTrack(event.track);
        };

        remotePeerConnection.onicecandidate = event => {
            if (event.candidate) {
                signalingServer.send(JSON.stringify({
                    type: 'candidate',
                    fromUserId: userId,
                    targetUserId: targetUserId,
                    candidate: event.candidate
                }));
            }
        };

        const answer = await remotePeerConnection.createAnswer();
        await remotePeerConnection.setLocalDescription(answer);
        signalingServer.send(JSON.stringify({
            type: 'answer',
            fromUserId: userId,
            targetUserId: targetUserId,
            answer: answer
        }));
    }
};

// Receiver rejects the call
rejectCallButton.onclick = () => {
    signalingServer.send(JSON.stringify({
        type: 'call-reject',
        fromUserId: userId,
        targetUserId: targetUserId
    }));
    statusMessage.innerHTML = 'Call rejected';
};

// Mute/unmute functionality
muteButton.onclick = () => {
    localStream.getAudioTracks()[0].enabled = isMuted;
    isMuted = !isMuted;
    muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
};

// End call functionality
endCallButton.onclick = () => {
    signalingServer.send(JSON.stringify({
        type: 'call-end',
        fromUserId: userId,
        targetUserId: targetUserId
    }));
    localPeerConnection?.close();
    remotePeerConnection?.close();
    statusMessage.innerHTML = 'Call ended';
};

// Handle incoming WebSocket messages
signalingServer.onmessage = async (message) => {
    const data = JSON.parse(message.data);

    if (data.type === 'call-initiate') {
        // Show accept/reject buttons for the receiver
        statusMessage.innerHTML = `Incoming call from ${data.fromUserId}`;
        targetUserId = data.fromUserId;
        acceptCallButton.classList.remove('hidden');
        rejectCallButton.classList.remove('hidden');
    }

    if (data.type === 'call-accept') {
        // The receiver accepted the call
        statusMessage.innerHTML = 'Connecting...';

        // Create a new RTCPeerConnection
        localPeerConnection = new RTCPeerConnection();
        localStream.getTracks().forEach(track => localPeerConnection.addTrack(track, localStream));

        localPeerConnection.ontrack = (event) => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            remoteStream.addTrack(event.track);
        };

        localPeerConnection.onicecandidate = event => {
            if (event.candidate) {
                signalingServer.send(JSON.stringify({
                    type: 'candidate',
                    fromUserId: userId,
                    targetUserId: targetUserId,
                    candidate: event.candidate
                }));
            }
        };

        const offer = await localPeerConnection.createOffer();
        await localPeerConnection.setLocalDescription(offer);
        signalingServer.send(JSON.stringify({
            type: 'offer',
            fromUserId: userId,
            targetUserId: targetUserId,
            offer: offer
        }));
    }

    if (data.type === 'offer') {
        await remotePeerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    }

    if (data.type === 'answer') {
        await localPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        statusMessage.innerHTML = 'Call connected';
    }

    if (data.type === 'candidate') {
        const candidate = new RTCIceCandidate(data.candidate);
        if (localPeerConnection) {
            await localPeerConnection.addIceCandidate(candidate);
        } else if (remotePeerConnection) {
            await remotePeerConnection.addIceCandidate(candidate);
        }
    }

    if (data.type === 'call-reject') {
        statusMessage.innerHTML = 'Call rejected';
    }

    if (data.type === 'call-end') {
        statusMessage.innerHTML = 'Call ended by opponent';
    }
};
