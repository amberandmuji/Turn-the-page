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
  liveDot: $('live-dot'),
  previewText: $('preview-text'),
  foldBtn: $('fold-btn'),
  settingsBtn: $('settings-btn'),
  settings: $('settings'),
  sensitivity: $('sensitivity'),
  sensitivityValue: $('sensitivity-value'),
  spread: $('opt-spread'),
  sound: $('opt-sound'),
  flash: $('opt-flash'),
  showPreview: $('opt-preview'),
  swap: $('opt-swap'),
  noSwap: $('opt-noswap'),
  single: $('opt-single'),
  volume: $('volume'),
  volumeValue: $('volume-value'),
  gestureHint: $('gesture-hint'),
  help: $('help'),
  resume: $('resume'),
  resumeText: $('resume-text'),
  resumeRestart: $('resume-restart'),
  helpBtn: $('help-btn'),
  helpClose: $('help-close'),
};

// Saved under a new key so everyone starts with the two-page spread on.
const settings = {
  sensitivity: 5,
  spread: true,
  swap: false,
  sound: true,
  volume: 0.7,
  flash: true,
  preview: true,
  ...load('settings-v2', {}),
};

// The spread needs room: on a narrow window, show one page even when it's on.
const SPREAD_MIN_WIDTH = 700;
const wantSpread = () => settings.spread && els.stage.clientWidth >= SPREAD_MIN_WIDTH;

const reader = new Reader(els.pages, (label) => {
  els.pageLabel.textContent = label;
  // Grey out the arrows at the first and last page.
  els.prevBtn.disabled = reader.page <= 1;
  els.nextBtn.disabled = reader.page + reader.step > reader.pageCount;
});
const detector = new GestureDetector({ sensitivity: settings.sensitivity, swapDirection: settings.swap });
const camera = new HandCamera(els.video, els.overlay, onFrame);
let gestureState = 'off'; // off | loading | on

// ---------- Settings ----------
function applySettings() {
  els.sensitivity.value = settings.sensitivity;
  els.sensitivityValue.textContent = settings.sensitivity;
  els.spread.checked = settings.spread;
  els.single.checked = !settings.spread;
  els.sound.checked = settings.sound;
  els.volume.value = Math.round(settings.volume * 100);
  els.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
  els.volume.disabled = !settings.sound;
  els.volume.style.setProperty('--fill', `${settings.volume * 100}%`);
  els.sensitivity.style.setProperty('--fill', `${((settings.sensitivity - 1) / 9) * 100}%`);
  els.flash.checked = settings.flash;
  els.showPreview.checked = settings.preview;
  els.swap.checked = settings.swap;
  els.noSwap.checked = !settings.swap;
  detector.setSwapDirection(settings.swap);
  els.preview.hidden = !(settings.preview && gestureState === 'on');
  els.previewText.textContent = settings.swap ? 'Swipe → for next page' : 'Swipe ← for next page';
  detector.setSensitivity(settings.sensitivity);
}

function updateSetting(key, value) {
  settings[key] = value;
  save('settings-v2', settings);
  applySettings();
}

els.sensitivity.addEventListener('input', () => updateSetting('sensitivity', Number(els.sensitivity.value)));
for (const radio of [els.spread, els.single]) {
  radio.addEventListener('change', async () => {
    updateSetting('spread', els.spread.checked);
    await reader.setSpread(wantSpread());
  });
}
for (const radio of [els.swap, els.noSwap]) {
  radio.addEventListener('change', () => updateSetting('swap', els.swap.checked));
}
els.volume.addEventListener('input', () => updateSetting('volume', Number(els.volume.value) / 100));
// Let go of the volume slider to hear how loud a page turn will be.
els.volume.addEventListener('change', () => playTurnSound('next', settings.volume));
els.sound.addEventListener('change', () => updateSetting('sound', els.sound.checked));
els.flash.addEventListener('change', () => updateSetting('flash', els.flash.checked));
els.showPreview.addEventListener('change', () => updateSetting('preview', els.showPreview.checked));

// The panel is a popover: the browser handles opening, Escape and clicking outside.
els.settings.addEventListener('toggle', (e) => {
  els.settingsBtn.setAttribute('aria-expanded', String(e.newState === 'open'));
});

// ---------- Help ----------
let helpReturnFocus = null;
function showHelp(show) {
  els.help.hidden = !show;
  if (show) {
    helpReturnFocus = document.activeElement;
    els.helpClose.focus();
  } else {
    save('seen-help', true);
    helpReturnFocus?.focus?.();
  }
}
els.helpBtn.addEventListener('click', () => showHelp(true));
els.helpClose.addEventListener('click', () => showHelp(false));
// Close with Escape or a click outside the card.
els.help.addEventListener('click', (e) => { if (e.target === els.help) showHelp(false); });
els.help.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') showHelp(false);
  if (e.key === 'Tab') { e.preventDefault(); els.helpClose.focus(); } // keep focus inside
});
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
    reader.spread = wantSpread();
    await reader.open(file);
    showResume();
    document.title = `${file.name.replace(/\.pdf$/i, '')} · Turn the page`;
    setStatus(gestureState === 'on' ? 'Swipe to turn the page' : '');
  } catch (err) {
    console.error(err);
    els.empty.hidden = false;
    setStatus('Couldn\'t open that PDF.');
  }
}

// ---------- Bookmark ----------
// The reader saves the page for each book as you go. When a book reopens
// part-way through, say so, and offer to go back to the start.
let resumeTimer;
function hideResume() {
  clearTimeout(resumeTimer);
  els.resume.classList.remove('show');
  resumeTimer = setTimeout(() => { els.resume.hidden = true; }, 200);
}
function showResume() {
  clearTimeout(resumeTimer);
  if (reader.page <= 1) { els.resume.hidden = true; return; }
  els.resumeText.textContent = `Picked up where you left off, on page ${reader.page}.`;
  els.resume.hidden = false;
  requestAnimationFrame(() => els.resume.classList.add('show'));
  resumeTimer = setTimeout(hideResume, 8000);
}
els.resumeRestart.addEventListener('click', async () => {
  hideResume();
  reader.page = 1;
  await reader.render();
});

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
// Shows which way a gesture was read, so a wrong turn is easy to spot.
let hintTimer;
function showGestureHint(direction) {
  els.gestureHint.textContent = direction === 'next' ? '← Next' : 'Previous →';
  els.gestureHint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => els.gestureHint.classList.remove('show'), 900);
}

async function turn(direction) {
  const moved = direction === 'next' ? await reader.next() : await reader.prev();
  if (!moved) return;
  if (!els.resume.hidden) hideResume();
  if (settings.sound) playTurnSound(direction, settings.volume);
  if (settings.flash) flashEdge(els.stage, direction);
}

els.prevBtn.addEventListener('click', () => turn('prev'));
els.nextBtn.addEventListener('click', () => turn('next'));

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (!els.help.hidden) return; // the how-to card handles its own keys
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

// Refit the page whenever the reading area changes size (window resizes).
let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => reader.setSpread(wantSpread()), 150);
}).observe(els.stage);

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
  els.liveDot.style.setProperty('--progress', 0);
  els.liveDot.classList.remove('fist', 'hand');
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
  const fist = detector.fistProgress(t);
  els.liveDot.style.setProperty('--progress', fist);
  els.liveDot.classList.toggle('fist', fist > 0);
  els.liveDot.classList.toggle('hand', !!landmarks);
  if (action === 'pause') stopGestures('fist');
  else if (action === 'down') setFolded(true);
  else if (action === 'up') setFolded(false);
  else if (action) {
    showGestureHint(action);
    tickDot();
    turn(action);
  }
}

// ---------- Camera window ----------
// Folds into a small pill so it doesn't cover the page. The button doesn't
// take keyboard focus, so the arrow keys keep turning pages.
function setFolded(on, remember = true) {
  els.preview.classList.toggle('folded', on);
  els.foldBtn.setAttribute('aria-expanded', String(!on));
  els.foldBtn.setAttribute('aria-label', on ? 'Show camera' : 'Minimize');
  els.foldBtn.title = on ? 'Show camera (or swipe up)' : 'Minimize (or swipe down)';
  if (remember) save('preview-folded', on);
}
els.foldBtn.addEventListener('pointerdown', (e) => e.preventDefault());
els.foldBtn.addEventListener('click', () => setFolded(!els.preview.classList.contains('folded')));
setFolded(load('preview-folded', false), false);

function tickDot() {
  els.liveDot.classList.remove('turn');
  void els.liveDot.offsetWidth; // restart the animation
  els.liveDot.classList.add('turn');
}

// Stop the camera when the tab is hidden, so it is never on in the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gestureState === 'on') stopGestures();
});

applySettings();
setGestureState('off');
