// PDF rendering with PDF.js: single page or two-page spread, fitted to the
// window and zoomed from there, with the last page remembered per book in
// this browser.
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';
import { load, save } from './storage.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

// Zoom steps, as a multiple of "the whole page fits the window".
export const ZOOMS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// Largest canvas we draw, in pixels. Above this, zoomed pages are drawn a
// little softer rather than using hundreds of megabytes of memory.
const MAX_PIXELS = 16e6;

export class Reader {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.doc = null;
    this.page = 1;        // first page shown
    this.spread = false;
    this.zoom = 1;
    this.bookKey = null;
    this.renderToken = 0;
    this.outline = null;  // [{ title, page, items }] once loaded, [] if the PDF has none
  }

  // id: a stable name for the book, used for its saved page.
  async open(file, id = `${file.name}:${file.size}`) {
    const data = await file.arrayBuffer();
    if (this.doc) this.doc.destroy();
    this.doc = await pdfjsLib.getDocument({ data }).promise;
    this.outline = null;
    this.bookKey = `pos:${id}`;
    const saved = Number(load(this.bookKey, 1));
    this.page = this.clamp(saved);
    await this.render('top');
  }

  get pageCount() {
    return this.doc ? this.doc.numPages : 0;
  }

  get step() {
    return this.spread ? 2 : 1;
  }

  clamp(n) {
    return Math.min(Math.max(1, Math.floor(n) || 1), Math.max(1, this.pageCount));
  }

  // Returns true when the page actually changed.
  async go(delta) {
    if (!this.doc) return false;
    const target = this.clamp(this.page + delta * this.step);
    if (target === this.page) return false;
    this.page = target;
    // Going back while zoomed lands at the bottom of the page, where you'd
    // pick up reading it again.
    await this.render(delta < 0 ? 'bottom' : 'top');
    return true;
  }

  next() { return this.go(1); }
  prev() { return this.go(-1); }

  async goTo(n) {
    if (!this.doc) return false;
    let target = this.clamp(n);
    // In a spread, keep page pairs the same as when turning from page 1.
    if (this.spread) target -= (target - 1) % 2;
    if (target === this.page) {
      this.container.scrollTo({ top: 0 });
      return false;
    }
    this.page = target;
    await this.render('top');
    return true;
  }

  async setSpread(on) {
    this.spread = on;
    if (this.doc) await this.render();
  }

  async setZoom(z) {
    const zoom = Math.min(ZOOMS.at(-1), Math.max(1, z));
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    if (this.doc) await this.render('keep');
  }

  // Zoomed in, the page is taller than the window: scroll by most of a
  // screen. Returns true if it scrolled, false at the bottom (or top).
  scroll(direction) {
    const el = this.container;
    const room = direction === 'next'
      ? el.scrollHeight - el.clientHeight - el.scrollTop
      : el.scrollTop;
    if (room < 4) return false;
    const by = Math.min(room, Math.round(el.clientHeight * 0.85));
    el.scrollBy({ top: direction === 'next' ? by : -by, behavior: 'smooth' });
    return true;
  }

  // where: 'top' or 'bottom' of the new page, or 'keep' the same spot.
  async render(where = 'keep') {
    if (!this.doc) return;
    const token = ++this.renderToken;
    const pages = [this.page];
    if (this.spread && this.page + 1 <= this.pageCount) pages.push(this.page + 1);

    const loaded = await Promise.all(pages.map((n) => this.doc.getPage(n)));
    if (token !== this.renderToken) return; // a newer turn started

    const el = this.container;
    const gap = 16;
    const availW = Math.max(100, el.clientWidth - 32 - gap * (loaded.length - 1));
    const availH = Math.max(100, el.clientHeight - 32);
    const base = loaded.map((p) => p.getViewport({ scale: 1 }));
    const totalW = base.reduce((s, v) => s + v.width, 0);
    const maxH = Math.max(...base.map((v) => v.height));
    const scale = Math.min(availW / totalW, availH / maxH) * this.zoom;
    const dpr = window.devicePixelRatio || 1;

    const canvases = await Promise.all(loaded.map(async (p) => {
      const css = p.getViewport({ scale });
      const sharp = Math.min(dpr, Math.sqrt(MAX_PIXELS / (css.width * css.height)));
      const vp = p.getViewport({ scale: scale * sharp });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(css.width)}px`;
      c.style.height = `${Math.floor(css.height)}px`;
      c.className = 'page';
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return c;
    }));
    if (token !== this.renderToken) return;

    // Keep the same point in the middle of the window when zooming.
    const centre = {
      x: (el.scrollLeft + el.clientWidth / 2) / Math.max(1, el.scrollWidth),
      y: (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight),
    };
    el.replaceChildren(...canvases);
    el.classList.toggle('zoomed', this.zoom > 1);
    if (where === 'top') el.scrollTo({ top: 0, left: 0 });
    else if (where === 'bottom') el.scrollTo({ top: el.scrollHeight, left: 0 });
    else {
      el.scrollLeft = centre.x * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = centre.y * el.scrollHeight - el.clientHeight / 2;
    }
    save(this.bookKey, this.page);
    this.onChange?.(this.label());
  }

  label() {
    if (!this.doc) return '';
    const last = this.spread ? Math.min(this.page + 1, this.pageCount) : this.page;
    const shown = last === this.page ? `${this.page}` : `${this.page}–${last}`;
    return `Page ${shown} of ${this.pageCount}`;
  }

  // The PDF's table of contents, with a page number for each entry.
  // Entries whose target can't be found keep page null.
  async loadOutline() {
    if (this.outline) return this.outline;
    const doc = this.doc;
    if (!doc) return [];
    let raw = null;
    try {
      raw = await doc.getOutline();
    } catch {
      raw = null;
    }
    const pageOf = async (dest) => {
      try {
        const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
        if (!Array.isArray(explicit)) return null;
        const ref = explicit[0];
        const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
        return index + 1;
      } catch {
        return null;
      }
    };
    const walk = (items = []) => Promise.all(items.map(async (item) => ({
      title: (item.title || '').trim() || 'Untitled',
      page: item.dest ? await pageOf(item.dest) : null,
      items: await walk(item.items),
    })));
    const outline = await walk(raw || []);
    if (doc === this.doc) this.outline = outline;
    return outline;
  }

  // A small picture of the first page, for the recent books list.
  async cover(width = 160) {
    if (!this.doc) return null;
    try {
      const page = await this.doc.getPage(1);
      const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return await new Promise((resolve) => c.toBlob(resolve, 'image/webp', 0.8));
    } catch {
      return null;
    }
  }
}
