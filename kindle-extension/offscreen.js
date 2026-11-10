// Runs the camera and the hand tracker while gestures are on, using the same
// code as the PDF reader. It lives in a hidden page, which the extension
// closes to stop gestures, so the camera can never be left running.
import { GestureDetector, palmCentre } from './shared/js/gestures.js';
import { HandCamera } from './shared/js/camera.js';
import { playTurnSound } from './shared/js/feedback.js';

const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

let settings = null;
let detector = null;
let lastHandSent = 0;
let handVisible = false;

// Hidden pages get no animation frames, so poll with a timer instead
// (about 60 times a second; the camera code skips repeated video frames).
const camera = new HandCamera(
  document.getElementById('video'),
  document.getElementById('overlay'),
  onFrame,
  { schedule: (fn) => setTimeout(fn, 16) },
);

function onFrame({ t, landmarks, gesture, score }) {
  const action = detector.update({ t, hand: palmCentre(landmarks), gesture, score });
  if (action === 'next' || action === 'prev') playTurnSound(action, settings.volume);
  if (action) send({ type: 'action', action });

  // Hand preview for the Kindle page, about 12 times a second.
  if (landmarks || handVisible) {
    const now = performance.now();
    if (!landmarks || now - lastHandSent > 80) {
      lastHandSent = now;
      handVisible = !!landmarks;
      send({
        type: 'hand',
        points: landmarks ? landmarks.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]) : null,
        fist: detector.fistProgress(t),
      });
    }
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'settings') {
    settings = msg.settings;
    detector.setSensitivity(settings.sensitivity);
    detector.setSwapDirection(settings.swap);
  }
});

async function begin() {
  ({ settings } = await chrome.runtime.sendMessage({ type: 'offscreen-loaded' }));
  detector = new GestureDetector({ sensitivity: settings.sensitivity, swapDirection: settings.swap });
  try {
    await camera.start();
    send({ type: 'camera-on' });
  } catch (err) {
    console.error(err);
    camera.stop();
    send({ type: 'camera-error', name: err?.name || 'Error' });
  }
}

begin();
