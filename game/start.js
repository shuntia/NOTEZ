// ...existing code replaced...
function handshakeWithCode() {
  const codeValue = document.getElementById("code").value;
  const passValue = document.getElementById("pass").value;
  startHandshake(codeValue, passValue);
}