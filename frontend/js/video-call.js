// WebRTC Video Call with Backend Signaling
console.log('✅ video-call.js loaded');

// api is already created globally in api.js, so we don't need to create it again
const urlParams = new URLSearchParams(window.location.search);
const consultationId = urlParams.get('consultation_id');

console.log('Consultation ID:', consultationId);

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let videoRoomId = null;
let isMuted = false;
let isVideoOff = false;
let signalingInterval = null;
let processedSignals = new Set(); // Track processed signal timestamps to avoid duplicates
let hasReceivedOffer = false;
let hasReceivedAnswer = false;

// Initialize video call with WebRTC
async function initializeVideoCall() {
    console.log('🎬 Starting video call initialization...');

    try {
        showLoading(true);
        updateStatus('connecting', 'Requesting camera access...');
        console.log('📹 Requesting camera and microphone...');

        // Step 1: Get local media stream
        console.log('📹 Calling getUserMedia...');
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        console.log('✅ Got local media stream!', localStream);
        console.log('Video tracks:', localStream.getVideoTracks());
        console.log('Audio tracks:', localStream.getAudioTracks());

        // Display local video
        const localVideo = document.getElementById('localVideo');
        console.log('Local video element:', localVideo);

        if (localVideo) {
            localVideo.srcObject = localStream;
            console.log('✅ Set srcObject for local video');

            try {
                await localVideo.play();
                console.log('✅ Local video playing');
            } catch (playError) {
                console.error('❌ Error playing local video:', playError);
            }

            const placeholder = document.getElementById('localPlaceholder');
            if (placeholder) {
                placeholder.style.display = 'none';
                console.log('✅ Local placeholder hidden');
            }
        } else {
            console.error('❌ Local video element not found!');
        }

        // Step 2: Start video call on backend
        updateStatus('connecting', 'Connecting to video room...');
        console.log('🔗 Starting video call on backend...');

        try {
            const response = await api.request(`/consultations/${consultationId}/video/start`, {
                method: 'POST'
            });

            videoRoomId = response.video_room_id;
            console.log('✅ Video room ID:', videoRoomId);

            // Step 3: Initialize WebRTC peer connection
            await initializePeerConnection();

            // Step 4: Determine who creates the offer BEFORE starting polling
            // Get current user info to decide who initiates
            const userInfo = JSON.parse(localStorage.getItem('user') || '{}');
            const userId = userInfo.id;

            console.log('👤 Current user ID:', userId);

            // Use user ID to determine who creates offer (odd IDs create offers)
            // This ensures only one user creates the offer
            const shouldCreateOffer = userId % 2 === 1;

            if (shouldCreateOffer) {
                console.log('📤 Creating offer (user ID is odd)...');
                // Create and send offer FIRST, before starting polling
                await createAndSendOffer();
                console.log('✅ Offer sent, now starting polling...');
                // Now start polling for answer and ICE candidates
                startSignalingPolling();
            } else {
                console.log('⏳ Waiting for offer (user ID is even)...');
                // Start polling immediately to receive offer
                startSignalingPolling();
            }

            updateStatus('connected', 'Waiting for other participant...');
        } catch (apiError) {
            console.error('❌ Backend API error:', apiError);
            console.error('This is OK - camera still works, just no peer connection');
            updateStatus('connected', '⚠️ Camera working, but backend connection failed');
        }

        showLoading(false);
        console.log('🎉 Video call initialized (at least camera is working)!');

    } catch (error) {
        console.error('❌ Error initializing video call:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        showLoading(false);
        updateStatus('disconnected', '❌ Failed: ' + error.message);

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            alert('❌ Camera access denied!\n\nPlease:\n1. Click camera icon in address bar\n2. Allow camera and microphone\n3. Refresh the page');
        } else if (error.name === 'NotFoundError') {
            alert('❌ No camera found!\n\nPlease connect a camera and try again.');
        } else {
            alert('❌ Error: ' + error.message + '\n\nCheck browser console (F12) for details.');
        }
    }
}

// Initialize WebRTC peer connection
async function initializePeerConnection() {
    console.log('🔧 Initializing peer connection...');

    peerConnection = new RTCPeerConnection(configuration);

    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
        console.log('➕ Added local track:', track.kind);
    });

    // Handle incoming tracks from remote peer
    peerConnection.ontrack = (event) => {
        console.log('📥 Received remote track:', event.track.kind);

        if (!remoteStream) {
            remoteStream = new MediaStream();
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                console.log('✅ Set remote video srcObject');
            }
        }

        remoteStream.addTrack(event.track);
        console.log('✅ Added track to remote stream. Total tracks:', remoteStream.getTracks().length);

        // Try to play video after each track is added
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo && remoteStream.getTracks().length > 0) {
            console.log('🎬 Attempting to play remote video...');

            // Try to play immediately
            remoteVideo.play().then(() => {
                console.log('✅ Remote video playing');
                const placeholder = document.getElementById('remotePlaceholder');
                if (placeholder) {
                    placeholder.style.display = 'none';
                    console.log('✅ Remote placeholder hidden');
                }
            }).catch(err => {
                console.log('⚠️ Play failed, waiting for metadata...', err.message);

                // If immediate play fails, wait for metadata
                remoteVideo.onloadedmetadata = () => {
                    console.log('📺 Remote video metadata loaded');
                    remoteVideo.play().then(() => {
                        console.log('✅ Remote video playing (after metadata)');
                        const placeholder = document.getElementById('remotePlaceholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                            console.log('✅ Remote placeholder hidden');
                        }
                    }).catch(err2 => {
                        console.error('❌ Error playing remote video:', err2);
                    });
                };
            });
        }

        updateStatus('connected', '✅ Connected! Call in progress');
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('🧊 New ICE candidate:', event.candidate.type);
            sendSignal('ice-candidate', event.candidate);
        }
    };

    // Handle connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log('🔌 ICE connection state:', peerConnection.iceConnectionState);

        switch (peerConnection.iceConnectionState) {
            case 'connected':
            case 'completed':
                updateStatus('connected', '✅ Connected! Call in progress');
                break;
            case 'disconnected':
                updateStatus('connecting', '⚠️ Connection interrupted...');
                break;
            case 'failed':
                updateStatus('disconnected', '❌ Connection failed');
                break;
            case 'closed':
                updateStatus('disconnected', 'Call ended');
                break;
        }
    };

    console.log('✅ Peer connection initialized');
}

// Create and send offer
async function createAndSendOffer() {
    console.log('📤 Creating offer...');

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    console.log('✅ Offer created, sending to backend...');
    await sendSignal('offer', offer);
}

// Send signaling data to backend
async function sendSignal(type, data) {
    try {
        await api.request(`/consultations/${consultationId}/video/signal`, {
            method: 'POST',
            body: JSON.stringify({ type, data })
        });
        console.log(`✅ Sent ${type} signal to backend`);
    } catch (error) {
        console.error(`❌ Failed to send ${type} signal:`, error);
    }
}

// Poll for signals from other peer
function startSignalingPolling() {
    console.log('🔄 Starting signaling polling...');

    signalingInterval = setInterval(async () => {
        try {
            const response = await api.request(`/consultations/${consultationId}/video/signals`);
            const signals = response.signals || [];

            for (const signal of signals) {
                await handleSignal(signal);
            }
        } catch (error) {
            console.error('❌ Signaling poll error:', error);
        }
    }, 1000); // Poll every second
}

// Handle incoming signals
async function handleSignal(signal) {
    try {
        // Create unique ID for this signal to avoid processing duplicates
        const signalId = `${signal.type}-${signal.timestamp}-${signal.from_user_id}`;

        if (processedSignals.has(signalId)) {
            // Already processed this signal, skip it
            return;
        }

        console.log(`📥 Received ${signal.type} signal`);
        processedSignals.add(signalId);

        if (signal.type === 'offer' && !hasReceivedOffer) {
            // Received offer from other peer
            hasReceivedOffer = true;
            console.log('📥 Processing offer...');
            console.log('Peer connection state before offer:', peerConnection.signalingState);

            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
            console.log('Peer connection state after offer:', peerConnection.signalingState);

            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await sendSignal('answer', answer);
            console.log('✅ Sent answer');

        } else if (signal.type === 'answer' && !hasReceivedAnswer) {
            // Received answer from other peer
            hasReceivedAnswer = true;
            console.log('📥 Processing answer...');
            console.log('Peer connection state before answer:', peerConnection.signalingState);

            if (peerConnection.signalingState === 'have-local-offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data));
                console.log('✅ Answer processed');
                console.log('Peer connection state after answer:', peerConnection.signalingState);
            } else {
                console.warn('⚠️ Ignoring answer - wrong state:', peerConnection.signalingState);
            }

        } else if (signal.type === 'ice-candidate') {
            // Received ICE candidate
            console.log('📥 Processing ICE candidate...');

            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.data));
                console.log('✅ ICE candidate added');
            } else {
                console.warn('⚠️ Ignoring ICE candidate - no remote description yet');
            }
        } else if (signal.type === 'chat') {
            // Received chat message
            console.log('📥 Received chat message');
            displayReceivedMessage(signal.data.message);
        }
    } catch (error) {
        console.error(`❌ Error handling ${signal.type}:`, error);
    }
}


function toggleMute() {
    console.log('🔇 Toggle mute clicked');
    if (!localStream) {
        console.error('❌ No local stream!');
        return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMuted = !audioTrack.enabled;

        const muteBtn = document.getElementById('muteBtn');
        const muteIcon = document.getElementById('muteIcon');
        const muteText = document.getElementById('muteText');

        if (muteBtn) muteBtn.classList.toggle('muted', isMuted);
        if (muteIcon) muteIcon.textContent = isMuted ? '🔇' : '🎤';
        if (muteText) muteText.textContent = isMuted ? 'Unmute' : 'Mute';

        console.log('✅ Muted:', isMuted);
    } else {
        console.error('❌ No audio track!');
    }
}

function toggleVideo() {
    console.log('📹 Toggle video clicked');
    if (!localStream) {
        console.error('❌ No local stream!');
        return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isVideoOff = !videoTrack.enabled;

        const videoBtn = document.getElementById('videoBtn');
        const videoIcon = document.getElementById('videoIcon');
        const videoText = document.getElementById('videoText');

        if (videoBtn) videoBtn.classList.toggle('off', isVideoOff);
        if (videoIcon) videoIcon.textContent = isVideoOff ? '📹' : '📹';
        if (videoText) videoText.textContent = isVideoOff ? 'Start Video' : 'Stop Video';

        console.log('✅ Video off:', isVideoOff);
    } else {
        console.error('❌ No video track!');
    }
}

async function endCall() {
    console.log('📞 End call clicked');

    if (!confirm('End the video call?')) {
        console.log('❌ User cancelled');
        return;
    }

    try {
        // Stop signaling polling
        if (signalingInterval) {
            clearInterval(signalingInterval);
            console.log('🛑 Stopped signaling polling');
        }

        // Close peer connection
        if (peerConnection) {
            peerConnection.close();
            console.log('🛑 Closed peer connection');
        }

        // Stop all local tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                console.log('🛑 Stopped track:', track.kind);
            });
        }

        // Reset state
        processedSignals.clear();
        hasReceivedOffer = false;
        hasReceivedAnswer = false;

        // Notify backend
        await api.request(`/consultations/${consultationId}/video/end`, {
            method: 'POST'
        });
        console.log('✅ Notified backend of call end');

    } catch (error) {
        console.error('❌ Error ending call:', error);
    }

    // Redirect back
    console.log('↩️ Redirecting to dashboard...');
    window.location.href = 'user-dashboard.html';
}

async function sendChatMessage() {
    console.log('💬 Send chat message');
    const input = document.getElementById('chatInput');
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Clear empty state
    const emptyState = chatMessages.querySelector('.chat-empty');
    if (emptyState) {
        chatMessages.innerHTML = '';
    }

    // Display message locally as "sent"
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message sent';
    messageDiv.innerHTML = `<strong>You</strong><div>${escapeHtml(message)}</div>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    input.value = '';
    console.log('✅ Message displayed locally:', message);

    // Send message to other peer via signaling
    try {
        await sendSignal('chat', { message: message, timestamp: new Date().toISOString() });
        console.log('✅ Message sent to backend');
    } catch (error) {
        console.error('❌ Failed to send chat message:', error);
    }
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

function displayReceivedMessage(message) {
    console.log('💬 Displaying received message:', message);
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    // Clear empty state
    const emptyState = chatMessages.querySelector('.chat-empty');
    if (emptyState) {
        chatMessages.innerHTML = '';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message received';
    messageDiv.innerHTML = `<strong>Other Participant</strong><div>${escapeHtml(message)}</div>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    console.log('✅ Message displayed');
}

// Chat is always visible in the new layout - no toggle needed

function updateStatus(state, text) {
    console.log('📊 Status update:', state, text);
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (dot) {
        dot.className = `status-dot ${state}`;
    }
    if (statusText) {
        statusText.textContent = text;
    }
}

function showLoading(show) {
    console.log('🔄 showLoading called:', show);
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
        console.log('✅ Loading overlay updated');
    } else {
        console.warn('⚠️ Loading overlay element not found');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start when page loads
console.log('🚀 Setting up page load listener...');
window.addEventListener('load', () => {
    console.log('📄 Page loaded! Starting video call...');
    initializeVideoCall();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    console.log('👋 Page unloading, cleaning up...');

    if (signalingInterval) {
        clearInterval(signalingInterval);
    }

    if (peerConnection) {
        peerConnection.close();
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});

console.log('✅ video-call.js fully loaded and ready!');