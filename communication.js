// ...existing code replaced...
const serverUrl = "https://notez-server.onrender.com";
const socket = new WebSocket(serverUrl);

const peerConnection = new RTCPeerConnection();

let dataChannel;
let code, pass;
let candidateBuffer = [];

// Signaling server open
socket.onopen = () => console.log("Connected to server");

// Handle server messages
socket.onmessage = async (evt) => {
  let data = evt.data;
  if (data instanceof Blob) {
    data = await data.text().catch(console.error);
  }
  try {
    data = JSON.parse(data);
  } catch (err) {
    console.error("JSON parse error:", err);
    return;
  }
  console.log("Received:", data);

  // Offer
  if (data.type === "offer") {
    await peerConnection.setRemoteDescription(data.sdp);
    flushCandidateBuffer();

    if (peerConnection.signalingState === "have-remote-offer") {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "answer", sdp: peerConnection.localDescription, code, pass }));
    }
  }

  // Answer
  else if (data.type === "answer") {
    if (peerConnection.signalingState === "have-local-offer") {
      await peerConnection.setRemoteDescription(data.sdp);
      flushCandidateBuffer();
    }
  }

  // ICE candidate
  else if (data.type === "candidate") {
    if (!peerConnection.remoteDescription) {
      candidateBuffer.push(data.candidate);
    } else {
      peerConnection.addIceCandidate(data.candidate).catch(console.error);
    }
  }

  // Match found
  else if (data.type === "match") {
    console.log("Match found, initiator?", data.initiator);
    // If initiator, do something as needed
  } else if (data.type === "newroom") {
    console.log("New room created");
  }
};

// Send local ICE candidates to the server
peerConnection.onicecandidate = (evt) => {
  if (evt.candidate) {
    socket.send(JSON.stringify({ type: "candidate", candidate: evt.candidate }));
  }
};

// If the other side creates a data channel
peerConnection.ondatachannel = (evt) => {
  dataChannel = evt.channel;
  dataChannel.onopen = () => console.log("Data channel open (Receiver)");
  dataChannel.onmessage = (msg) => console.log("Receiver got:", msg.data);
};

// Flush buffered candidates
function flushCandidateBuffer() {
  candidateBuffer.forEach((cand) => {
    peerConnection.addIceCandidate(cand).catch(console.error);
  });
  candidateBuffer = [];
}

// Initiator handshake
function startHandshake(inputCode, inputPass) {
  code = inputCode;
  pass = inputPass;
  dataChannel = peerConnection.createDataChannel("channel");
  dataChannel.onopen = () => console.log("Data channel open (Initiator)");
  dataChannel.onmessage = (msg) => console.log("Initiator got:", msg.data);

  peerConnection.createOffer()
    .then((offer) => peerConnection.setLocalDescription(offer))
    .then(() => {
      socket.send(JSON.stringify({ type: "probe", data: { code, pass } }));
    })
    .catch(console.error);
}