// The page-turn animation: the page lifts at its outer edge and swings over
// the spine, like turning a paper page.
//
// It works from pictures of the pages: before the turn, copies of the pages
// on screen cover the book; the new pages are drawn underneath; then one
// leaf turns over, showing the old page on its front and the new one on its
// back, and lands exactly where the new page sits. Nothing about reading
// waits for it: the new pages are already in place underneath.
//
//   Two pages, next:  the right page turns over to the left.
//   Two pages, back:  the left page turns over to the right.
//   One page, next:   the page turns away to the left, showing the next one.
//   One page, back:   the previous page turns back in over this one.

const DURATION = 620;
const EASE = 'cubic-bezier(0.45, 0.05, 0.2, 1)';
let current = null; // the animation in progress, so a fast second turn can finish it

function picture(canvas, stageBox) {
  const r = canvas.getBoundingClientRect();
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  return { copy, box: { x: r.left - stageBox.left, y: r.top - stageBox.top, w: r.width, h: r.height } };
}

function place(el, box) {
  Object.assign(el.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
  return el;
}

function side(kind, canvas) {
  const el = document.createElement('div');
  el.className = `flip-side ${kind}`;
  if (canvas) el.append(canvas);
  const shade = document.createElement('div');
  shade.className = 'flip-shade';
  el.append(shade);
  return el;
}

const sameLayout = (a, b) => a.length === b.length
  && a.every((p, i) => Math.abs(p.box.x - b[i].box.x) < 2 && Math.abs(p.box.y - b[i].box.y) < 2
    && Math.abs(p.box.w - b[i].box.w) < 2 && Math.abs(p.box.h - b[i].box.h) < 2);

// render() draws the new pages and resolves true if the page changed.
// Returns what render() returned.
export async function flipTurn({ stage, pages, direction, render }) {
  current?.finish();
  const stageBox = stage.getBoundingClientRect();
  const before = [...pages.querySelectorAll('.page')].map((c) => picture(c, stageBox));
  if (!before.length) return render();

  // Hold the old pages on screen while the new ones are drawn.
  const overlay = document.createElement('div');
  overlay.className = 'flip';
  overlay.setAttribute('aria-hidden', 'true');
  const covers = before.map((p) => {
    const c = place(document.createElement('div'), p.box);
    c.className = 'flip-cover';
    c.append(p.copy);
    overlay.append(c);
    return c;
  });
  stage.append(overlay);

  let moved = false;
  try {
    moved = await render();
  } finally {
    if (!moved) overlay.remove();
  }
  if (!moved) return moved;

  const after = [...pages.querySelectorAll('.page')].map((c) => picture(c, stageBox));
  if (!sameLayout(before, after)) {
    overlay.remove();
    return moved;
  }

  const next = direction === 'next';
  const leaf = document.createElement('div');
  leaf.className = 'flip-leaf';
  let from;
  let to;
  if (before.length === 2) {
    // The leaf turns on the spine, halfway across the gap between the pages.
    const gap = before[1].box.x - (before[0].box.x + before[0].box.w);
    const turning = next ? 1 : 0;
    const box = before[turning].box;
    place(leaf, box);
    leaf.style.transformOrigin = next ? `${-gap / 2}px 50%` : `${box.w + gap / 2}px 50%`;
    leaf.append(side('front', before[turning].copy), side('back', after[next ? 0 : 1].copy));
    covers[turning].remove();
    from = 0;
    to = next ? -180 : 180;
  } else {
    // One page: it turns on its left edge.
    const box = before[0].box;
    place(leaf, box);
    leaf.style.transformOrigin = '0 50%';
    if (next) {
      leaf.append(side('front', before[0].copy), side('back', null));
      covers[0].remove();
      from = 0;
      to = -180;
    } else {
      leaf.append(side('front', after[0].copy), side('back', null));
      from = -180;
      to = 0;
    }
  }
  overlay.append(leaf);

  const opts = { duration: DURATION, easing: EASE, fill: 'forwards' };
  const anims = [
    leaf.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }], opts),
    // Light falls off as the page stands up, then comes back as it lands.
    ...[...leaf.querySelectorAll('.flip-shade')].map((s) => s.animate(
      [{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }], opts,
    )),
  ];
  // A single page turning away has nothing to land on, so it fades as it
  // goes. (Faded on each side, not the leaf: opacity on the leaf would
  // flatten the 3D and show the page through from behind.)
  if (before.length === 1) {
    for (const face of leaf.querySelectorAll('.flip-side')) {
      anims.push(face.animate(next
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 1 }], opts));
    }
  }

  const done = () => {
    overlay.remove();
    if (current === handle) current = null;
  };
  const handle = { finish: () => { anims.forEach((a) => a.cancel()); done(); } };
  current = handle;
  anims[0].finished.then(done, done);
  return moved;
}
