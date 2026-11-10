import { DEFAULT_SETTINGS, isKindleUrl } from './settings.js';
import { checkForUpdate, installedList } from './updates.js';

const $ = (id) => document.getElementById(id);
const els = {
  dot: $('dot'), status: $('status'), toggle: $('toggle'), notKindle: $('not-kindle'),
  sensitivity: $('sensitivity'), sensitivityValue: $('sensitivity-value'),
  rtl: $('dir-rtl'), ltr: $('dir-ltr'),
  volume: $('volume'), volumeValue: $('volume-value'),
  flash: $('flash'), preview: $('preview'),
  testPrev: $('test-prev'), testNext: $('test-next'), testResult: $('test-result'),
};

let state = { mode: 'off' };
let settings = { ...DEFAULT_SETTINGS };
let tab = null;
const onKindle = () => tab && isKindleUrl(tab.url);

const REASONS = {
  fist: 'Paused by your fist. The camera is off.',
  hidden: 'Stopped because you left the Kindle tab.',
  closed: 'Stopped because the Kindle tab closed.',
  left: 'Stopped because the tab left Kindle.',
  'needs-camera': 'Waiting for camera permission in the new tab.',
};

function render() {
  const otherTab = state.mode !== 'off' && tab && state.tabId !== tab.id;
  els.dot.className = `dot ${state.mode}`;
  els.status.textContent = state.mode === 'on'
    ? (otherTab ? 'Gestures are on in another Kindle tab' : 'Gestures are on. Swipe to turn.')
    : state.mode === 'starting'
      ? 'Starting the camera…'
      : state.error || REASONS[state.reason] || 'Gestures are off';
  els.toggle.textContent = state.mode === 'off' ? 'Start gestures' : 'Stop gestures';
  els.toggle.classList.toggle('active', state.mode !== 'off');
  els.toggle.disabled = state.mode === 'off' && !onKindle();
  els.notKindle.hidden = state.mode !== 'off' || onKindle();
  els.testPrev.disabled = els.testNext.disabled = !onKindle();

  els.sensitivity.value = settings.sensitivity;
  els.sensitivityValue.textContent = settings.sensitivity;
  els.rtl.checked = !settings.swap;
  els.ltr.checked = settings.swap;
  els.volume.value = settings.volume;
  els.volumeValue.textContent = settings.volume > 0 ? `${Math.round(settings.volume * 100)}%` : 'Off';
  els.flash.checked = settings.flash;
  els.preview.checked = settings.preview;
}

async function save(patch) {
  settings = { ...settings, ...patch };
  render();
  await chrome.storage.local.set({ settings });
  chrome.runtime.sendMessage({ type: 'settings-changed' });
}

els.toggle.addEventListener('click', () => {
  chrome.runtime.sendMessage(state.mode === 'off' ? { type: 'start', tabId: tab.id } : { type: 'stop' });
});
els.sensitivity.addEventListener('input', () => save({ sensitivity: Number(els.sensitivity.value) }));
els.rtl.addEventListener('change', () => save({ swap: false }));
els.ltr.addEventListener('change', () => save({ swap: true }));
els.volume.addEventListener('input', () => save({ volume: Number(els.volume.value) }));
els.flash.addEventListener('change', () => save({ flash: els.flash.checked }));
els.preview.addEventListener('change', () => save({ preview: els.preview.checked }));

async function testTurn(dir) {
  els.testResult.textContent = 'Turning…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'test-turn', dir, tabId: tab.id });
    els.testResult.textContent = result?.ok
      ? 'It worked. The page turned.'
      : 'The page didn\'t seem to change. Click inside the book once, then try again.';
  } catch {
    els.testResult.textContent = 'Couldn\'t reach the Kindle tab. Reload it and try again.';
  }
}
els.testPrev.addEventListener('click', () => testTurn('prev'));
els.testNext.addEventListener('click', () => testTurn('next'));

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.state) {
    state = changes.state.newValue || { mode: 'off' };
    render();
  }
});

[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
({ state, settings } = await chrome.runtime.sendMessage({ type: 'get-state' }));
render();

// Version, and a quiet check for a newer one.
const openUpdater = () => chrome.tabs.create({ url: 'update.html' });
$('update').addEventListener('click', openUpdater);
installedList().then(async (installed) => {
  const { justUpdated } = await chrome.storage.local.get('justUpdated');
  $('version').textContent = justUpdated === installed.version
    ? `Updated to version ${installed.version}`
    : `Version ${installed.version}`;
  if (justUpdated) chrome.storage.local.remove('justUpdated');
  const update = await checkForUpdate();
  if (update.available) {
    $('update').textContent = 'Update available';
    $('update').classList.add('available');
  }
}).catch(() => {});
