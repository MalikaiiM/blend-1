// HERO — a full-viewport live bloom. Click / tap / Enter draws a new random seed; the next one is
// rendered off-screen (in idle time, once the current one has landed) and crossfaded in only when ready.
//
//   state machine:  cur  = what is on screen          nxt = at most ONE pre-render (or the one being waited for)
//                   want = the visitor asked for a new seed and nxt is not ready yet
//
import '../styles/hero.css';
import {
  PARAMS, STAGES, deriveTraits, paletteById, randomSeed, rehearsalSky, renderPieceAsync,
  type Piece, type PieceState,
} from '../../art/index.ts';
import { HERO } from '../../data/featured.ts';
import { debounce, el, watchVisible } from '../lib/dom.ts';
import { shortSeed } from '../lib/format.ts';
import { onMotionChange, reducedMotion } from '../lib/motion.ts';
import { LivePiece, enqueue, fitSize, pixelBudget } from '../lib/piece.ts';

type H = 0 | 1 | 2 | 3;
interface Spec { seed: string; horizon: H | null; sky: string }
interface Size { w: number; h: number }
interface Slot {
  spec: Spec; size: Size; piece: Piece | null; started: boolean; dead: boolean;
  ready: Promise<Piece | null>; cancel: () => void;
}

// render-queue priorities (lib/piece.ts: higher runs first). The visitor's own frame always beats other sections.
const PRI_NOW = 9;
const PRI_PREFETCH = 2;
const SWAP_FADE = 1400;          // a new seed dissolves in over this long
const REFINE_FADE = 700;         // draft -> full render of the same seed
const RESIZE_FADE = 600;         // same seed, re-rendered for a new aspect
const MIN_GAP = 900;             // don't commit a swap while the last crossfade is still visibly running
const DRAFT_K = 0.45;
const HERO_BUDGET_CAP = 1_900_000; // the hero is soft, atmospheric art: keep the pixel count modest

const stateOf = (s: Spec): PieceState => ({ block: STAGES.bloomed, horizon: s.horizon, sky: s.sky });
const heroBudget = () => Math.min(pixelBudget(), HERO_BUDGET_CAP);

function randomSpec(): Spec {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  const k = r[0]! % 5; // one in five is left unturned: it drifts to its native horizon
  return { seed: randomSeed(), horizon: k === 0 ? null : ((k - 1) as H), sky: rehearsalSky(r[1]! % 1_000_000) };
}

function disposePiece(p: Piece | null) {
  if (!p) return;
  for (const L of p.layers) { L.canvas.width = 0; L.canvas.height = 0; } // let Safari give the memory back now
}

const idle = (fn: () => void, timeout = 700) => {
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o: { timeout: number }) => number);
  if (ric) ric(fn, { timeout }); else setTimeout(fn, 200);
};

const isCoarse = () => matchMedia('(hover: none), (pointer: coarse)').matches;

interface Facts { title: string; palette: string; horizon: string; drifted: boolean; seed: string; glass: string; anchor: [number, number] }
function factsOf(seed: string, traits: { title: string; body: { palette: string }; horizon: { name: string; index: number; turned: boolean } }): Facts {
  const pal = paletteById(traits.body.palette);
  return {
    title: traits.title, palette: pal.name, horizon: traits.horizon.name, drifted: !traits.horizon.turned,
    seed: shortSeed(seed), glass: pal.roles.glass, anchor: PARAMS.horizons[traits.horizon.index]!.anchor,
  };
}

export default function mount(root: HTMLElement): () => void {
  const prior = (root as any).__haloHero as (() => void) | undefined;
  if (prior) return prior; // mounted twice: keep the one instance

  // ── DOM ────────────────────────────────────────────────────────────
  root.classList.add('hero');
  const h1 = root.querySelector<HTMLElement>('.hero__title') ?? el('h1', { class: 'hero__title' }, PARAMS.meta.title);
  const h1WasHidden = h1.classList.contains('visually-hidden');
  h1.classList.remove('visually-hidden');

  const first = HERO[0]!;
  const t0 = deriveTraits(first.seed, { horizon: first.horizon, sky: first.sky });
  const f0 = factsOf(first.seed, t0);

  const ph = el('div', { class: 'hero__ph frame--ph', 'aria-hidden': 'true' });
  const canvas = el('canvas', { class: 'hero__cv', role: 'img', 'aria-label': 'Generative artwork, rendering' });
  // a still copy of the frame being replaced: it sits over the live canvas and dissolves away with a CSS opacity
  // transition (compositor-driven, so the 1.4 s crossfade costs the main thread nothing)
  const ghost = el('canvas', { class: 'hero__ghost', 'aria-hidden': 'true' });
  const stage = el('div', { class: 'hero__stage' }, ph, canvas, ghost);
  const hit = el('button', { class: 'hero__hit', type: 'button', 'aria-label': 'Show a new seed', 'aria-describedby': 'heroHint' });
  const scrim = el('div', { class: 'hero__scrim', 'aria-hidden': 'true' });

  const tag = el('p', { class: 'hero__tag' }, PARAMS.meta.tagline);
  const lock = el('div', { class: 'hero__lock' }, h1, tag);

  const dTitle = el('p', { class: 'hero__work' }, el('em', {}, ' '));
  const vSeed = el('dd', { class: 'num' }, ' ');
  const vPal = el('dd', {}, ' ');
  const vHor = el('dd', {}, ' ');
  const facts = el('dl', { class: 'hero__facts' },
    el('div', {}, el('dt', {}, 'Seed'), vSeed),
    el('div', {}, el('dt', {}, 'Palette'), vPal),
    el('div', {}, el('dt', {}, 'Horizon'), vHor),
  );
  const hint = el('p', { class: 'hero__hint', id: 'heroHint' });
  const cue = el('a', { class: 'hero__scroll', href: '#story' }, el('span', {}, 'Scroll'), el('i', { 'aria-hidden': 'true' }));
  const meta = el('div', { class: 'hero__meta', role: 'group', 'aria-label': 'About the seed on show' },
    el('div', { class: 'hero__label' }, dTitle, facts),
    el('div', { class: 'hero__row' }, hint),
  );
  const foot = el('div', { class: 'hero__foot' }, lock, meta);
  const live = el('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });

  // DOM order = reading order (the heading first) and tab order (the art before its scroll cue); stacking is by z-index
  root.append(foot, stage, scrim, hit, cue, live);

  // ── art ────────────────────────────────────────────────────────────
  const lp = new LivePiece(canvas);
  lp.maxFps = 30;
  let disposed = false;
  let visible = true;
  let cur: Slot | null = null;
  let nxt: Slot | null = null;
  let want = false;
  let lastCommit = 0;
  let rendered: Size = { w: 0, h: 0 };
  let resizeSlot: Slot | null = null;
  let prefetchTimer = 0;
  let pumpTimer = 0;

  const cssSize = () => ({ w: Math.max(2, root.clientWidth), h: Math.max(2, root.clientHeight) });
  const pixelSize = (c = cssSize()): Size => fitSize(c.w, c.h, heroBudget());

  /** Queue a render of `spec` at `size`. With `onDraft`, a quick low-res draft is delivered first. */
  function begin(spec: Spec, size: Size, pri: number, onDraft?: (p: Piece) => void): Slot {
    const st = stateOf(spec);
    const slot = { spec, size, piece: null, started: false, dead: false } as Slot;
    const job = enqueue(pri, async (c) => {
      slot.started = true;
      if (onDraft) {
        const d = await renderPieceAsync(spec.seed, st, Math.max(2, Math.round(size.w * DRAFT_K)), Math.max(2, Math.round(size.h * DRAFT_K)), { quality: 'draft' }, c);
        if (!d || c.cancelled) return null;
        if (!slot.dead) onDraft(d);
      }
      const p = await renderPieceAsync(spec.seed, st, size.w, size.h, { quality: 'full' }, c);
      return !p || c.cancelled ? null : p;
    });
    slot.cancel = () => { slot.dead = true; job.cancel(); };
    slot.ready = job.promise.then((p) => { slot.piece = p; return p; });
    return slot;
  }
  const kill = (s: Slot | null) => { if (s) { s.cancel(); if (s.piece) disposePiece(s.piece); } };

  function setNextState(v: 'idle' | 'rendering' | 'ready') { root.dataset.heroNext = v; }

  // ── caption + accessibility ────────────────────────────────────────
  let swapTimer = 0;
  function paintFacts(f: Facts, animate: boolean) {
    const apply = () => {
      dTitle.firstElementChild!.textContent = f.title;
      vSeed.textContent = f.seed;
      vPal.textContent = f.palette;
      vHor.replaceChildren(f.horizon, ...(f.drifted ? [el('span', { class: 'hero__drift' }, ' · drifted')] : []));
      meta.classList.remove('is-out');
    };
    root.style.setProperty('--accent', f.glass);
    root.style.setProperty('--ax', `${f.anchor[0] * 100}%`);
    root.style.setProperty('--ay', `${f.anchor[1] * 100}%`);
    clearTimeout(swapTimer);
    if (!animate || reducedMotion()) { apply(); return; }
    meta.classList.add('is-out');
    swapTimer = window.setTimeout(apply, 320);
  }
  function describe(p: Piece) {
    const t = p.traits;
    const pal = paletteById(t.body.palette).name;
    const dir = t.horizon.turned ? `turned toward ${t.horizon.name}` : `drifting toward ${t.horizon.name}`;
    return { title: t.title, pal, dir };
  }
  function label(p: Piece) {
    const d = describe(p);
    canvas.setAttribute('aria-label', `Generative artwork: ${d.title}. ${d.pal} palette, ${d.dir}. Seed ${shortSeed(p.seed)}.`);
  }
  function announce(p: Piece) {
    const d = describe(p);
    live.textContent = '';
    window.setTimeout(() => { live.textContent = `New seed: ${d.title}, ${d.pal}, ${d.dir}`; }, 60);
  }
  function setHint() {
    hint.textContent = want ? 'Developing\u2026' : `${isCoarse() ? 'Tap' : 'Click'} for a new seed`;
    hit.setAttribute('aria-busy', want ? 'true' : 'false');
    root.classList.toggle('is-waiting', want);
  }

  // ── showing a piece ────────────────────────────────────────────────
  let ghostTimer = 0;
  function dissolve(ms: number) {
    // copy what is on screen now, cover the canvas with it, swap the live piece underneath, then fade the copy out
    clearTimeout(ghostTimer);
    if (!canvas.width || !canvas.height) return false;
    ghost.width = canvas.width; ghost.height = canvas.height;
    ghost.getContext('2d')!.drawImage(canvas, 0, 0);
    ghost.style.setProperty('--fade', `${ms}ms`);
    ghost.classList.add('is-on');
    return true;
  }
  function release(ms: number) {
    // two frames and a beat for the live canvas to have painted the new piece, then let the copy dissolve
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ghostTimer = window.setTimeout(() => {
        ghost.classList.remove('is-on');
        ghostTimer = window.setTimeout(() => { ghost.width = 0; ghost.height = 0; }, ms + 120);
      }, 110);
    }));
  }

  function show(slot: Slot, fadeMs: number, { announceIt = false, swap = fadeMs > 0 } = {}) {
    const p = slot.piece!;
    const old = lp.piece;
    const ghosted = fadeMs > 0 && !reducedMotion() && !!old && dissolve(fadeMs);
    lp.setPiece(p, false);
    if (ghosted) release(fadeMs);
    if (old && old !== p) disposePiece(old);
    cur = slot;
    rendered = slot.size;
    lastCommit = performance.now();
    label(p);
    root.dataset.heroSeed = p.seed;
    root.dataset.heroMs = String(p.ms);
    root.dataset.heroSize = `${slot.size.w}x${slot.size.h}`;
    paintFacts(factsOf(p.seed, p.traits), swap);
    if (announceIt) announce(p);
  }

  function commitNext() {
    const s = nxt!;
    nxt = null; want = false;
    setNextState('idle');
    show(s, SWAP_FADE, { announceIt: true });
    setHint();
    schedulePrefetch(SWAP_FADE + 500);
  }

  /** Commit the waiting/pre-rendered seed if the visitor asked for it and it is ready. */
  function pump() {
    clearTimeout(pumpTimer);
    if (disposed || !want) return;
    if (import.meta.env.DEV && (window as any).__hero?.freeze) return; // lets a screenshot hold the 'developing' state
    if (!nxt) { nxt = startNext(PRI_NOW); return; }
    if (!nxt.piece) return; // still rendering; its `ready` handler pumps again
    const wait = MIN_GAP - (performance.now() - lastCommit);
    if (wait > 0) { pumpTimer = window.setTimeout(pump, wait); return; }
    commitNext();
  }

  function startNext(pri: number): Slot {
    const slot = begin(randomSpec(), pixelSize(), pri);
    setNextState('rendering');
    slot.ready.then((p) => {
      if (disposed || slot.dead || nxt !== slot) return;
      if (!p) { nxt = null; setNextState('idle'); if (want) { want = false; setHint(); } return; } // failed render: forget it
      setNextState('ready');
      pump();
    });
    return slot;
  }

  function schedulePrefetch(delay = 0) {
    clearTimeout(prefetchTimer);
    if (disposed) return;
    prefetchTimer = window.setTimeout(() => idle(() => {
      if (disposed || nxt || !visible || document.hidden) return;
      const nav = navigator as any;
      if (nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory <= 2)) return; // frugal devices: render on demand only
      nxt = startNext(PRI_PREFETCH);
    }), delay);
  }

  // the visitor's request
  function request() {
    if (disposed) return;
    if (want) { pump(); return; } // never stack requests: one is already being waited for
    want = true;
    setHint();
    if (nxt && !nxt.piece && !nxt.started) { kill(nxt); nxt = null; } // still parked in the queue: re-queue it urgently
    pump();
  }
  hit.addEventListener('click', request);

  // ── first light ────────────────────────────────────────────────────
  paintFacts(f0, false);
  setHint();
  setNextState('idle');
  root.style.setProperty('--ax', `${f0.anchor[0] * 100}%`);
  root.dataset.heroReady = '0';

  lp.start();
  function startFirst(pri: number) {
    const slot = begin(first, pixelSize(), pri, (draft) => {
      // a fast, soft draft so the frame is never empty; the full render dissolves in over it
      lp.setPiece(draft, false);
      label(draft);
      root.classList.add('is-lit');
    });
    cur = slot;
    slot.ready.then((p) => {
      if (disposed || slot.dead) return;
      if (!p) { root.dataset.heroReady = 'failed'; return; }
      show(slot, REFINE_FADE, { swap: false });
      root.classList.add('is-lit');
      root.dataset.heroReady = '1';
      schedulePrefetch(SWAP_FADE + 400);
    });
    return slot;
  }
  // opened part-way down the page (a #hash, a restored scroll)? Then the visitor is not looking at us yet: yield to what they are looking at.
  const r0 = root.getBoundingClientRect();
  let firstSlot = startFirst(r0.bottom > 0 && r0.top < innerHeight ? PRI_NOW : PRI_PREFETCH - 1);

  // ── resize: re-render the current seed at the new aspect, only when it matters ──
  const onResize = debounce(() => {
    if (disposed || !cur?.piece || !rendered.w) return;
    const c = cssSize();
    const next = pixelSize(c);
    const dAspect = Math.abs(Math.log((next.w / next.h) / (rendered.w / rendered.h)));
    const dSize = Math.abs(Math.log((next.w * next.h) / (rendered.w * rendered.h)));
    if (dAspect < 0.06 && dSize < 0.3) return; // CSS object-fit: cover absorbs small changes
    if (resizeSlot && resizeSlot.size.w === next.w && resizeSlot.size.h === next.h) return;
    kill(resizeSlot); resizeSlot = null;
    if (nxt) { const wasWaiting = want; kill(nxt); nxt = null; setNextState('idle'); if (wasWaiting) pump(); } // a pre-render at the old size is useless
    const spec = cur.spec;
    const slot = begin(spec, next, PRI_NOW);
    resizeSlot = slot;
    root.dataset.heroResizing = '1';
    slot.ready.then((p) => {
      if (disposed || slot.dead || resizeSlot !== slot) return;
      resizeSlot = null;
      delete root.dataset.heroResizing;
      if (!p) return;
      show(slot, RESIZE_FADE, { swap: false });
      if (!nxt && !want) schedulePrefetch(400);
    });
  }, 320);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => onResize()) : null;
  ro?.observe(root);
  if (!ro) window.addEventListener('resize', onResize);

  // ── pointer parallax (fine pointers only; static under reduced motion) ──
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || reducedMotion()) return;
    const r = root.getBoundingClientRect();
    lp.pointer(-(((e.clientX - r.left) / r.width) * 2 - 1) * 0.85, -(((e.clientY - r.top) / r.height) * 2 - 1) * 0.85);
  };
  const onLeave = () => lp.pointer(0, 0);
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerleave', onLeave);

  // ── visibility: no drawing and no pre-rendering while off-screen or in a background tab ──
  const stopWatch = watchVisible(root, (v) => {
    visible = v;
    lp.setVisible(v);
    if (v && cur === firstSlot && !firstSlot.piece && !firstSlot.started) { firstSlot.cancel(); firstSlot = startFirst(PRI_NOW); } // scrolled up to us: now it matters
    if (v) { schedulePrefetch(300); pump(); }
    else if (nxt && !nxt.piece && !want) { kill(nxt); nxt = null; setNextState('idle'); }
  });
  const onVis = () => { if (!document.hidden) lp.setVisible(visible); };
  document.addEventListener('visibilitychange', onVis);
  const stopMotion = onMotionChange(() => { lp.pointer(0, 0); lp.setVisible(visible); });

  // the scroll cue steps aside once the visitor has scrolled
  let cueHidden = false;
  const onScroll = () => {
    const away = window.scrollY > Math.min(120, innerHeight * 0.15);
    if (away !== cueHidden) { cueHidden = away; cue.classList.toggle('is-gone', away); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const coarseMq = matchMedia('(hover: none), (pointer: coarse)');
  const onCoarse = () => setHint();
  coarseMq.addEventListener('change', onCoarse);

  // dev hook for the screenshot scenarios: show a chosen seed immediately (no queueing behind the pre-render)
  if (import.meta.env.DEV) {
    (window as any).__hero = {
      show(seed: string, horizon: H | null, sky: string) {
        want = false; kill(nxt); nxt = null; setNextState('idle');
        const slot = begin({ seed, horizon, sky }, pixelSize(), PRI_NOW);
        root.dataset.heroReady = '0';
        slot.ready.then((p) => { if (p && !disposed) { show(slot, SWAP_FADE); root.dataset.heroReady = '1'; setHint(); schedulePrefetch(SWAP_FADE + 400); } });
      },
    };
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    delete (root as any).__haloHero;
    clearTimeout(prefetchTimer); clearTimeout(pumpTimer); clearTimeout(swapTimer); clearTimeout(ghostTimer);
    kill(nxt); kill(resizeSlot);
    if (cur && !cur.piece) cur.cancel();
    lp.stop();
    ro?.disconnect(); window.removeEventListener('resize', onResize);
    root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerleave', onLeave);
    stopWatch(); stopMotion();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('scroll', onScroll);
    coarseMq.removeEventListener('change', onCoarse);
    disposePiece(lp.piece);
    stage.remove(); scrim.remove(); hit.remove(); foot.remove(); live.remove();
    if (h1WasHidden) h1.classList.add('visually-hidden');
    root.prepend(h1);
    root.classList.remove('hero', 'is-lit', 'is-waiting');
    for (const k of ['heroReady', 'heroNext', 'heroSeed', 'heroMs', 'heroSize', 'heroResizing']) delete root.dataset[k];
  };
  (root as any).__haloHero = dispose;
  return dispose;
}
