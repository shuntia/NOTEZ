const serverUrl = "wss://notez-server.onrender.com";
const socket = new WebSocket(serverUrl);

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});

let dataChannel;
let code, pass;
let candidateBuffer = [];

// On open
socket.onopen = () => console.log("Connected to server");

// Receive messages
socket.onmessage = async (evt) => {
  let data = evt.data;
  if (data instanceof Blob) {
    data = await data.text().catch(console.error);
  }
  try {
    data = JSON.parse(data);
  } catch (error) {
    console.error("JSON parse error:", error);
    return;
  }
  console.log("Received:", data);

  switch (data.type) {
    case "match":
      console.log("Match found, initiator?", data.initiator);
      // Only initiator calls startHandshake
      if (data.initiator) {
        startHandshake(code, pass);
      }
      break;

    case "newroom":
      console.log("New room created");
      break;

    case "offer":
      await peerConnection.setRemoteDescription(data.sdp);
      flushCandidateBuffer();
      if (peerConnection.signalingState === "have-remote-offer") {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.send(
          JSON.stringify({
            type: "answer",
            sdp: peerConnection.localDescription,
            code,
            pass
          })
        );
      }
      break;

    case "answer":
      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(data.sdp);
        flushCandidateBuffer();
      }
      break;

    case "candidate":
      if (!peerConnection.remoteDescription) {
        candidateBuffer.push(data.candidate);
      } else {
        peerConnection.addIceCandidate(data.candidate).catch(console.error);
      }
      break;
  }
};

// Send ICE candidates
peerConnection.onicecandidate = (evt) => {
  if (evt.candidate) {
    socket.send(JSON.stringify({ type: "candidate", candidate: evt.candidate }));
  }
};

// If other side creates a data channel
peerConnection.ondatachannel = (evt) => {
  dataChannel = evt.channel;
  dataChannel.onopen = () => console.log("Data channel open (Receiver)");
  dataChannel.onmessage = (msg) => console.log("Receiver got:", msg.data);
};

// Initiator handshake
function startHandshake(inputCode, inputPass) {
  code = inputCode;
  pass = inputPass;
  dataChannel = peerConnection.createDataChannel("channel");
  dataChannel.onopen = () => console.log("Data channel open (Initiator)");
  dataChannel.onmessage = (msg) => console.log("Initiator got:", msg.data);

  peerConnection
    .createOffer()
    .then((offer) => peerConnection.setLocalDescription(offer))
    .then(() =>
      socket.send(JSON.stringify({ type: "probe", data: { code, pass } }))
    )
    .catch(console.error);
}

// Process buffered candidates
function flushCandidateBuffer() {
  candidateBuffer.forEach((cand) => {
    peerConnection.addIceCandidate(cand).catch(console.error);
  });
  candidateBuffer = [];
}