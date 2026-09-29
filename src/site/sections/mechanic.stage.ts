// The simulator's piece. One canvas, redrawn as the state changes:
//   • while the state is moving: a DRAFT (small, fast) — one in flight at a time, always for the latest state, so the
//     preview updates as fast as the CPU allows and never starves (we never cancel a draft mid-flight);
//   • shortly after the state stops moving: the FULL render, cancelled the moment the state moves again.
// All work goes through the site's serialised queue (lib/piece.ts) so it shares the CPU politely with other sections.

import { composite, renderPieceAsync, type PieceState } from '../../art/index.ts';
import { enqueue, fitSize } from '../lib/piece.ts';

const PRI_DRAFT = 20;
const PRI_FULL = 12;

export type StageQuality = 'none' | 'draft' | 'full';

export interface StageOpts {
  canvas: HTMLCanvasElement;
  seed: string;
  /** ms of stillness before the full render starts */
  settleMs?: number;
  onQuality?: (q: StageQuality) => void;
  onPaint?: () => void;
}

export class Stage {
  private g: CanvasRenderingContext2D;
  private draftCv = document.createElement('canvas');
  private dg: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  private want: PieceState | null = null;
  private ver = 0;
  private drawn = -1;
  private drawnFull = -1;
  private busy = false;
  private full: { cancel: () => void } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private visible = false;
  private dead = false;
  private k = 0.4; // draft scale, adapts to the CPU
  private quality: StageQuality = 'none';
  private seed: string;
  private settleMs: number;

  constructor(private o: StageOpts) {
    this.g = o.canvas.getContext('2d', { alpha: false })!;
    this.dg = this.draftCv.getContext('2d', { alpha: false })!;
    this.seed = o.seed;
    this.settleMs = o.settleMs ?? 220;
  }

  get hasPaint() { return this.quality !== 'none'; }

  private pending = false;
  setState(s: PieceState) {
    this.want = s;
    this.ver++;
    this.cancelFull();
    // start the work on the next task, never inside an input handler (a layer's first step runs synchronously)
    if (!this.pending) {
      this.pending = true;
      setTimeout(() => { this.pending = false; this.kick(); }, 0);
    }
  }

  /** CSS size of the frame → internal pixel size (DPR-capped, pixel-budgeted). */
  setSize(cssW: number, cssH: number) {
    if (cssW < 8 || cssH < 8) return;
    const { w, h } = fitSize(cssW, cssH);
    if (w === this.W && h === this.H) return;
    const c = this.o.canvas;
    let snap: HTMLCanvasElement | null = null;
    if (this.W && this.quality !== 'none') {
      snap = document.createElement('canvas');
      snap.width = c.width; snap.height = c.height;
      snap.getContext('2d')!.drawImage(c, 0, 0);
    }
    this.W = w; this.H = h;
    c.width = w; c.height = h;
    if (snap) { this.g.imageSmoothingQuality = 'high'; this.g.drawImage(snap, 0, 0, w, h); }
    this.drawn = -1; this.drawnFull = -1;
    this.cancelFull();
    this.kick();
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.kick();
    else this.cancelFull();
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    this.cancelFull();
  }

  private cancelFull() {
    clearTimeout(this.timer); this.timer = undefined;
    this.full?.cancel(); this.full = null;
  }

  private setQuality(q: StageQuality) {
    if (q === this.quality) return;
    this.quality = q;
    this.o.onQuality?.(q);
  }

  private kick() {
    if (this.dead || !this.visible || !this.want || !this.W || this.busy) return;
    if (this.drawn !== this.ver) return this.startDraft();
    if (this.drawnFull !== this.ver && !this.full && this.timer === undefined) {
      // the very first paint should not wait for stillness
      const wait = this.quality === 'draft' && this.drawnFull < 0 && this.ver === 1 ? 0 : this.settleMs;
      this.timer = setTimeout(() => { this.timer = undefined; this.startFull(); }, wait);
    }
  }

  private startDraft() {
    const ver = this.ver;
    const st = this.want!;
    const dw = Math.max(2, Math.round(this.W * this.k));
    const dh = Math.max(2, Math.round(this.H * this.k));
    const t0 = performance.now();
    this.busy = true;
    const job = enqueue(PRI_DRAFT, (c) => renderPieceAsync(this.seed, st, dw, dh, { quality: 'draft' }, c));
    job.promise.then((p) => {
      this.busy = false;
      if (this.dead) return;
      if (p) {
        if (this.draftCv.width !== dw || this.draftCv.height !== dh) { this.draftCv.width = dw; this.draftCv.height = dh; }
        composite(this.dg, p);
        this.g.imageSmoothingQuality = 'high';
        // a draft never overwrites a finished full render of the very same state
        if (this.drawnFull !== ver) this.g.drawImage(this.draftCv, 0, 0, this.W, this.H);
        this.drawn = ver;
        if (this.drawnFull !== ver) this.setQuality('draft');
        this.o.onPaint?.();
        // adapt: aim for ~150 ms drafts
        const ms = performance.now() - t0;
        if (ms > 260) this.k = Math.max(0.24, this.k * 0.85);
        else if (ms < 90) this.k = Math.min(0.5, this.k * 1.1);
      }
      this.kick();
    });
  }

  private startFull() {
    if (this.dead || !this.visible || !this.want) return;
    const ver = this.ver, st = this.want, W = this.W, H = this.H;
    const job = enqueue(PRI_FULL, (c) => renderPieceAsync(this.seed, st, W, H, { quality: 'full' }, c));
    this.full = job;
    job.promise.then((p) => {
      if (this.full === job) this.full = null;
      if (this.dead) return;
      if (p && ver === this.ver && W === this.W && H === this.H) {
        composite(this.g, p);
        this.drawnFull = ver;
        this.setQuality('full');
        this.o.onPaint?.();
      }
      this.kick();
    });
  }
}
