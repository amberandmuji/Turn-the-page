// The extension's coordinator.
//
// Gestures run in a hidden "offscreen" page (offscreen.html), which holds the
// camera and the hand tracker. That page only exists while gestures are on:
// stopping closes it, so the camera is guaranteed to be off.
//
// Page turns go to one Kindle Cloud Reader tab: the one gestures were started
// in. The content script in that tab (content.js) turns the page and shows the
// small status card.

import { loadSettings as getSettings, isKindleUrl } from './settings.js';

const OFFSCREEN_URL = 'offscreen.html';

// --- state -----------------------------------------------------------------
// { mode: 'off' | 'starting' | 'on', tabId, reason, error }
// Kept in session storage because Chrome can unload this worker at any time.

async function getState() {
  const { state } = await chrome.storage.session.get('state');
  return state || { mode: 'off', tabId: null };
}

async function setState(patch) {
  const state = { ...(await getState()), ...patch };
  await chrome.storage.session.set({ state });
  if (state.tabId) tellTab(state.tabId, { type: 'state', state });
  return state;
}

function tellTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

// --- offscreen page ---------------------------------------------------------

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

let creating = null;
async function openOffscreen() {
  if (await hasOffscreen()) return;
  creating = creating || chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Reads the webcam to recognise hand gestures, and plays the page-turn sound.',
  });
  try {
    await creating;
  } finally {
    creating = null;
  }
}

async function closeOffscreen() {
  if (creating) await creating.catch(() => {});
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

// --- start and stop -----------------------------------------------------------

async function start(tabId) {
  if (!tabId) {
    return setState({ mode: 'off', reason: 'no-tab', error: 'Open a book in Kindle Cloud Reader first.' });
  }
  const state = await getState();
  if (state.mode !== 'off' && state.tabId === tabId) return state;
  if (state.mode !== 'off') await stop('moved');
  await setState({ mode: 'starting', tabId, reason: null, error: null });
  // The offscreen page starts the camera as soon as it loads, and reports back.
  await openOffscreen();
  return getState();
}

async function stop(reason = 'user') {
  await closeOffscreen();
  const state = await getState();
  if (state.mode === 'off' && reason === 'user') return state;
  return setState({ mode: 'off', reason, error: null });
}

// The extension needs camera permission once. A hidden page can't ask for it,
// so open a small setup tab that does.
async function askForCamera(tabId) {
  await stop('needs-camera');
  await chrome.storage.session.set({ resumeTabId: tabId });
  chrome.tabs.create({ url: 'setup.html' });
}

async function kindleTabFor(tab) {
  if (tab && isKindleUrl(tab.url)) return tab.id;
  return null;
}

// --- messages -----------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  handle(msg, sender).then(reply, (err) => {
    console.error(err);
    reply({ error: String(err) });
  });
  return true; // reply comes later
});

async function handle(msg, sender) {
  switch (msg.type) {
    // From the popup
    case 'get-state':
      return { state: await getState(), settings: await getSettings() };
    case 'start':
      return start(msg.tabId);
    case 'stop':
      return stop('user');
    case 'test-turn': {
      const state = await getState();
      const tabId = msg.tabId || state.tabId;
      if (!tabId) return { ok: false };
      return chrome.tabs.sendMessage(tabId, { type: 'turn', dir: msg.dir, test: true });
    }
    case 'settings-changed': {
      const settings = await getSettings();
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'settings', settings }).catch(() => {});
      const state = await getState();
      if (state.tabId) tellTab(state.tabId, { type: 'settings', settings });
      return settings;
    }

    // From the offscreen page
    case 'offscreen-loaded':
      return { settings: await getSettings() };
    case 'camera-on':
      return setState({ mode: 'on' });
    case 'camera-error': {
      const state = await getState();
      if (msg.name === 'NotAllowedError') return askForCamera(state.tabId);
      await closeOffscreen();
      return setState({
        mode: 'off',
        reason: 'error',
        error: msg.name === 'NotFoundError'
          ? 'No camera found. Plug one in and try again.'
          : 'Couldn\'t start the camera. Another app may be using it.',
      });
    }
    case 'action': {
      const state = await getState();
      if (state.mode !== 'on') return null;
      if (msg.action === 'pause') return stop('fist');
      tellTab(state.tabId, { type: 'turn', dir: msg.action });
      return null;
    }
    case 'hand': {
      const state = await getState();
      if (state.tabId) tellTab(state.tabId, msg);
      return null;
    }

    // From the setup tab, once the camera is allowed
    case 'camera-allowed': {
      const { resumeTabId } = await chrome.storage.session.get('resumeTabId');
      await chrome.storage.session.remove('resumeTabId');
      if (sender.tab) chrome.tabs.remove(sender.tab.id).catch(() => {});
      if (resumeTabId) {
        chrome.tabs.update(resumeTabId, { active: true }).catch(() => {});
        return start(resumeTabId);
      }
      return null;
    }

    // From the Kindle tab
    case 'hello': {
      // A Kindle page (re)loaded: give it the current state.
      const state = await getState();
      return { state: sender.tab && state.tabId === sender.tab.id ? state : { mode: 'off' }, settings: await getSettings() };
    }
    case 'tab-hidden': {
      const state = await getState();
      if (sender.tab && state.tabId === sender.tab.id && state.mode !== 'off') return stop('hidden');
      return null;
    }
    default:
      return null;
  }
}

// Keyboard shortcut (Alt+G by default): start or stop in the current tab.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-gestures') return;
  const state = await getState();
  if (state.mode !== 'off') return stop('user');
  const tabId = await kindleTabFor(tab);
  if (tabId) start(tabId);
});

// Never leave the camera on for a tab that's gone.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state.tabId === tabId) {
    await closeOffscreen();
    await chrome.storage.session.set({ state: { mode: 'off', tabId: null, reason: 'closed' } });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url) return;
  const state = await getState();
  if (state.tabId === tabId && state.mode !== 'off' && !isKindleUrl(change.url)) stop('left');
});

// A fresh browser session never starts with the camera on.
chrome.runtime.onStartup.addListener(() => closeOffscreen());
