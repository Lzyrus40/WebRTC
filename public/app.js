const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callButton = document.getElementById('callButton');
const acceptCallButton = document.getElementById('acceptCall');
const rejectCallButton = document.getElementById('rejectCall');
const muteButton = document.getElementById('muteButton');
const endCallButton = document.getElementById('endCallButton');
const statusMessage = document.getElementById('statusMessage');

const signalingServer = new WebSocket('ws://localhost:3000');

let localPeerConnection;
let remotePeerConnection;
let localStream;
let remoteStream = null;
let isMuted = false;

let userId = null;
let targetUserId = null;

// User Registration
document.getElementById('registerButton').onclick = () => {
    userId = document.getElementById('userId').value;
    if (!userId) {
        alert('Please enter your user ID.');
        return;
    }

    signalingServer.send(JSON.stringify({ type: 'register', userId }));
    console.log(`User ${userId} registered`);
    statusMessage.innerHTML = `Registered as ${userId}`;
    callButton.classList.remove('hidden'); // Enable the Call button after registration
};

// Get Local Video Stream
async function getLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        console.log('Local stream obtained');
        return true;
    } catch (error) {
        console.error('Error getting local stream:', error);
        return false;
    }
}

// Initiate Call
callButton.onclick = async () => {
    targetUserId = document.getElementById('targetUserId').value;
    if (!targetUserId) {
        alert('Please enter the target user ID.');
        return;
    }

    if (await getLocalStream()) {
        console.log(`Initiating call to user ${targetUserId}`);

        setupCallerConnection(); // Set up the caller's connection

        signalingServer.send(JSON.stringify({
            type: 'call-initiate',
            fromUserId: userId,
            targetUserId: targetUserId
        }));

        statusMessage.innerHTML = `Calling ${targetUserId}...`;
    }
};

// Accept Call
acceptCallButton.onclick = async () => {
    if (await getLocalStream()) {
        statusMessage.innerHTML = 'Call accepted. Connecting...';
        console.log('Call accepted');

        setupReceiverConnection(); // Set up the receiver's connection

        signalingServer.send(JSON.stringify({
            type: 'call-accept',
            fromUserId: userId,
            targetUserId: targetUserId
        }));
    }
};

// Reject Call
rejectCallButton.onclick = () => {
    signalingServer.send(JSON.stringify({
        type: 'call-reject',
        fromUserId: userId,
        targetUserId: targetUserId
    }));
    console.log('Call rejected');
    statusMessage.innerHTML = 'Call rejected';
    resetUI();
};

// Mute/Unmute Local Audio
muteButton.onclick = () => {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
    console.log(isMuted ? 'Audio muted' : 'Audio unmuted');
};

// End Call - Stops both local and remote streams
endCallButton.onclick = () => {
    signalingServer.send(JSON.stringify({
        type: 'call-end',
        fromUserId: userId,
        targetUserId: targetUserId
    }));
    console.log('Call ended');
    cleanupCall();
};

// Handle Incoming WebSocket Messages
signalingServer.onmessage = async (message) => {
    const data = JSON.parse(message.data);

    if (data.type === 'call-initiate') {
        console.log(`Incoming call from ${data.fromUserId}`);
        statusMessage.innerHTML = `Incoming call from ${data.fromUserId}`;
        targetUserId = data.fromUserId;
        acceptCallButton.classList.remove('hidden');
        rejectCallButton.classList.remove('hidden');
    }

    if (data.type === 'call-accept') {
        statusMessage.innerHTML = 'Connecting...';
        console.log('Call accepted by the target user');
        setupCallerConnection(); // Set up the caller's connection

        const offer = await localPeerConnection.createOffer();
        await localPeerConnection.setLocalDescription(offer);
        signalingServer.send(JSON.stringify({
            type: 'offer',
            fromUserId: userId,
            targetUserId: targetUserId,
            offer: offer
        }));

        // Remove Accept/Reject buttons and show Call controls
        acceptCallButton.classList.add('hidden');
        rejectCallButton.classList.add('hidden');
        showCallControls();
    }

    if (data.type === 'offer') {
        console.log('Offer received');
        await remotePeerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

        const answer = await remotePeerConnection.createAnswer();
        await remotePeerConnection.setLocalDescription(answer);
        signalingServer.send(JSON.stringify({
            type: 'answer',
            fromUserId: userId,
            targetUserId: targetUserId,
            answer: answer
        }));

        // Remove Accept/Reject buttons and show Call controls
        acceptCallButton.classList.add('hidden');
        rejectCallButton.classList.add('hidden');
        showCallControls();
    }

    if (data.type === 'answer') {
        console.log('Answer received');
        await localPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        statusMessage.innerHTML = 'Call connected';
        showCallControls(); // Show relevant call controls (mute, end)
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
        console.log('Call rejected by the receiver');
        statusMessage.innerHTML = 'Call rejected';
        resetUI();
    }

    if (data.type === 'call-end') {
        console.log('Call ended by opponent');
        statusMessage.innerHTML = 'Call ended by opponent';
        cleanupCall();
    }
};

// Setup Caller Connection
function setupCallerConnection() {
    localPeerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => localPeerConnection.addTrack(track, localStream));

    localPeerConnection.ontrack = (event) => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
        console.log('Remote track received (caller)');
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
}

// Setup Receiver Connection
function setupReceiverConnection() {
    remotePeerConnection = new RTCPeerConnection();

    localStream.getTracks().forEach(track => remotePeerConnection.addTrack(track, localStream));

    remotePeerConnection.ontrack = (event) => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
        statusMessage.innerHTML = 'Call connected';
        console.log('Remote track received (receiver)');
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
}

// Show Call Controls (Mute, End Call)
function showCallControls() {
    muteButton.classList.remove('hidden');
    endCallButton.classList.remove('hidden');
}

// Clean up and reset UI after the call ends
function cleanupCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    localPeerConnection?.close();
    remotePeerConnection?.close();
    resetUI();
}

// Reset UI after the call ends or is rejected
function resetUI() {
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    acceptCallButton.classList.add('hidden');
    rejectCallButton.classList.add('hidden');
    muteButton.classList.add('hidden');
    endCallButton.classList.add('hidden');
    statusMessage.innerHTML = '';
}
