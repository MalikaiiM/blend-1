// Render controller for the explainer.
//
// The knobs write into the global PARAMS, which every other section reads too. To make sure nobody else ever sees a
// tweaked value, the overrides are applied ONLY while one of this section's own layer steps is running: they are
// restored before every yield to the browser (see `pause`) and again when the job ends. Because the site's render
// queue is serialised, nothing else can render in between.
//
// WARNING for whoever edits this: never call setParam() from UI code directly. Put the value in `overrides`.

import { renderPieceAsync, setParam, defaultParam, resetParams, type Piece, type PieceState } from '../../art/index.ts';
import { enqueue } from '../lib/piece.ts';
import { nextFrame } from '../lib/dom.ts';

export type Quality = 'draft' | 'full';
export type Mode = 'progressive' | 'draft' | 'full';

export interface Job { w: number; h: number; seed: string; state: PieceState }

const DRAFT_K = 0.45;

export class Renderer {
  private overrides = new Map<string, number>();
  private cancelFn: (() => void) | null = null;
  private token = 0;
  busy = false;
  onBusy: (busy: boolean) => void = () => {};

  setKnob(path: string, value: number) {
    if (Object.is(value, defaultParam(path))) this.overrides.delete(path);
    else this.overrides.set(path, value);
  }
  hasKnob(path: string) { return this.overrides.has(path); }
  get changed() { return this.overrides.size; }
  clearKnobs() { this.overrides.clear(); resetParams(); }

  private apply = () => { for (const [p, v] of this.overrides) setParam(p, v); };
  private restore = () => { for (const p of this.overrides.keys()) setParam(p, defaultParam(p)); };

  cancel() {
    this.token++;
    this.cancelFn?.();
    this.cancelFn = null;
    this.setBusy(false);
  }

  private setBusy(b: boolean) { if (this.busy !== b) { this.busy = b; this.onBusy(b); } }

  /** Render (cancelling any render still in flight). `onPiece` is called for the draft and/or the full piece. */
  render(job: Job, mode: Mode, onPiece: (p: Piece, q: Quality) => void, pri = 5) {
    this.cancel();
    const token = this.token;
    this.setBusy(true);
    const { promise, cancel } = enqueue(pri, async (c) => {
      const pause = async () => { this.restore(); await nextFrame(); this.apply(); };
      const run = async (w: number, h: number, quality: Quality) => {
        this.apply();
        try { return await renderPieceAsync(job.seed, job.state, w, h, { quality }, c, pause); }
        finally { this.restore(); }
      };
      if (mode !== 'full') {
        const d = await run(Math.max(2, Math.round(job.w * DRAFT_K)), Math.max(2, Math.round(job.h * DRAFT_K)), 'draft');
        if (!d || c.cancelled || token !== this.token) return null;
        onPiece(d, 'draft');
        if (mode === 'draft') return d;
        await nextFrame(); // let the draft reach the screen before the heavy pass
      }
      const f = await run(job.w, job.h, 'full');
      if (!f || c.cancelled || token !== this.token) return null;
      onPiece(f, 'full');
      return f;
    });
    this.cancelFn = cancel;
    promise.then(() => { if (token === this.token) this.setBusy(false); });
  }
}
