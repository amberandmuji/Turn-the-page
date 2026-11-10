// Asks for camera permission for the extension. Once given, the hidden
// camera page can use the camera without asking again.
const button = document.getElementById('allow');
const status = document.getElementById('status');

async function ask() {
  button.disabled = true;
  status.textContent = 'Waiting for your answer in the box at the top of the page…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    status.textContent = 'Thanks. Starting gestures in your Kindle tab…';
    chrome.runtime.sendMessage({ type: 'camera-allowed' });
  } catch (err) {
    button.disabled = false;
    status.textContent = err && err.name === 'NotAllowedError'
      ? 'The camera is blocked. Click the camera icon in the address bar, choose Allow, then click Allow camera again.'
      : 'No camera was found, or another app is using it.';
  }
}

button.addEventListener('click', ask);
ask();
