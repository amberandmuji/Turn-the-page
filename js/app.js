import { Reader } from './reader.js';
import { HandCamera } from './camera.js';
import { GestureDetector, palmCentre } from './gestures.js';
import { playTurnSound, flashEdge } from './feedback.js';
import { load, save } from './storage.js';

const $ = (id) => document.getElementById(id);

const els = {
  stage: $('stage'),
  pages: $('pages'),
  empty: $('empty'),
  fileInput: $('file-input'),
  openBtn: $('open-btn'),
  emptyOpenBtn: $('empty-open-btn'),
  prevBtn: $('prev-btn'),
  nextBtn: $('next-btn'),
  pageLabel: $('page-label'),
  gestureBtn: $('gesture-btn'),
  status: $('status'),
  preview: $('preview'),
  video: $('video'),
  overlay: $('overlay'),
  fistRing: $('fist-ring'),
  settingsBtn: $('settings-btn'),
  settings: $('settings'),
  sensitivity: $('sensitivity'),
  sensitivityValue: $('sensitivity-value'),
  spread: $('opt-spread'),
  sound: $('opt-sound'),
  flash: $('opt-flash'),
  showPreview: $('opt-preview'),
  help: $('help'),
  helpBtn: $('help-btn'),
  helpClose: $('help-close'),
};

const settings = {
  sensitivity: 5,
  spread: false,
  sound: true,
  flash: true,
  preview: true,
  ...load('settings', {}),
};

const reader = new Reader(els.pages, (label) => {
  els.pageLabel.textContent = label;
});
const detector = new GestureDetector({ sensitivity: settings.sensitivity });
const camera = new HandCamera(els.video, els.overlay, onFrame);
let gestureState = 'off'; // off | loading | on

// ---------- Settings ----------
function applySettings() {
  els.sensitivity.value = settings.sensitivity;
  els.sensitivityValue.textContent = settings.sensitivity;
  els.spread.checked = settings.spread;
  els.sound.checked = settings.sound;
  els.flash.checked = settings.flash;
  els.showPreview.checked = settings.preview;
  els.preview.hidden = !(settings.preview && gestureState === 'on');
  detector.setSensitivity(settings.sensitivity);
}

function updateSetting(key, value) {
  settings[key] = value;
  save('settings', settings);
  applySettings();
}

els.sensitivity.addEventListener('input', () => updateSetting('sensitivity', Number(els.sensitivity.value)));
els.spread.addEventListener('change', async () => {
  updateSetting('spread', els.spread.checked);
  await reader.setSpread(settings.spread);
});
els.sound.addEventListener('change', () => updateSetting('sound', els.sound.checked));
els.flash.addEventListener('change', () => updateSetting('flash', els.flash.checked));
els.showPreview.addEventListener('change', () => updateSetting('preview', els.showPreview.checked));

els.settingsBtn.addEventListener('click', () => {
  els.settings.hidden = !els.settings.hidden;
  els.settingsBtn.setAttribute('aria-expanded', String(!els.settings.hidden));
});

// ---------- Help ----------
function showHelp(show) {
  els.help.hidden = !show;
  if (!show) save('seen-help', true);
}
els.helpBtn.addEventListener('click', () => showHelp(true));
els.helpClose.addEventListener('click', () => showHelp(false));
if (!load('seen-help', false)) showHelp(true);

// ---------- Opening files ----------
async function openFile(file) {
  if (!file) return;
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('That file isn\'t a PDF.');
    return;
  }
  try {
    setStatus(`Opening ${file.name}…`);
    els.empty.hidden = true;
    await reader.setSpread(settings.spread);
    await reader.open(file);
    document.title = `${file.name.replace(/\.pdf$/i, '')} · Turn the page`;
    setStatus(gestureState === 'on' ? 'Swipe to turn the page' : '');
  } catch (err) {
    console.error(err);
    els.empty.hidden = false;
    setStatus('Couldn\'t open that PDF.');
  }
}

const pickFile = () => els.fileInput.click();
els.openBtn.addEventListener('click', pickFile);
els.emptyOpenBtn.addEventListener('click', pickFile);
els.fileInput.addEventListener('change', () => openFile(els.fileInput.files[0]));

els.stage.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.stage.classList.add('dragging');
});
els.stage.addEventListener('dragleave', () => els.stage.classList.remove('dragging'));
els.stage.addEventListener('drop', (e) => {
  e.preventDefault();
  els.stage.classList.remove('dragging');
  openFile(e.dataTransfer.files[0]);
});

// ---------- Turning pages ----------
async function turn(direction) {
  const moved = direction === 'next' ? await reader.next() : await reader.prev();
  if (!moved) return;
  if (settings.sound) playTurnSound(direction);
  if (settings.flash) flashEdge(els.stage, direction);
}

els.prevBtn.addEventListener('click', () => turn('prev'));
els.nextBtn.addEventListener('click', () => turn('next'));

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
    e.preventDefault();
    turn('next');
  } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
    e.preventDefault();
    turn('prev');
  } else if (e.key === 'g' || e.key === 'G') {
    toggleGestures();
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => reader.render(), 150);
});

// ---------- Gestures ----------
function setStatus(text) {
  els.status.textContent = text;
}

function setGestureState(state) {
  gestureState = state;
  const labels = { off: 'Start gestures', loading: 'Starting…', on: 'Stop gestures' };
  els.gestureBtn.textContent = labels[state];
  els.gestureBtn.disabled = state === 'loading';
  els.gestureBtn.classList.toggle('active', state === 'on');
  applySettings();
}

async function startGestures() {
  setGestureState('loading');
  setStatus('Loading hand tracking…');
  try {
    await camera.start();
    detector.reset();
    setGestureState('on');
    setStatus('Swipe to turn the page. Hold a fist to pause.');
  } catch (err) {
    console.error(err);
    camera.stop();
    setGestureState('off');
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    setStatus(denied
      ? 'Camera access was blocked. Allow it in the address bar, then try again.'
      : 'Couldn\'t start the camera or hand tracking.');
  }
}

function stopGestures(reason) {
  camera.stop();
  els.fistRing.style.setProperty('--progress', 0);
  setGestureState('off');
  setStatus(reason === 'fist'
    ? 'Paused, and the camera is off. Click Start gestures or press G to resume.'
    : '');
}

function toggleGestures() {
  if (gestureState === 'on') stopGestures();
  else if (gestureState === 'off') startGestures();
}
els.gestureBtn.addEventListener('click', toggleGestures);

function onFrame({ t, landmarks, gesture, score }) {
  const action = detector.update({ t, hand: palmCentre(landmarks), gesture, score });
  els.fistRing.style.setProperty('--progress', detector.fistProgress(t));
  if (action === 'pause') stopGestures('fist');
  else if (action) turn(action);
}

// Stop the camera when the tab is hidden, so it is never on in the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gestureState === 'on') stopGestures();
});

applySettings();
setGestureState('off');
