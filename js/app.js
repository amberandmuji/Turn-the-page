import { Reader, ZOOMS } from './reader.js';
import { HandCamera } from './camera.js';
import { GestureDetector, palmCentre } from './gestures.js';
import { HandWatch, WARNINGS } from './handwatch.js';
import { bookId, listBooks, getBook, rememberBook, updateBook, forgetBook, forgetAll } from './library.js';
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
  pageBtn: $('page-btn'),
  tocBtn: $('toc-btn'),
  toc: $('toc'),
  tocTree: $('toc-tree'),
  tocEmpty: $('toc-empty'),
  gotoForm: $('goto-form'),
  gotoInput: $('goto-input'),
  gotoTotal: $('goto-total'),
  zoomIn: $('zoom-in'),
  zoomOut: $('zoom-out'),
  zoomLabel: $('zoom-label'),
  fullscreenBtn: $('fullscreen-btn'),
  recentBtn: $('recent-btn'),
  recent: $('recent'),
  recentList: $('recent-list'),
  shelf: $('shelf'),
  shelfList: $('shelf-list'),
  keepRecent: $('opt-recent'),
  handWarning: $('hand-warning'),
  handWarningTitle: $('hand-warning-title'),
  handWarningTip: $('hand-warning-tip'),
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
  recent: true,
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
  if (els.toc.matches(':popover-open')) markCurrentChapter();
});
reader.zoom = load('zoom', 1);
const detector = new GestureDetector({ sensitivity: settings.sensitivity, swapDirection: settings.swap });
const watch = new HandWatch();
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
  els.keepRecent.checked = settings.recent;
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
els.keepRecent.addEventListener('change', async () => {
  updateSetting('recent', els.keepRecent.checked);
  if (!settings.recent) await forgetAll();
  else if (currentFile) await keepBook(currentFile);
  refreshRecent();
});

// The panel is a popover: the browser handles opening, Escape and clicking outside.
for (const [panel, button] of [[els.settings, els.settingsBtn], [els.toc, els.tocBtn], [els.recent, els.recentBtn]]) {
  panel.addEventListener('toggle', (e) => button.setAttribute('aria-expanded', String(e.newState === 'open')));
}

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
let currentFile = null;
const bookTitle = (name) => name.replace(/\.pdf$/i, '');

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
    currentFile = file;
    showResume();
    document.title = `${bookTitle(file.name)} · Turn the page`;
    els.gotoTotal.textContent = `of ${reader.pageCount}`;
    els.gotoInput.max = reader.pageCount;
    els.tocTree.replaceChildren();
    els.tocEmpty.hidden = true;
    updateZoomControls();
    setStatus(gestureState === 'on' ? 'Swipe to turn the page' : '');
    if (settings.recent) keepBook(file).then(refreshRecent);
  } catch (err) {
    console.error(err);
    if (!reader.doc) els.empty.hidden = false;
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
  // Zoomed in, read down the page first, then turn.
  if (reader.zoom > 1 && reader.scroll(direction)) {
    if (!els.resume.hidden) hideResume();
    return;
  }
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
  if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
  // Inside a panel, these keys belong to its buttons and lists.
  if (e.target.closest?.('.panel') && [' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  if (reader.doc && ['+', '='].includes(e.key)) { zoomBy(1); return; }
  if (reader.doc && ['-', '_'].includes(e.key)) { zoomBy(-1); return; }
  if (reader.doc && e.key === '0') { setZoom(1); return; }
  if (reader.doc && (e.key === 'f' || e.key === 'F')) { toggleFullscreen(); return; }
  if (reader.doc && (e.key === 'c' || e.key === 'C')) { els.toc.togglePopover(); return; }
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
    watch.reset();
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
  watch.reset();
  showHandWarning(null);
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

function onFrame({ t, landmarks, gesture, score, light, motion }) {
  const hand = palmCentre(landmarks);
  const action = detector.update({ t, hand, gesture, score });
  if (action === 'next' || action === 'prev') watch.turned(t);
  showHandWarning(watch.update({ t, hand, light, motion }));
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
  placeHandWarning();
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

// ---------- "Can't see your hand" ----------
// Sits just above the camera window (or its folded pill), so it reads as the
// camera talking. Only changes when the warning does.
let shownWarning = null;
let warningTimer;
function showHandWarning(key) {
  if (key === shownWarning) return;
  shownWarning = key;
  clearTimeout(warningTimer);
  if (!key) {
    els.handWarning.classList.remove('show');
    warningTimer = setTimeout(() => { els.handWarning.hidden = true; }, 200);
    return;
  }
  els.handWarningTitle.textContent = WARNINGS[key].title;
  els.handWarningTip.textContent = WARNINGS[key].tip;
  els.handWarning.hidden = false;
  placeHandWarning();
  requestAnimationFrame(() => els.handWarning.classList.add('show'));
}

function placeHandWarning() {
  if (els.handWarning.hidden) return;
  let top = els.stage.getBoundingClientRect().bottom - 8; // no camera window
  if (!els.preview.hidden) {
    const card = els.preview.getBoundingClientRect();
    top = els.preview.classList.contains('folded') ? card.bottom - 40 : card.top;
  }
  els.handWarning.style.bottom = `${Math.round(window.innerHeight - top + 8)}px`;
}
window.addEventListener('resize', placeHandWarning);

// ---------- Zoom ----------
function updateZoomControls() {
  const z = reader.zoom;
  els.zoomLabel.textContent = z === 1 ? 'Fit' : `${Math.round(z * 100)}%`;
  els.zoomLabel.classList.toggle('zoomed', z !== 1);
  els.zoomLabel.disabled = z === 1;
  els.zoomLabel.title = z === 1 ? 'The whole page fits the window' : 'Fit the whole page in the window (0)';
  els.zoomOut.disabled = z <= ZOOMS[0];
  els.zoomIn.disabled = z >= ZOOMS.at(-1);
}

async function setZoom(z) {
  await reader.setZoom(z);
  save('zoom', reader.zoom);
  updateZoomControls();
}

function zoomBy(steps) {
  const i = ZOOMS.findIndex((z) => z >= reader.zoom - 1e-6);
  const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 0 : i) + steps))];
  return setZoom(next);
}

els.zoomIn.addEventListener('click', () => zoomBy(1));
els.zoomOut.addEventListener('click', () => zoomBy(-1));
els.zoomLabel.addEventListener('click', () => setZoom(1));

// Pinch on a trackpad (or Ctrl + scroll) zooms the book, not the whole page.
let wheelZoom = 0;
els.stage.addEventListener('wheel', (e) => {
  if (!e.ctrlKey || !reader.doc) return;
  e.preventDefault();
  wheelZoom += e.deltaY;
  if (Math.abs(wheelZoom) < 40) return;
  zoomBy(wheelZoom < 0 ? 1 : -1);
  wheelZoom = 0;
}, { passive: false });

// ---------- Full screen ----------
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => setStatus('This browser won\'t go full screen here.'));
}
els.fullscreenBtn.addEventListener('click', toggleFullscreen);

let chromeTimer;
function showChrome() {
  document.body.classList.add('chrome');
  clearTimeout(chromeTimer);
  chromeTimer = setTimeout(() => {
    // Keep it up while the mouse is on it or a panel is open.
    if (document.querySelector('.toolbar:hover, .panel:popover-open')) showChrome();
    else document.body.classList.remove('chrome');
  }, 2500);
}
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  document.body.classList.toggle('fullscreen', on);
  els.fullscreenBtn.setAttribute('aria-pressed', String(on));
  els.fullscreenBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  els.fullscreenBtn.title = on ? 'Exit full screen (F or Esc)' : 'Full screen (F)';
  if (on) showChrome();
  else document.body.classList.remove('chrome');
  setTimeout(placeHandWarning, 300);
});
document.addEventListener('mousemove', () => {
  if (document.body.classList.contains('fullscreen')) showChrome();
});

// ---------- Contents and go to page ----------
const chevron = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
let tocLinks = []; // [{ link, page, path: [ol of each ancestor] }] in reading order

// ancestors: { list, toggle } for each level above, to open them later.
function buildToc(items, ancestors = []) {
  const list = document.createElement('ol');
  for (const item of items) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'toc-row';
    const children = item.items.length ? { list: null, toggle: document.createElement('button') } : null;
    if (children) {
      const { toggle } = children;
      toggle.type = 'button';
      toggle.className = 'toc-toggle';
      toggle.innerHTML = chevron;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', `Sections in ${item.title}`);
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        children.list.hidden = !open;
      });
      row.append(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'toc-spacer';
      row.append(spacer);
    }
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'toc-link';
    link.disabled = item.page === null;
    const title = document.createElement('span');
    title.className = 'toc-title';
    title.textContent = item.title;
    const page = document.createElement('span');
    page.className = 'toc-page';
    page.textContent = item.page ?? '';
    link.append(title, page);
    link.addEventListener('click', () => jumpTo(item.page));
    row.append(link);
    li.append(row);
    if (item.page !== null) tocLinks.push({ link, page: item.page, ancestors });
    if (children) {
      children.list = buildToc(item.items, [...ancestors, children]);
      children.list.hidden = true;
      li.append(children.list);
    }
    list.append(li);
  }
  return list;
}

// Highlight the chapter you're in, and open the sections around it.
function markCurrentChapter(scroll = false) {
  const last = reader.spread ? reader.page + 1 : reader.page;
  let current = null;
  for (const entry of tocLinks) {
    entry.link.removeAttribute('aria-current');
    if (entry.page <= last) current = entry;
  }
  if (!current) return;
  current.link.setAttribute('aria-current', 'true');
  for (const a of current.ancestors) {
    if (a.list) a.list.hidden = false;
    a.toggle?.setAttribute('aria-expanded', 'true');
  }
  if (scroll) current.link.scrollIntoView({ block: 'center' });
}

els.toc.addEventListener('toggle', async (e) => {
  if (e.newState !== 'open') return;
  els.gotoInput.value = reader.page;
  els.gotoInput.removeAttribute('aria-invalid');
  if (!els.tocTree.firstChild && reader.doc) {
    const outline = await reader.loadOutline();
    tocLinks = [];
    if (outline.length) els.tocTree.replaceChildren(buildToc(outline));
    els.tocEmpty.hidden = outline.length > 0;
  }
  markCurrentChapter(true);
  els.gotoInput.focus();
  els.gotoInput.select();
});

async function jumpTo(page) {
  if (!page) return;
  els.toc.hidePopover();
  const moved = await reader.goTo(page);
  if (moved) {
    hideResume();
    if (settings.flash) flashEdge(els.stage, 'next');
  }
}

els.gotoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const n = Number(els.gotoInput.value);
  if (!Number.isInteger(n) || n < 1 || n > reader.pageCount) {
    els.gotoInput.setAttribute('aria-invalid', 'true');
    els.gotoInput.select();
    return;
  }
  jumpTo(n);
});
els.gotoInput.addEventListener('input', () => els.gotoInput.removeAttribute('aria-invalid'));

// ---------- Recent books ----------
async function keepBook(file) {
  await rememberBook(file, { pageCount: reader.pageCount });
  const id = bookId(file);
  const book = await getBook(id);
  if (book && !book.cover) {
    const cover = await reader.cover();
    if (cover) await updateBook(id, { cover });
  }
}

const when = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return when.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return when.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return when.format(-days, 'day');
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

let coverUrls = [];
function bookItem(book, kind) {
  const li = document.createElement('li');
  li.className = kind === 'shelf' ? 'book shelf-book' : 'book';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = kind === 'shelf' ? 'shelf-open' : 'book-open';

  const cover = document.createElement('img');
  cover.className = 'book-cover';
  cover.alt = '';
  if (book.cover) {
    const url = URL.createObjectURL(book.cover);
    coverUrls.push(url);
    cover.src = url;
  }

  const page = Number(load(`pos:${book.id}`, 1));
  const done = book.pageCount ? Math.round((page / book.pageCount) * 100) : 0;
  const text = document.createElement('span');
  text.className = 'book-text';
  const name = document.createElement('span');
  name.className = 'book-name';
  name.textContent = bookTitle(book.name);
  const meta = document.createElement('span');
  meta.className = 'book-meta';
  if (kind === 'shelf') {
    meta.textContent = book.pageCount ? `Page ${page} of ${book.pageCount}` : ago(book.openedAt);
  } else {
    const bar = document.createElement('span');
    bar.className = 'progress';
    bar.style.setProperty('--done', `${done}%`);
    meta.append(bar, book.pageCount ? `Page ${page} of ${book.pageCount} · ${ago(book.openedAt)}` : ago(book.openedAt));
  }
  text.append(name, meta);
  open.append(cover, text);
  open.addEventListener('click', () => openRecent(book.id));

  const forget = document.createElement('button');
  forget.type = 'button';
  forget.className = 'icon-btn book-forget';
  forget.setAttribute('aria-label', `Remove ${bookTitle(book.name)} from recent books`);
  forget.title = 'Remove from recent books';
  forget.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  forget.addEventListener('click', async () => {
    await forgetBook(book.id);
    refreshRecent();
  });

  li.append(open, forget);
  return li;
}

async function openRecent(id) {
  els.recent.hidePopover?.();
  const book = await getBook(id);
  if (!book?.data) {
    setStatus('That book is no longer saved here. Open it from your computer instead.');
    await forgetBook(id);
    refreshRecent();
    return;
  }
  const file = book.data instanceof File ? book.data : new File([book.data], book.name, { type: 'application/pdf' });
  openFile(file);
}

async function refreshRecent() {
  const books = settings.recent ? await listBooks() : [];
  coverUrls.forEach((url) => URL.revokeObjectURL(url));
  coverUrls = [];
  // The book that's open doesn't need to be offered again.
  const others = books.filter((b) => !currentFile || b.id !== bookId(currentFile));
  els.recentList.replaceChildren(...others.map((b) => bookItem(b, 'list')));
  els.recentBtn.hidden = others.length === 0;
  if (!others.length && els.recent.matches(':popover-open')) els.recent.hidePopover();
  els.shelfList.replaceChildren(...books.slice(0, 5).map((b) => bookItem(b, 'shelf')));
  els.shelf.hidden = books.length === 0;
}

applySettings();
setGestureState('off');
updateZoomControls();
refreshRecent();
