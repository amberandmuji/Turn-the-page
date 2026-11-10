// Runs inside Kindle Cloud Reader. Turns the page when a gesture comes in,
// and shows a small card in the corner while gestures are on: the hand as the
// camera sees it, a fist-to-pause ring and a one-line status.
(() => {
  if (window.__turnThePage) return;
  window.__turnThePage = true;

  // --- turning the page ------------------------------------------------------
  // Kindle Cloud Reader has next and previous arrows at the sides of the book,
  // and also turns pages with the arrow keys. Amazon changes its page from time
  // to time, so try the arrows first, then the keys, and remember what worked.

  const BUTTONS = {
    next: [
      '#kr-chevron-right',
      '.kr-chevron-container-right',
      'button[aria-label="Next page" i]',
      '[role="button"][aria-label*="next page" i]',
      '[aria-label*="next page" i]',
      '#kindleReader_pageTurnAreaRight',
    ],
    prev: [
      '#kr-chevron-left',
      '.kr-chevron-container-left',
      'button[aria-label="Previous page" i]',
      '[role="button"][aria-label*="previous page" i]',
      '[aria-label*="previous page" i]',
      '#kindleReader_pageTurnAreaLeft',
    ],
  };

  let preferred = null; // 'button' or 'key', once one has worked

  // The reader, plus any same-site frames it draws the book in.
  function documents() {
    const list = [document];
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        if (frame.contentDocument?.body) list.push(frame.contentDocument);
      } catch {
        // A frame from another site: not the book.
      }
    }
    return list;
  }

  function findButton(dir) {
    for (const doc of documents()) {
      for (const selector of BUTTONS[dir]) {
        const el = doc.querySelector(selector);
        if (el && el.getClientRects().length) return el;
      }
    }
    return null;
  }

  // The element with keyboard focus, looking inside the book's frame if needed.
  function focusedElement() {
    let el = document.activeElement;
    while (el && el.tagName === 'IFRAME') {
      try {
        const inner = el.contentDocument;
        if (!inner) break;
        el = inner.activeElement || inner.body;
      } catch {
        break;
      }
    }
    // Our own card (outside <body>) must never be the target: Kindle ignores
    // keys aimed at elements that aren't part of the book.
    if (!el || el === host || !el.ownerDocument.body?.contains(el)) return document.body;
    return el;
  }

  function pressArrow(dir, target = focusedElement()) {
    const key = dir === 'next' ? 'ArrowRight' : 'ArrowLeft';
    const keyCode = dir === 'next' ? 39 : 37;
    for (const type of ['keydown', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, {
        key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true,
      }));
    }
  }

  // Resolves true if the book changes within `ms`.
  function pageChanged(ms) {
    return new Promise((resolve) => {
      let done = false;
      const observers = [];
      const finish = (changed) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        observers.forEach((o) => o.disconnect());
        resolve(changed);
      };
      for (const doc of documents()) {
        const o = new MutationObserver(() => finish(true));
        o.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true });
        observers.push(o);
      }
      const timer = setTimeout(() => finish(false), ms);
    });
  }

  const METHODS = {
    button(dir) {
      const el = findButton(dir);
      if (!el) return false;
      el.click();
      return true;
    },
    key(dir) {
      pressArrow(dir);
      return true;
    },
    // The same key aimed at the page itself, for when focus is somewhere odd.
    bodyKey(dir) {
      if (focusedElement() === document.body) return false;
      pressArrow(dir, document.body);
      return true;
    },
  };

  async function turn(dir) {
    const order = preferred === 'key' || (!preferred && !findButton(dir))
      ? ['key', 'button', 'bodyKey']
      : ['button', 'key', 'bodyKey'];
    if (preferred === 'bodyKey') order.unshift('bodyKey');
    for (const method of order) {
      const watch = pageChanged(700);
      if (!METHODS[method](dir)) continue;
      if (await watch) {
        preferred = method;
        return { ok: true, method };
      }
    }
    return { ok: false };
  }

  // --- the corner card and edge flash ------------------------------------------
  // One card that folds down into a small pill. The fold is a clip-path morph
  // from the whole card to its bottom-right corner, where the pill's dot and
  // button already sit, so minimizing reads as the card tucking itself away.

  const host = document.createElement('turn-the-page');
  // Outside <body>, so the card never counts as a page change.
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }

      .dock {
        --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
        --bar: 40px;
        --pill: 76px;
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        font: 12.5px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #e8eaed;
        /* drop-shadow follows the clipped shape, box-shadow wouldn't */
        filter: drop-shadow(0 2px 3px rgba(0,0,0,.22)) drop-shadow(0 10px 22px rgba(0,0,0,.26));
        opacity: 0; transform: translateY(10px) scale(.98); transform-origin: 100% 100%;
        transition: opacity .18s ease-in, transform .18s ease-in, visibility 0s .18s;
        visibility: hidden;
      }
      .dock.show {
        opacity: 1; transform: none; visibility: visible;
        transition: opacity .28s var(--ease-out), transform .36s var(--ease-out), visibility 0s;
      }

      .card {
        width: 220px; overflow: hidden;
        background: #16181b;
        border-radius: 12px;
        clip-path: inset(0 0 0 0 round 12px);
        transition: clip-path .42s var(--ease-out);
      }
      .dock.min .card {
        clip-path: inset(calc(100% - var(--bar)) 0 0 calc(100% - var(--pill)) round 20px);
        transition-duration: .32s;
      }

      .view { position: relative; height: 165px; background: #0d0f11; }
      .view[hidden] { display: none; }
      canvas { width: 100%; height: 100%; display: block; }
      .empty {
        position: absolute; inset: 0; display: grid; place-content: center; gap: 8px;
        justify-items: center; text-align: center; padding: 0 18px;
        color: #9aa1a9; font-size: 12px;
      }
      .empty svg { width: 26px; height: 26px; opacity: .7; }
      .empty[hidden] { display: none; }
      .view, .text { transition: opacity .2s ease, filter .3s ease; }
      .dock.min .view { opacity: 0; filter: blur(6px); }
      .dock.min .text { opacity: 0; transition-duration: .12s; }

      .bar {
        height: var(--bar); display: flex; align-items: center; gap: 10px;
        padding: 0 4px 0 12px; gap: 8px;
        border-top: 1px solid rgba(255,255,255,.06);
      }
      .view[hidden] + .bar { border-top: 0; }
      .text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      /* Stopped: no preview, and room for the whole message */
      .dock.off .bar { height: auto; min-height: var(--bar); padding-top: 6px; padding-bottom: 6px; }
      .dock.off .text { white-space: normal; }

      /* Live dot, with the fist-to-pause progress drawn as a ring round it */
      .dot { position: relative; width: 18px; height: 18px; flex: none; display: grid; place-items: center; }
      .dot::before {
        content: ""; width: 8px; height: 8px; border-radius: 50%; background: #6b7280;
        transition: background-color .2s ease, transform .2s var(--ease-out);
      }
      .dot::after {
        content: ""; position: absolute; inset: 0; border-radius: 50%;
        background: conic-gradient(#f87171 calc(var(--p, 0) * 360deg), rgba(255,255,255,.14) 0);
        -webkit-mask: radial-gradient(circle, transparent 6.5px, #000 7.5px);
                mask: radial-gradient(circle, transparent 6.5px, #000 7.5px);
        opacity: 0; transition: opacity .15s ease;
      }
      .dot.fist::after { opacity: 1; }
      .dot.on::before { background: #f87171; }
      .dot.on.hand::before { transform: scale(1.25); background: #fca5a5; }
      .dot.starting::before { background: #38bdf8; animation: blink 1s ease-in-out infinite; }
      @keyframes blink { 50% { opacity: .3; } }
      .dot.turn::before { animation: tick .32s var(--ease-out); }
      @keyframes tick { 0% { transform: scale(1.9); background: #7dd3fc; } }

      .fold {
        all: unset; flex: none; width: 32px; height: 32px; border-radius: 16px;
        display: grid; place-items: center; cursor: pointer; color: #c4c9cf;
        transition: background-color .15s ease, color .15s ease;
      }
      .fold:hover { background: rgba(255,255,255,.1); color: #fff; }
      .fold:active { background: rgba(255,255,255,.16); }
      .fold:focus-visible { outline: 2px solid #38bdf8; outline-offset: -2px; }
      .fold svg { width: 16px; height: 16px; transition: transform .32s var(--ease-out); }
      .dock.min .fold svg { transform: rotate(180deg); }

      /* Big gesture cue in the middle of the page, as in the PDF reader */
      .cue {
        --p: 0;
        position: fixed; left: 50%; top: 50%; z-index: 2147483647;
        display: grid; justify-items: center; gap: 10px; padding: 18px 22px 16px; min-width: 168px;
        border-radius: 20px; background: rgba(22,24,27,.82); color: #fff; pointer-events: none;
        font: 600 17px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: -0.01em;
        box-shadow: 0 4px 10px rgba(0,0,0,.2), 0 18px 40px rgba(0,0,0,.25);
        opacity: 0; transform: translate(-50%, -50%) scale(.92); visibility: hidden;
        transition: opacity .16s ease, transform .26s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s .26s;
      }
      .cue.show { opacity: 1; transform: translate(-50%, -50%); visibility: visible; transition-delay: 0s; }
      .cue-badge { position: relative; display: grid; place-items: center; width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,.1); }
      .cue.holding .cue-badge::after {
        content: ""; position: absolute; inset: -5px; border-radius: 50%;
        background: conic-gradient(#f87171 calc(var(--p) * 360deg), rgba(255,255,255,.15) 0);
        -webkit-mask: radial-gradient(circle, transparent 37px, #000 38px);
                mask: radial-gradient(circle, transparent 37px, #000 38px);
      }
      .cue svg { width: 44px; height: 44px; fill: none; stroke: #7dd3fc; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
      .cue span:last-child { white-space: nowrap; }

      /* Which way the last gesture was read, as in the PDF reader */
      .hint {
        position: absolute; left: 50%; bottom: 10px; padding: 3px 10px; border-radius: 999px;
        background: rgba(0,0,0,.6); color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap;
        opacity: 0; transform: translate(-50%, 4px);
        transition: opacity .15s, transform .2s var(--ease-out);
      }
      .hint.show { opacity: 1; transform: translate(-50%, 0); }

      /* "Can't see your hand": a note just above the card (or its folded pill) */
      .warn {
        position: absolute; right: 0; bottom: calc(100% + 8px);
        display: flex; align-items: flex-start; gap: 10px;
        width: max-content; max-width: 260px; padding: 10px 14px 10px 12px;
        border-radius: 12px; background: #16181b; color: #f1f3f5;
        opacity: 0; transform: translateY(6px); visibility: hidden;
        transition: opacity .18s ease, transform .3s var(--ease-out), bottom .32s var(--ease-out), visibility 0s .18s;
      }
      .warn.show {
        opacity: 1; transform: none; visibility: visible;
        transition: opacity .18s ease, transform .3s var(--ease-out), bottom .32s var(--ease-out), visibility 0s;
      }
      .dock.min .warn { bottom: calc(var(--bar) + 8px); }
      .warn svg { width: 20px; height: 20px; flex: none; margin-top: 1px; color: #fbbf24; }
      .warn span { display: grid; gap: 2px; }
      .warn strong { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
      .warn small { font-size: 12.5px; line-height: 1.35; color: #b8bec6; }

      /* Page-turn glow on the side the page turns from */
      .edge {
        position: fixed; top: 0; bottom: 0; width: 72px; z-index: 2147483646;
        pointer-events: none; opacity: 0;
      }
      .edge.left { left: 0; background: linear-gradient(to right, rgba(14,165,233,.38), rgba(14,165,233,0)); transform-origin: 0 50%; }
      .edge.right { right: 0; background: linear-gradient(to left, rgba(14,165,233,.38), rgba(14,165,233,0)); transform-origin: 100% 50%; }
      .edge.go { animation: sweep .5s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)); }
      @keyframes sweep {
        0% { opacity: 1; transform: scaleX(1.4); }
        100% { opacity: 0; transform: scaleX(.6); }
      }

      @media (prefers-reduced-motion: reduce) {
        .dock, .dock.show { transform: none; }
        .card, .dock.min .card { transition-duration: .01s; }
        .edge.go { animation: fade .3s ease-out; }
        @keyframes fade { 0% { opacity: .9; } 100% { opacity: 0; } }
        .dot.turn::before { animation: none; }
      }
    </style>
    <div class="cue" aria-hidden="true"><span class="cue-badge"><svg viewBox="0 0 24 24"><path d=""/></svg></span><span></span></div>
    <div class="edge left"></div>
    <div class="edge right"></div>
    <div class="dock">
      <div class="warn" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.2L2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.2h.01"/></svg>
        <span><strong></strong><small></small></span>
      </div>
      <div class="card">
        <div class="view">
          <canvas width="376" height="282"></canvas>
          <div class="hint" aria-hidden="true"></div>
          <div class="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
            <span>Hold up an open hand</span>
          </div>
        </div>
        <div class="bar">
          <span class="text" role="status" aria-live="polite"></span>
          <span class="dot" aria-hidden="true"></span>
          <button class="fold" type="button" aria-expanded="true" aria-label="Minimize">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>
          </button>
        </div>
      </div>
    </div>`;

  const dock = root.querySelector('.dock');
  const view = root.querySelector('.view');
  const canvas = root.querySelector('canvas');
  const empty = root.querySelector('.empty');
  const dot = root.querySelector('.dot');
  const text = root.querySelector('.text');
  const fold = root.querySelector('.fold');
  const warn = root.querySelector('.warn');
  const hint = root.querySelector('.hint');
  const cue = root.querySelector('.cue');
  let hintTimer = null;
  const edges = { next: root.querySelector('.edge.right'), prev: root.querySelector('.edge.left') };

  let settings = { flash: true, preview: true, swap: false };
  let mode = 'off';
  let minimised = false;
  let hideTimer = null;

  function setMinimised(on, remember = true) {
    minimised = on;
    dock.classList.toggle('min', on);
    fold.setAttribute('aria-expanded', String(!on));
    fold.setAttribute('aria-label', on ? 'Show camera card' : 'Minimize');
    fold.title = on ? 'Show camera card (or swipe up)' : 'Minimize (or swipe down)';
    if (on) drawHand(null);
    if (remember) chrome.storage.local.set({ cardMinimised: on }).catch(() => {});
  }
  // Clicking the button mustn't take keyboard focus away from the book,
  // or Kindle stops hearing the arrow keys that turn its pages.
  fold.addEventListener('pointerdown', (e) => e.preventDefault());
  fold.addEventListener('click', () => {
    setMinimised(!minimised);
    if (document.activeElement === host) fold.blur();
  });
  chrome.storage.local.get('cardMinimised').then(({ cardMinimised }) => setMinimised(!!cardMinimised, false)).catch(() => {});

  const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
    [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
  ];

  function drawHand(points) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    empty.hidden = !!points;
    if (!points) return;
    // Mirrored, so it moves the same way as your hand.
    const at = (i) => [(1 - points[i][0]) * canvas.width, points[i][1] * canvas.height];
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7dd3fc';
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(...at(a));
      ctx.lineTo(...at(b));
    }
    ctx.stroke();
    ctx.fillStyle = '#0ea5e9';
    for (let i = 0; i < points.length; i++) {
      ctx.beginPath();
      ctx.arc(...at(i), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const MESSAGES = {
    fist: 'Paused · camera off · Alt+G resumes',
    hidden: 'Stopped while you were away',
    error: 'Gestures stopped',
  };

  function showState(state) {
    mode = state.mode;
    clearTimeout(hideTimer);
    dot.classList.remove('on', 'starting', 'hand', 'fist');
    if (state.mode !== 'on') showWarning(null);
    if (state.mode === 'off' && state.reason === 'fist') showCue('pause');
    else if (cueKind === 'hold') hideCue();
    if (mode !== 'off') dot.classList.add(mode);
    if (mode === 'on') {
      text.textContent = settings.swap ? 'Swipe → for next page' : 'Swipe ← for next page';
    } else if (mode === 'starting') {
      text.textContent = 'Starting the camera…';
    } else {
      text.textContent = state.error || MESSAGES[state.reason] || 'Gestures are off';
      drawHand(null);
    }
    view.hidden = !settings.preview || mode === 'off';
    dock.classList.toggle('off', mode === 'off');
    const visible = mode !== 'off' || ['fist', 'hidden', 'error'].includes(state.reason);
    // A paused or stopped message always opens the card, so it can be read.
    if (mode === 'off' && visible && minimised) setMinimised(false, false);
    dock.classList.toggle('show', visible);
    if (mode === 'off' && visible) {
      hideTimer = setTimeout(() => {
        dock.classList.remove('show');
        chrome.storage.local.get('cardMinimised').then(({ cardMinimised }) => setMinimised(!!cardMinimised, false)).catch(() => {});
      }, 5000);
    }
  }

  // warning: { title, tip } or null.
  function showWarning(warning) {
    if (warning && mode === 'on') {
      warn.querySelector('strong').textContent = warning.title;
      warn.querySelector('small').textContent = warning.tip;
      warn.classList.add('show');
    } else {
      warn.classList.remove('show');
    }
  }

  // The arrow points the way the hand moved, which depends on the setting.
  function hintText(dir) {
    const leftward = (dir === 'next') !== !!settings.swap;
    const label = dir === 'next' ? 'Next' : 'Previous';
    return leftward ? `← ${label}` : `${label} →`;
  }

  // Big, brief sign in the middle of the page, readable from across the room.
  const CUES = {
    left: { icon: 'M19 12H5M11 6l-6 6 6 6' },
    right: { icon: 'M5 12h14M13 6l6 6-6 6' },
    still: { icon: 'M6 6l12 12M18 6L6 18', text: 'Page didn\'t turn' },
    fold: { icon: 'M6 9l6 6 6-6', text: 'Camera folded' },
    unfold: { icon: 'M6 15l6-6 6 6', text: 'Camera shown' },
    hold: { icon: 'M9.5 7v10M14.5 7v10', text: 'Keep holding to pause' },
    pause: { icon: 'M9.5 7v10M14.5 7v10', text: 'Paused. Camera off' },
  };
  let cueTimer = null;
  let cueKind = null;
  function showCue(kind, progress = 0) {
    let c = CUES[kind];
    if (kind === 'next' || kind === 'prev') {
      const leftward = (kind === 'next') !== !!settings.swap;
      c = { ...CUES[leftward ? 'left' : 'right'], text: kind === 'next' ? 'Next page' : 'Previous page' };
    }
    if (!c) return;
    cueKind = kind;
    cue.querySelector('path').setAttribute('d', c.icon);
    cue.lastElementChild.textContent = c.text;
    cue.style.setProperty('--p', progress);
    cue.classList.toggle('holding', kind === 'hold');
    cue.classList.add('show');
    clearTimeout(cueTimer);
    if (kind !== 'hold') cueTimer = setTimeout(hideCue, kind === 'pause' ? 1800 : 750);
  }
  function hideCue() {
    cueKind = null;
    clearTimeout(cueTimer);
    cue.classList.remove('show');
  }

  function showHint(dir) {
    hint.textContent = hintText(dir);
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), 900);
  }

  function flash(dir) {
    dot.classList.remove('turn');
    void dot.offsetWidth;
    dot.classList.add('turn');
    if (!settings.flash) return;
    const edge = edges[dir];
    edge.classList.remove('go');
    void edge.offsetWidth; // restart the animation
    edge.classList.add('go');
  }

  // --- messages from the extension ------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'turn') {
      flash(msg.dir);
      if (!msg.test) showHint(msg.dir);
      turn(msg.dir).then((result) => {
        if (!msg.test) showCue(result.ok ? msg.dir : 'still');
        reply(result);
      });
      return true;
    }
    if (msg.type === 'state') showState(msg.state);
    if (msg.type === 'fold' && mode === 'on') {
      setMinimised(msg.folded);
      showCue(msg.folded ? 'fold' : 'unfold');
    }
    if (msg.type === 'settings') {
      settings = msg.settings;
      view.hidden = !settings.preview || mode === 'off';
    }
    if (msg.type === 'warn') showWarning(msg.warning);
    if (msg.type === 'hand' && mode === 'on') {
      if (settings.preview && !minimised) drawHand(msg.points);
      dot.classList.toggle('hand', !!msg.points);
      dot.style.setProperty('--p', msg.fist || 0);
      if (msg.fist > 0.2) showCue('hold', msg.fist);
      else if (cueKind === 'hold') hideCue();
      dot.classList.toggle('fist', msg.fist > 0);
    }
    return false;
  });

  // Never keep the camera on for a tab you're not looking at.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode !== 'off') chrome.runtime.sendMessage({ type: 'tab-hidden' }).catch(() => {});
  });

  chrome.runtime.sendMessage({ type: 'hello' }).then((res) => {
    if (!res) return;
    settings = res.settings;
    if (res.state.mode !== 'off') showState(res.state);
  }).catch(() => {});
})();
