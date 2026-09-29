// The story's picture engine.
//
//   Frame  one render (a seed at one moment) on its own canvas: cancellable, draft-then-full, released when far away.
//   Stage  a stack of frames that crossfade. The incoming frame always fades in on top of an opaque one, so the
//          picture never dips through black; whatever ends up covered is hidden (and leaves the accessibility tree).

import { renderPieceAsync, type Piece, type PieceState, type RenderOpts } from '../../art/index.ts';
import { enqueue, flatten, type Cancel } from '../lib/piece.ts';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Flatten a Piece the way composite() does, but a layer at a time with a breath between them, on a scratch
 * canvas, so finishing a render never holds the main thread for a whole blend pass. Returns the scratch canvas.
 */
async function flattenGently(piece: Piece, c: Cancel): Promise<HTMLCanvasElement | null> {
  const off = document.createElement('canvas');
  off.width = piece.w;
  off.height = piece.h;
  const g = off.getContext('2d')!;
  const b = piece.base;
  g.fillStyle = `rgb(${Math.round(b[0])},${Math.round(b[1])},${Math.round(b[2])})`;
  g.fillRect(0, 0, piece.w, piece.h);
  for (const L of piece.layers) {
    g.globalCompositeOperation = L.blend;
    g.globalAlpha = Math.min(1, Math.max(0, L.alpha));
    g.drawImage(L.canvas, 0, 0, piece.w, piece.h);
    await nextFrame();
    if (c.cancelled) return null;
  }
  return off;
}

export interface FrameSpec {
  id: string;
  seed: string;
  state: PieceState;
  only?: RenderOpts['only'];
  /** caption: label · meta · a line of prose */
  label: string;
  meta: string;
  line: string;
}

export interface FrameHost {
  /** a frame gained pixels (draft or full) */
  changed(f: Frame): void;
  /** another frame with identical pixels at this size, if one exists (avoids re-rendering) */
  twin(f: Frame): Frame | null;
}

export class Frame {
  readonly canvas = document.createElement('canvas');
  /** 0 nothing · 1 draft · 2 full */
  quality: 0 | 1 | 2 = 0;
  alpha = 0;
  target = 0;
  z = 0;
  w = 0;
  h = 0;
  readonly key: string;
  private job: { cancel(): void } | null = null;
  private running = false;
  private jobPri = -1;

  constructor(readonly spec: FrameSpec, private host: FrameHost) {
    const s = spec.state;
    this.key = `${spec.seed}|${s.block}|${s.horizon}|${s.sky ?? ''}|${spec.only?.join(',') ?? ''}`;
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `${spec.label}. ${spec.meta}.`);
    this.canvas.className = 'story__cv';
    this.canvas.style.visibility = 'hidden';
    this.canvas.style.opacity = '0';
  }

  get pending() { return !!this.job; }
  get usable() { return this.quality > 0; }

  private size(w: number, h: number) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.w = w; this.h = h;
    return this.canvas.getContext('2d')!;
  }

  /** Ask for pixels at (w, h). Cheap to call again; a queued-but-unstarted job is upgraded if `pri` rises. */
  request(w: number, h: number, pri: number, progressive: boolean) {
    if (this.quality === 2 && this.w === w && this.h === h) return;
    if (this.quality > 0 && (this.w !== w || this.h !== h)) this.release();
    if (this.job) {
      if (pri > this.jobPri && !this.running) this.cancel();
      else return;
    }
    const twin = this.host.twin(this);
    if (twin && twin.quality === 2 && twin.w === w && twin.h === h) {
      this.size(w, h).drawImage(twin.canvas, 0, 0);
      this.quality = 2;
      this.host.changed(this);
      return;
    }
    this.jobPri = pri;
    const job = enqueue(pri, async (c) => {
      this.running = true;
      const { seed, state, only } = this.spec;
      // an identical frame elsewhere may have finished while we waited in the queue
      const twin2 = this.host.twin(this);
      if (twin2 && twin2.quality === 2 && twin2.w === w && twin2.h === h) {
        this.size(w, h).drawImage(twin2.canvas, 0, 0);
        this.quality = 2;
        this.host.changed(this);
        return true;
      }
      if (progressive && this.quality === 0) {
        const d = await renderPieceAsync(seed, state, Math.max(8, Math.round(w * 0.4)), Math.max(8, Math.round(h * 0.4)), { quality: 'draft', only }, c);
        if (!d || c.cancelled) return null;
        const g = this.size(w, h);
        g.imageSmoothingQuality = 'high';
        g.drawImage(flatten(d), 0, 0, w, h);
        this.quality = 1;
        this.host.changed(this);
      }
      const p = await renderPieceAsync(seed, state, w, h, { quality: 'full', only }, c);
      if (!p || c.cancelled) return null;
      const flat = await flattenGently(p, c);
      if (!flat || c.cancelled) return null;
      this.size(w, h).drawImage(flat, 0, 0);
      this.quality = 2;
      this.host.changed(this);
      return true;
    });
    this.job = job;
    void job.promise.then(() => { if (this.job === job) { this.job = null; this.running = false; } });
  }

  /** Stop a render that has not finished. Pixels already painted (a draft) stay. */
  cancel() {
    if (!this.job) return;
    this.job.cancel();
    this.job = null;
    this.running = false;
  }

  /** Free the backing store. */
  release() {
    this.cancel();
    if (this.quality === 0 && this.w === 0) return;
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.quality = 0;
    this.w = this.h = 0;
    this.alpha = this.target = 0;
    this.canvas.style.opacity = '0';
    this.canvas.style.visibility = 'hidden';
  }
}

export class Stage {
  readonly frames = new Map<string, Frame>();
  private want: Array<[Frame, number]> = [];
  private wantSet = new Set<Frame>();
  private sig = '';
  private zc = 1;
  private tau = 400;
  private raf = 0;
  private last = 0;
  private dead = false;

  constructor(readonly el: HTMLElement) {}

  add(f: Frame) {
    this.frames.set(f.spec.id, f);
    this.el.append(f.canvas);
  }
  remove(f: Frame) {
    this.frames.delete(f.spec.id);
    f.release();
    f.canvas.remove();
    this.wantSet.delete(f);
    this.want = this.want.filter(([g]) => g !== f);
  }

  /**
   * Set what should be visible, bottom → top, with alphas. Frames without pixels yet are ignored (the
   * previous picture stays). `tau` is the fade time constant in ms; 0 switches instantly.
   */
  show(list: Array<[Frame, number]>, tau: number) {
    this.tau = tau;
    const ready = list.filter(([f]) => f.usable);
    if (!ready.length) return;
    // if the base of the mix is missing, promote the first frame we do have to opaque
    if (ready.length < list.length && ready[0]![1] < 1 && list[0]![0] !== ready[0]![0]) ready[0]![1] = 1;
    this.want = ready;
    const sig = ready.map(([f]) => f.spec.id).join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      this.wantSet = new Set(ready.map(([f]) => f));
      for (const [f] of ready) { f.z = ++this.zc; f.canvas.style.zIndex = String(f.z); }
    }
    for (const [f, a] of ready) f.target = a;
    this.kick();
  }

  /** The frame currently carrying the picture (highest alpha, then highest z). */
  private kick() {
    if (this.dead) return;
    if (this.tau <= 0) { this.step(0); return; }
    if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame((t) => this.frame(t)); }
  }

  private frame(now: number) {
    this.raf = 0;
    const dt = this.last ? Math.min(80, now - this.last) : 16;
    this.last = now;
    const moving = this.step(dt);
    if (moving && !this.dead) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** One integration step. Returns true while anything is still moving. */
  private step(dt: number): boolean {
    const live = [...this.frames.values()].filter((f) => f.usable || f.alpha > 0).sort((a, b) => b.z - a.z); // top → bottom
    // 1. what is fully covered by the frames above it? Hide it (or snap it, if it is wanted): nobody can see the change.
    let open = 1;
    for (const f of live) {
      if (open <= 0.012) {
        if (this.wantSet.has(f)) f.alpha = f.target; else { f.alpha = 0; f.target = 0; }
      }
      open *= 1 - f.alpha;
    }
    // 2. ease everything else towards its target
    const k = this.tau <= 0 ? 1 : 1 - Math.exp(-dt / this.tau);
    let moving = false;
    for (const f of live) {
      if (!this.wantSet.has(f)) f.target = f.alpha; // unwanted frames are held until covered
      const d = f.target - f.alpha;
      if (Math.abs(d) < 0.004) f.alpha = f.target;
      else { f.alpha += d * k; moving = true; }
      const cv = f.canvas.style;
      cv.opacity = f.alpha < 0.001 ? '0' : f.alpha.toFixed(3);
      cv.visibility = f.alpha < 0.001 ? 'hidden' : 'visible';
    }
    return moving;
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.frames.values()) f.release();
    this.frames.clear();
  }
}
