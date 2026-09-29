// Lazy, cancellable art for the timeline and mint sections. Renders only while (near) visible,
// cancels stale queued work when scrolled away, re-renders when the box grows a lot.

import type { PieceState } from '../../art/index.ts';
import { getThumb, paintProgressive, fitSize, pixelBudget } from './piece.ts';
import { watchVisible, debounce } from './dom.ts';

export interface LazyArt { dispose(): void }

type Job = { cancel: () => void };

// Priorities in the shared render queue: the gallery tiles use 10–25 and the detail view 90+. Frames on screen
// beat off-screen gallery work; frames merely near the viewport wait behind it.
const PRI_VIEW = 26, PRI_NEAR = 8;
const inViewport = (el: Element) => { const b = el.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; };

/**
 * A 4:5 (or `aspect`) thumbnail into `canvas`, rendered through the cached flat thumbnails.
 * `frame` is the sized box (aspect-ratio reserved in CSS) that gets `.is-ready` once painted.
 */
export function lazyThumb(
  frame: HTMLElement, canvas: HTMLCanvasElement, seed: string, state: PieceState,
  o: { aspect?: number; pri?: number; margin?: string; onReady?: () => void } = {},
): LazyArt {
  const aspect = o.aspect ?? 0.8;
  let job: Job | null = null;
  let jobPri = 0;
  let done = false, disposed = false, visible = false, paintedW = 0;

  const start = () => {
    if (disposed || job) return;
    const cssW = frame.clientWidth;
    if (!cssW) return;
    if (done && cssW <= paintedW * 1.35) return; // already sharp enough
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // ≥ 500 px wide gets the full-quality render, smaller ones the (cheaper) draft
    let w = Math.round(cssW * dpr);
    if (cssW >= 200) w = Math.max(w, 500);
    w = Math.min(w, 1100);
    const h = Math.round(w / aspect);
    jobPri = (inViewport(frame) ? PRI_VIEW : PRI_NEAR) + (o.pri ?? 0);
    const j = getThumb(seed, state, w, h, jobPri);
    job = j;
    j.promise.then((cv) => {
      if (job === j) job = null;
      if (!cv || disposed) return;
      canvas.width = cv.width; canvas.height = cv.height;
      canvas.getContext('2d')!.drawImage(cv, 0, 0);
      paintedW = cssW;
      if (!done) { done = true; frame.classList.remove('frame--ph'); frame.classList.add('is-ready'); o.onReady?.(); }
    });
  };
  const stop = () => { if (job) { job.cancel(); job = null; } };

  const offVis = watchVisible(frame, (v) => { visible = v; v ? start() : stop(); }, o.margin ?? '320px');
  // scrolled into view while still waiting at low priority: re-queue it ahead of the off-screen work
  const offView = watchVisible(frame, (v) => { if (v && job && jobPri < PRI_VIEW) { stop(); start(); } }, '0px');
  const onResize = debounce(() => { if (visible) start(); }, 250);
  window.addEventListener('resize', onResize);

  return {
    dispose() {
      disposed = true;
      stop();
      offVis();
      offView();
      window.removeEventListener('resize', onResize);
    },
  };
}

/** A large progressive (draft → full) painting into `canvas`, sized from the frame's CSS box. */
export function lazyPainting(
  frame: HTMLElement, canvas: HTMLCanvasElement, seed: string, state: PieceState,
  o: { aspect?: number; pri?: number; margin?: string; maxPx?: number } = {},
): LazyArt {
  const aspect = o.aspect ?? 0.8;
  let job: Job | null = null;
  let jobPri = 0;
  let done = false, disposed = false, visible = false, paintedW = 0;

  const start = () => {
    if (disposed || job) return;
    const cssW = frame.clientWidth;
    if (!cssW) return;
    if (done && cssW <= paintedW * 1.3) return;
    const { w } = fitSize(cssW, cssW / aspect, o.maxPx ?? Math.min(pixelBudget(), 1_400_000));
    const W = Math.round(w), H = Math.round(w / aspect);
    // a repaint goes to an offscreen canvas first, so the visible image never blanks
    const target = done ? document.createElement('canvas') : canvas;
    jobPri = (inViewport(frame) ? PRI_VIEW : PRI_NEAR) + (o.pri ?? 0);
    const j = paintProgressive(target, seed, state, W, H, jobPri);
    job = j;
    j.promise.then((piece) => {
      if (job === j) job = null;
      if (!piece || disposed) return;
      if (target !== canvas) { canvas.width = W; canvas.height = H; canvas.getContext('2d')!.drawImage(target, 0, 0); }
      paintedW = cssW;
      if (!done) { done = true; frame.classList.remove('frame--ph'); frame.classList.add('is-ready'); }
    });
  };
  const stop = () => { if (job) { job.cancel(); job = null; } };

  const offVis = watchVisible(frame, (v) => { visible = v; v ? start() : stop(); }, o.margin ?? '400px');
  const offView = watchVisible(frame, (v) => { if (v && job && jobPri < PRI_VIEW) { stop(); start(); } }, '0px');
  const onResize = debounce(() => { if (visible) start(); }, 300);
  window.addEventListener('resize', onResize);
  return {
    dispose() {
      disposed = true; stop(); offVis(); offView();
      window.removeEventListener('resize', onResize);
    },
  };
}
