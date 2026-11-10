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
    return el && el !== document.documentElement ? el : document.body;
  }

  function pressArrow(dir) {
    const key = dir === 'next' ? 'ArrowRight' : 'ArrowLeft';
    const keyCode = dir === 'next' ? 39 : 37;
    const target = focusedElement();
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
  };

  async function turn(dir) {
    const order = preferred === 'key' || (!preferred && !findButton(dir))
      ? ['key', 'button']
      : ['button', 'key'];
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

  const host = document.createElement('turn-the-page');
  // Outside <body>, so the card never counts as a page change.
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .card {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        width: 184px; overflow: hidden;
        border-radius: 10px;
        background: #17191c; color: #e6e8eb;
        font: 12.5px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 2px 6px rgba(0,0,0,.25), 0 12px 32px rgba(0,0,0,.3);
        opacity: 0; transform: translateY(8px);
        transition: opacity .2s ease, transform .2s ease;
        pointer-events: none;
      }
      .card.show { opacity: 1; transform: none; }
      .view { position: relative; display: block; height: 138px; background: #0f1113; }
      .view[hidden] { display: none; }
      canvas { width: 100%; height: 100%; display: block; }
      .ring {
        position: absolute; right: 8px; top: 8px; width: 26px; height: 26px; border-radius: 50%;
        background: conic-gradient(#f87171 calc(var(--p, 0) * 360deg), rgba(255,255,255,.12) 0);
        -webkit-mask: radial-gradient(circle, transparent 8px, #000 9px);
                mask: radial-gradient(circle, transparent 8px, #000 9px);
        opacity: 0; transition: opacity .15s;
      }
      .ring.on { opacity: 1; }
      .empty {
        position: absolute; inset: 0; display: grid; place-items: center;
        color: #a0a7af; font-size: 12px; text-align: center; padding: 0 16px;
      }
      .empty[hidden] { display: none; }
      .status { display: flex; gap: 8px; align-items: center; padding: 8px 10px; }
      .dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #6b7280; }
      .dot.on { background: #f87171; }
      .dot.starting { background: #38bdf8; animation: blink 1s ease-in-out infinite; }
      @keyframes blink { 50% { opacity: .3; } }
      .edge {
        position: fixed; top: 0; bottom: 0; width: 56px; z-index: 2147483646;
        pointer-events: none; opacity: 0;
      }
      .edge.left { left: 0; background: linear-gradient(to right, rgba(14,165,233,.45), transparent); }
      .edge.right { right: 0; background: linear-gradient(to left, rgba(14,165,233,.45), transparent); }
      .edge.go { animation: flash .45s ease-out; }
      @keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) {
        .card { transition: none; }
        .edge.go { animation-duration: .2s; }
      }
    </style>
    <div class="edge left"></div>
    <div class="edge right"></div>
    <div class="card" role="status" aria-live="polite">
      <div class="view">
        <canvas width="368" height="276"></canvas>
        <div class="empty">Show your open hand to the camera</div>
        <div class="ring"></div>
      </div>
      <div class="status"><span class="dot"></span><span class="text"></span></div>
    </div>`;

  const card = root.querySelector('.card');
  const view = root.querySelector('.view');
  const canvas = root.querySelector('canvas');
  const empty = root.querySelector('.empty');
  const ring = root.querySelector('.ring');
  const dot = root.querySelector('.dot');
  const text = root.querySelector('.text');
  const edges = { next: root.querySelector('.edge.right'), prev: root.querySelector('.edge.left') };

  let settings = { flash: true, preview: true, swap: false };
  let mode = 'off';
  let hideTimer = null;

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
    fist: 'Paused. The camera is off. Press Alt+G to resume.',
    hidden: 'Stopped while you were away.',
    error: 'Gestures stopped.',
  };

  function showState(state) {
    mode = state.mode;
    clearTimeout(hideTimer);
    dot.className = `dot ${mode}`;
    if (mode === 'on') {
      text.textContent = settings.swap ? 'Swipe left to right for next page' : 'Swipe right to left for next page';
    } else if (mode === 'starting') {
      text.textContent = 'Starting the camera…';
    } else {
      text.textContent = state.error || MESSAGES[state.reason] || 'Gestures are off';
      drawHand(null);
      ring.classList.remove('on');
    }
    view.hidden = mode === 'off' || !settings.preview;
    const visible = mode !== 'off' || ['fist', 'hidden', 'error'].includes(state.reason);
    card.classList.toggle('show', visible);
    if (mode === 'off' && visible) hideTimer = setTimeout(() => card.classList.remove('show'), 5000);
  }

  function flash(dir) {
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
      turn(msg.dir).then(reply);
      return true;
    }
    if (msg.type === 'state') showState(msg.state);
    if (msg.type === 'settings') {
      settings = msg.settings;
      view.hidden = mode === 'off' || !settings.preview;
    }
    if (msg.type === 'hand' && mode === 'on') {
      if (settings.preview) drawHand(msg.points);
      ring.style.setProperty('--p', msg.fist || 0);
      ring.classList.toggle('on', msg.fist > 0);
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
