// Replace with your Render server URL (use wss:// for secure connections)
const serverUrl = "https://notez-server.onrender.com";
const socket = new WebSocket(serverUrl);
const peerConnection = new RTCPeerConnection();
let dataChannel; // Will be set for both initiator and receiver
var code, pass;
let candidateBuffer = [];  // Buffer ICE candidates if remoteDescription isn’t set

socket.onopen = () => {
  console.log("Connected to signaling server");
};

socket.onmessage = async (message) => {
  let data = message.data;
  // Convert Blob to text if necessary
  if (data instanceof Blob) {
    try {
      data = await data.text();
    } catch (err) {
      console.error("Error converting Blob to text:", err);
      return;
    }
  }
  try {
    data = JSON.parse(data);
  } catch (err) {
    console.error("Error parsing JSON:", err);
    return;
  }
  console.log("Received message:", data);

  if (data.type === "offer") {
    console.log("Got offer");
    console.log("sdp:" + data.sdp.sdp);
    try {
      // Set remote description (this puts the connection in "have-remote-offer" state)
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

      // Flush any buffered ICE candidates now that remoteDescription is set
      flushCandidateBuffer();

      // Create an answer if we're not in a stable state already
      if (peerConnection.signalingState === "have-remote-offer") {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.send(JSON.stringify({
          type: "answer",
          sdp: peerConnection.localDescription,
          code: code,
          pass: pass
        }));
      } else {
        console.warn("Not creating answer because signaling state is", peerConnection.signalingState);
      }
    } catch (err) {
      console.error("Error processing offer:", err);
    }
  } else if (data.type === "answer") {
    console.log("Received answer");
    if (peerConnection.signalingState === "have-local-offer") {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        flushCandidateBuffer(); // Flush here
      } catch (err) {
        console.error("Error setting remote description for answer:", err);
      }
    } else {
      console.warn("Cannot set remote answer in state", peerConnection.signalingState);
    }
  } else if (data.type === "candidate") {
    // Buffer the candidate if remoteDescription hasn't been set yet
    if (!peerConnection.remoteDescription) {
      console.warn("Buffering ICE candidate until remote description is set");
      candidateBuffer.push(data.candidate);
    } else {
      try {
        const candidate = new RTCIceCandidate(data.candidate);
        await peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    }
  } else if (data.type === "match") {
    console.log("Found match!");
    // If initiator, you can send an offer probe once a match is found.
    socket.send(JSON.stringify({ type: "offer", sdp: peerConnection.localDescription }));
  } else if (data.type === "newroom") {
    console.log("Created new room!");
  }
};

// Flush buffered ICE candidates
function flushCandidateBuffer() {
  candidateBuffer.forEach(async (cand) => {
    try {
      const candidate = new RTCIceCandidate(cand);
      await peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error("Error adding buffered ICE candidate:", err);
    }
  });
  candidateBuffer = [];
}

// -- ICE Candidate Handling --
peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    socket.send(JSON.stringify({
      type: "candidate",
      candidate: event.candidate
    }));
  }
};

// -- Data Channel Setup for the Receiver --
peerConnection.ondatachannel = (event) => {
  dataChannel = event.channel;
  dataChannel.onopen = () => {
    console.log("Data channel open (Receiver)");
    dataChannel.send("Hello from B!");
  };
  dataChannel.onmessage = (e) => console.log("Receiver got message:", e.data);
  dataChannel.onclose = () => console.log("Data channel closed");
};

// -- Function to Start Handshake (Initiator) --
function startHandshake(inputCode, inputPass) {
  // Save code and password globally
  code = inputCode;
  pass = inputPass;

  // Create a data channel before making the offer.
  dataChannel = peerConnection.createDataChannel("game");
  dataChannel.onopen = () => {
    console.log("Data channel open (Initiator)");
    dataChannel.send("Hello from A!");
  };
  dataChannel.onmessage = (e) => console.log("Initiator got message:", e.data);
  dataChannel.onclose = () => console.log("Data channel closed");

  // Create an offer and then send a probe message with your code/pass
  peerConnection.createOffer()
    .then((offer) => peerConnection.setLocalDescription(offer))
    .then(() => {
      // Instead of sending the offer immediately here, you send a "probe"
      socket.send(JSON.stringify({
        type: "probe",
        data: { code: code, pass: pass }
      }));
    })
    .catch((err) => {
      console.error("Error creating offer:", err);
    });
}

