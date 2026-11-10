// PDF rendering with PDF.js: single page or two-page spread, fitted to the
// window, with the last page remembered per book in this browser.
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';
import { load, save } from './storage.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export class Reader {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.doc = null;
    this.page = 1;        // first page shown
    this.spread = false;
    this.bookKey = null;
    this.renderToken = 0;
  }

  async open(file) {
    const data = await file.arrayBuffer();
    if (this.doc) this.doc.destroy();
    this.doc = await pdfjsLib.getDocument({ data }).promise;
    this.bookKey = `pos:${file.name}:${file.size}`;
    const saved = Number(load(this.bookKey, 1));
    this.page = this.clamp(saved);
    await this.render();
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
    await this.render();
    return true;
  }

  next() { return this.go(1); }
  prev() { return this.go(-1); }

  async setSpread(on) {
    this.spread = on;
    if (this.doc) await this.render();
  }

  async render() {
    if (!this.doc) return;
    const token = ++this.renderToken;
    const pages = [this.page];
    if (this.spread && this.page + 1 <= this.pageCount) pages.push(this.page + 1);

    const loaded = await Promise.all(pages.map((n) => this.doc.getPage(n)));
    if (token !== this.renderToken) return; // a newer turn started

    const gap = 16;
    const box = this.container.getBoundingClientRect();
    const availW = Math.max(100, box.width - 32 - gap * (loaded.length - 1));
    const availH = Math.max(100, box.height - 32);
    const base = loaded.map((p) => p.getViewport({ scale: 1 }));
    const totalW = base.reduce((s, v) => s + v.width, 0);
    const maxH = Math.max(...base.map((v) => v.height));
    const scale = Math.min(availW / totalW, availH / maxH);
    const dpr = window.devicePixelRatio || 1;

    const canvases = await Promise.all(loaded.map(async (p) => {
      const vp = p.getViewport({ scale: scale * dpr });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / dpr)}px`;
      c.style.height = `${Math.floor(vp.height / dpr)}px`;
      c.className = 'page';
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return c;
    }));
    if (token !== this.renderToken) return;

    this.container.replaceChildren(...canvases);
    save(this.bookKey, this.page);
    this.onChange?.(this.label());
  }

  label() {
    if (!this.doc) return '';
    const last = this.spread ? Math.min(this.page + 1, this.pageCount) : this.page;
    const shown = last === this.page ? `${this.page}` : `${this.page}–${last}`;
    return `Page ${shown} of ${this.pageCount}`;
  }
}
