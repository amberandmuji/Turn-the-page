// The page-turn animation: the page's bottom corner curls up first, then the
// fold sweeps across and the page turns over the spine, like turning paper.
//
// It is drawn on one canvas from pictures of the pages. Before the turn, the
// pages on screen are drawn over the book; the new pages are drawn underneath;
// then the turning page folds back along a straight line, the way page-curl
// libraries such as turn.js and StPageFlip do it: the corner is pulled toward
// a point P, the fold is the line halfway between the corner and P, and the
// part past the fold is mirrored over it and shows the back of the page.
// Nothing about reading waits for it: the new pages are already in place.
//
//   Two pages, next:  the right page turns over to the left.
//   Two pages, back:  the left page turns over to the right.
//   One page, next:   the page turns away to the left, showing the next one.
//   One page, back:   the previous page turns back in over this one.

const DURATION = 900;
const PAPER = '#fff';
let current = null; // the animation in progress, so a fast second turn can finish it

// Slow start, so the corner lifts gently before the page sweeps over.
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

function picture(canvas, stageBox) {
  const r = canvas.getBoundingClientRect();
  return { img: canvas, box: { x: r.left - stageBox.left, y: r.top - stageBox.top, w: r.width, h: r.height } };
}

function copyOf(canvas) {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  return copy;
}

const sameLayout = (a, b) => a.length === b.length
  && a.every((p, i) => Math.abs(p.box.x - b[i].box.x) < 2 && Math.abs(p.box.y - b[i].box.y) < 2
    && Math.abs(p.box.w - b[i].box.w) < 2 && Math.abs(p.box.h - b[i].box.h) < 2);

const rect = (b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];

// The part of a polygon where side(point) >= 0 (Sutherland-Hodgman).
function cut(poly, side) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const k = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
  }
  return out;
}

function path(ctx, poly) {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function drawPage(ctx, pic) {
  ctx.drawImage(pic.img, pic.box.x, pic.box.y, pic.box.w, pic.box.h);
}

// Plans the turn: which page turns, where its corner goes, and what shows
// where. Everything is in stage pixels.
function plan(before, after, next) {
  if (before.length === 2) {
    const gap = before[1].box.x - (before[0].box.x + before[0].box.w);
    const t = next ? 1 : 0; // the turning page
    const o = 1 - t;        // the page on the other side
    const b = before[t].box;
    const spine = next ? b.x - gap / 2 : b.x + b.w + gap / 2;
    return {
      sgn: next ? 1 : -1,
      spine,
      corner: { x: next ? b.x + b.w : b.x, y: b.y + b.h },
      reach: b.w + gap / 2,
      height: b.h,
      turning: before[t],
      under: after[t],
      still: before[o],
      back: after[o], // the new page on the other side is on the back of the leaf
      reverse: false,
    };
  }
  // One page: it turns on its left edge, and its back is blank paper.
  const b = before[0].box;
  return {
    sgn: 1,
    spine: b.x,
    corner: { x: b.x + b.w, y: b.y + b.h },
    reach: b.w,
    height: b.h,
    turning: next ? before[0] : after[0],
    under: next ? after[0] : before[0],
    still: null,
    back: null,
    reverse: !next, // going back is turning forward, played backwards
  };
}

// Draws the turn with the fold at e (0 = flat, 1 = landed on the other side).
function frame(ctx, p, e) {
  const { sgn, spine, corner: O, reach, height: h } = p;
  if (p.still) drawPage(ctx, p.still);

  // Where the corner is pulled to: up and in at first, so the corner curls,
  // then across in an arc to the mirrored corner on the other side.
  const lift = h * 0.2 * Math.sin(Math.PI * e) ** 0.6;
  let P = { x: spine + sgn * reach * (1 - 2 * e), y: O.y - lift };
  // The page is held at the spine, so the corner can't go farther from it
  // than the page is wide.
  const B = { x: spine, y: O.y };
  const far = Math.hypot(P.x - B.x, P.y - B.y);
  if (far > reach) P = { x: B.x + ((P.x - B.x) * reach) / far, y: B.y + ((P.y - B.y) * reach) / far };

  const dx = O.x - P.x;
  const dy = O.y - P.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) {
    drawPage(ctx, p.turning);
    return;
  }
  const n = { x: dx / len, y: dy / len }; // points from the fold toward the corner
  const M = { x: (O.x + P.x) / 2, y: (O.y + P.y) / 2 };
  const side = (q) => (q.x - M.x) * n.x + (q.y - M.y) * n.y; // > 0: folded over
  const page = rect(p.turning.box);
  const flat = cut(page, (q) => -side(q));
  const folded = cut(page, side);
  const reflect = (q) => {
    const s = 2 * side(q);
    return { x: q.x - s * n.x, y: q.y - s * n.y };
  };
  const flap = folded.map(reflect);
  const depth = Math.max(0, ...folded.map(side)); // how far the flap reaches from the fold
  const fade = p.back ? 1 : Math.min(1, Math.max(0, (1 - e) / 0.35)); // a lone page fades as it leaves

  // The page underneath, then what is still flat of the turning page.
  drawPage(ctx, p.under);
  if (flat.length > 2) {
    ctx.save();
    path(ctx, flat);
    ctx.clip();
    drawPage(ctx, p.turning);
    // The page bends up toward the fold, so it darkens a touch there.
    const g = ctx.createLinearGradient(M.x, M.y, M.x - n.x * 36, M.y - n.y * 36);
    g.addColorStop(0, 'rgba(31,35,40,0.12)');
    g.addColorStop(1, 'rgba(31,35,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.turning.box.x, p.turning.box.y, p.turning.box.w, p.turning.box.h);
    ctx.restore();
  }

  if (folded.length < 3) return;

  // The lifted page shades the page it's uncovering, most at the fold.
  ctx.save();
  path(ctx, folded);
  ctx.clip();
  const reach2 = Math.min(depth, 24 + 60 * Math.sin(Math.PI * Math.min(e, 0.5)));
  const g = ctx.createLinearGradient(M.x, M.y, M.x + n.x * reach2, M.y + n.y * reach2);
  g.addColorStop(0, `rgba(31,35,40,${0.32 * fade})`);
  g.addColorStop(1, 'rgba(31,35,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(p.turning.box.x, p.turning.box.y, p.turning.box.w, p.turning.box.h);
  ctx.restore();

  // The flap: the back of the turning page, folded over.
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.shadowColor = 'rgba(31,35,40,0.28)';
  ctx.shadowBlur = 10 + 14 * Math.sin(Math.PI * e);
  path(ctx, flap);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  // Reflection over the fold: q -> q - 2 side(q) n, as a matrix.
  const c = M.x * n.x + M.y * n.y;
  const R = [1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y, 2 * c * n.x, 2 * c * n.y];
  if (p.back) {
    // The new page on the other side, mirrored over the spine (where it sat
    // on the back of this leaf), then over the fold: it reads the right way.
    ctx.transform(...R);
    ctx.transform(-1, 0, 0, 1, 2 * spine, 0);
    drawPage(ctx, p.back);
  } else {
    // Blank paper, with the print showing faintly through, mirrored.
    ctx.save();
    ctx.globalAlpha = fade * 0.07;
    ctx.transform(...R);
    drawPage(ctx, p.turning);
    ctx.restore();
  }
  ctx.restore();

  // Light on the curl: shade at the fold, a soft sheen just past it.
  ctx.save();
  ctx.globalAlpha = fade;
  path(ctx, flap);
  ctx.clip();
  const span = Math.max(depth, 1);
  const s = ctx.createLinearGradient(M.x, M.y, M.x - n.x * span, M.y - n.y * span);
  s.addColorStop(0, 'rgba(31,35,40,0.2)');
  s.addColorStop(Math.min(0.5, 14 / span), 'rgba(255,255,255,0.18)');
  s.addColorStop(Math.min(0.8, 60 / span + 0.1), 'rgba(255,255,255,0)');
  s.addColorStop(1, 'rgba(31,35,40,0.06)');
  ctx.fillStyle = s;
  path(ctx, flap);
  ctx.fill();
  ctx.restore();
}

// render() draws the new pages and resolves true if the page changed.
// Returns what render() returned.
export async function flipTurn({ stage, pages, direction, render }) {
  current?.finish();
  const stageBox = stage.getBoundingClientRect();
  const before = [...pages.querySelectorAll('.page')].map((c) => {
    const pic = picture(c, stageBox);
    pic.img = copyOf(c);
    return pic;
  });
  if (!before.length) return render();

  // Hold the old pages on screen while the new ones are drawn.
  const canvas = document.createElement('canvas');
  canvas.className = 'flip';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(stageBox.width * dpr);
  canvas.height = Math.round(stageBox.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const paint = (draw) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stageBox.width, stageBox.height);
    draw();
  };
  paint(() => before.forEach((p) => drawPage(ctx, p)));
  stage.append(canvas);

  let moved = false;
  try {
    moved = await render();
  } finally {
    if (!moved) canvas.remove();
  }
  if (!moved) return moved;

  const after = [...pages.querySelectorAll('.page')].map((c) => picture(c, stageBox));
  if (!sameLayout(before, after)) {
    canvas.remove();
    return moved;
  }
  // The new pages are live canvases; snapshot them so nothing redraws mid-turn.
  after.forEach((p) => { p.img = copyOf(p.img); });

  const p = plan(before, after, direction === 'next');
  let raf = 0;
  const done = () => {
    cancelAnimationFrame(raf);
    canvas.remove();
    if (current === handle) current = null;
  };
  const handle = { finish: done };
  current = handle;

  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    const e = ease(t);
    paint(() => frame(ctx, p, p.reverse ? 1 - e : e));
    if (t < 1) raf = requestAnimationFrame(tick);
    else done();
  };
  raf = requestAnimationFrame(tick);
  return moved;
}
