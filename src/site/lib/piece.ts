// The site's rendering toolkit: a serialised, cancellable render queue, progressive
// painting (draft → full), a thumbnail cache, and the live parallax piece for the hero.

import {
  composite, renderPieceAsync, type Piece, type PieceState, type RenderOpts, type Motion,
} from '../../art/index.ts';
import { reducedMotion } from './motion.ts';

export interface Cancel { cancelled: boolean }

// ── serialised queue ─────────────────────────────────────────────────
interface Job { pri: number; seq: number; run: (c: Cancel) => Promise<unknown>; cancel: Cancel; resolve: (v: any) => void }
const jobs: Job[] = [];
let busy = false;
let seq = 0;

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (jobs.length) {
      jobs.sort((a, b) => b.pri - a.pri || a.seq - b.seq);
      const j = jobs.shift()!;
      if (j.cancel.cancelled) { j.resolve(null); continue; }
      try { j.resolve(await j.run(j.cancel)); } catch (e) { console.error('[halocline] render job failed', e); j.resolve(null); }
      await new Promise((r) => setTimeout(r, 0)); // let input events through
    }
  } finally { busy = false; }
}

/** Queue a job. Higher `pri` runs first. Cancel a queued or running job via the returned handle. */
export function enqueue<T>(pri: number, run: (c: Cancel) => Promise<T>): { promise: Promise<T | null>; cancel: () => void } {
  const cancel: Cancel = { cancelled: false };
  const promise = new Promise<T | null>((resolve) => { jobs.push({ pri, seq: seq++, run, cancel, resolve }); pump(); });
  return { promise, cancel: () => { cancel.cancelled = true; } };
}

// ── sizing ───────────────────────────────────────────────────────────
export function pixelBudget(): number {
  const mem = (navigator as any).deviceMemory as number | undefined;
  const small = Math.min(screen.width, screen.height) < 700;
  return small || (mem && mem <= 4) ? 1_100_000 : 2_100_000;
}
/** Internal pixel size for a CSS box: DPR capped at 1.5 and total pixels capped by budget. */
export function fitSize(cssW: number, cssH: number, maxPx = pixelBudget(), dprCap = 1.5) {
  let k = Math.min(window.devicePixelRatio || 1, dprCap);
  if (cssW * cssH * k * k > maxPx) k = Math.sqrt(maxPx / (cssW * cssH));
  return { w: Math.max(2, Math.round(cssW * k)), h: Math.max(2, Math.round(cssH * k)) };
}

export function flatten(piece: Piece, motion?: Motion): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = piece.w; cv.height = piece.h;
  composite(cv.getContext('2d')!, piece, motion);
  return cv;
}

/** Render (cooperatively) and return the Piece. */
export function renderQueued(seed: string, state: PieceState, w: number, h: number, opts: RenderOpts = {}, pri = 0) {
  return enqueue(pri, (c) => renderPieceAsync(seed, state, w, h, opts, c));
}

/**
 * Paint a canvas: a quick draft first, then the full render. Resolves to the full Piece (or null if cancelled).
 * The canvas is sized to (w, h) internal pixels; style its CSS size yourself.
 */
export function paintProgressive(canvas: HTMLCanvasElement, seed: string, state: PieceState, w: number, h: number, pri = 0, opts: RenderOpts = {}) {
  const job = enqueue(pri, async (c) => {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext('2d')!;
    if (!opts.only && !opts.skip) {
      const k = 0.4;
      const draft = await renderPieceAsync(seed, state, Math.round(w * k), Math.round(h * k), { ...opts, quality: 'draft' }, c);
      if (!draft || c.cancelled) return null;
      const t = flatten(draft);
      g.imageSmoothingQuality = 'high';
      g.drawImage(t, 0, 0, w, h);
    }
    const full = await renderPieceAsync(seed, state, w, h, { ...opts, quality: 'full' }, c);
    if (!full || c.cancelled) return null;
    composite(g, full);
    return full;
  });
  return job;
}

// ── thumbnails ───────────────────────────────────────────────────────
const thumbs = new Map<string, HTMLCanvasElement>();
export const thumbKey = (seed: string, s: PieceState, w: number, h: number) => `${seed}|${s.block}|${s.horizon}|${s.sky ?? ''}|${w}x${h}`;

/** Flattened render, cached (LRU-ish, 80 entries). */
export function getThumb(seed: string, state: PieceState, w: number, h: number, pri = 0) {
  const key = thumbKey(seed, state, w, h);
  const hit = thumbs.get(key);
  if (hit) { thumbs.delete(key); thumbs.set(key, hit); return { promise: Promise.resolve(hit) as Promise<HTMLCanvasElement | null>, cancel: () => {} }; }
  return enqueue(pri, async (c) => {
    const p = await renderPieceAsync(seed, state, w, h, { quality: w < 500 ? 'draft' : 'full' }, c);
    if (!p || c.cancelled) return null;
    const cv = flatten(p);
    thumbs.set(key, cv);
    if (thumbs.size > 80) thumbs.delete(thumbs.keys().next().value!);
    return cv;
  });
}

// ── live piece (hero) ────────────────────────────────────────────────
/**
 * Draws a Piece continuously with pointer parallax and a slow breath, crossfading between pieces.
 * Adaptive: if compositing is slow it drops to on-demand redraws. Honors prefers-reduced-motion (static).
 */
export class LivePiece {
  private g: CanvasRenderingContext2D;
  private cur: Piece | null = null;
  private prev: HTMLCanvasElement | null = null;
  private fade = 1;
  private fadeMs = 1400;
  private raf = 0;
  private running = false;
  private visible = true;
  private px = 0; private py = 0; private tx = 0; private ty = 0;
  private t0 = performance.now();
  private slow = 0;
  private lastDraw = 0;
  private dirty = true;
  bleed = 0.028;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d', { alpha: false })!;
  }
  get piece() { return this.cur; }

  setPiece(p: Piece, crossfade = true) {
    if (this.cur && crossfade && !reducedMotion()) {
      this.prev = flatten(this.cur, { dx: this.px, dy: this.py, time: (performance.now() - this.t0) / 1000, bleed: this.bleed });
      this.fade = 0;
    } else { this.prev = null; this.fade = 1; }
    if (p.w !== this.canvas.width || p.h !== this.canvas.height) { this.canvas.width = p.w; this.canvas.height = p.h; }
    this.cur = p;
    this.dirty = true;
    this.kick();
  }
  pointer(nx: number, ny: number) { this.tx = nx; this.ty = ny; this.dirty = true; this.kick(); }
  setVisible(v: boolean) { this.visible = v; if (v) this.kick(); }
  start() { this.running = true; this.kick(); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); this.raf = 0; }

  private kick() { if (this.running && !this.raf) this.raf = requestAnimationFrame((t) => this.frame(t)); }

  private frame(now: number) {
    this.raf = 0;
    if (!this.running || !this.cur) return;
    if (!this.visible || document.hidden) return;
    const reduced = reducedMotion();
    const throttled = this.slow > 8;
    const minGap = throttled ? 66 : 16;
    if (now - this.lastDraw < minGap) { this.kick(); return; }
    this.lastDraw = now;

    this.px += (this.tx - this.px) * 0.06; this.py += (this.ty - this.py) * 0.06;
    const moving = Math.abs(this.tx - this.px) + Math.abs(this.ty - this.py) > 0.002;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + 16 / this.fadeMs);
    const animating = !reduced || this.fade < 1;
    if (!this.dirty && !animating && !moving) return;

    const t0 = performance.now();
    const time = reduced ? 0 : (now - this.t0) / 1000;
    const m: Motion = { dx: reduced ? 0 : this.px, dy: reduced ? 0 : this.py, time, bleed: reduced ? 0 : this.bleed };
    composite(this.g, this.cur, m);
    if (this.prev && this.fade < 1) {
      const e = 1 - Math.pow(1 - this.fade, 3);
      this.g.globalAlpha = 1 - e;
      this.g.drawImage(this.prev, 0, 0, this.canvas.width, this.canvas.height);
      this.g.globalAlpha = 1;
    } else this.prev = null;
    const cost = performance.now() - t0;
    this.slow = cost > 26 ? Math.min(20, this.slow + 1) : Math.max(0, this.slow - 0.25);
    this.dirty = moving || this.fade < 1;
    if (animating && !throttled) this.kick();
    else if (animating) this.kick();
  }
}
