// The pipeline: seed + state → layers → composite.
//
//   renderPiece(seed, state, w, h)  → Piece   (each depth layer on its own canvas)
//   composite(ctx, piece, motion?)  → flattens the Piece, with optional parallax/breath
//   paint(canvas, seed, state)      → both, onto an existing canvas

import { PARAMS } from './params.ts';
import { adjust, css, mix, type RGB } from './color.ts';
import { clamp, lerp, smootherstep } from './math.ts';
import { makeNoise } from './noise.ts';
import { seedCtx } from './rng.ts';
import { growthRamp, timeline, type Timeline } from './clock.ts';
import { selfSky } from './mechanic.ts';
import { deriveTraits, type Traits } from './traits.ts';
import { layout, type Layout } from './geometry.ts';
import type { Cv, LayerCtx, LayerFn, LayerId, LayerOut, PieceState } from './layers/types.ts';

import * as abyss from './layers/abyss.ts';
import * as strata from './layers/strata.ts';
import * as threads from './layers/threads.ts';
import * as lumen from './layers/lumen.ts';
import * as inclusion from './layers/inclusion.ts';
import * as veil from './layers/veil.ts';
import * as texture from './layers/texture.ts';

/** Bottom → top. Texture yields several overlays (grain, vignette, grade). */
export const LAYER_ORDER = ['abyss', 'strata', 'threads', 'lumen', 'inclusion', 'veil', 'texture'] as const;
export type LayerModuleId = (typeof LAYER_ORDER)[number];
const MODULES: Record<LayerModuleId, { render: LayerFn }> = { abyss, strata, threads, lumen, inclusion, veil, texture };

export interface RenderOpts {
  quality?: 'draft' | 'full';
  /** render only these modules (others are skipped entirely) */
  only?: LayerModuleId[];
  skip?: LayerModuleId[];
}

export interface Piece {
  seed: string;
  state: PieceState;
  traits: Traits;
  tl: Timeline;
  lay: Layout;
  w: number;
  h: number;
  quality: 'draft' | 'full';
  /** base colour painted before the first layer */
  base: RGB;
  layers: LayerOut[];
  ms: number;
  timings: Record<string, number>;
  errors: string[];
}

export function makeCanvas(w: number, h: number): Cv {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Resolve everything a piece is at a given moment. Pure. */
export function resolvePiece(seed: string, st: PieceState) {
  const tl = timeline(st.block);
  const sky = tl.revealed ? (st.sky ?? selfSky(seed)) : null;
  const traits = deriveTraits(seed, { horizon: st.horizon, sky });
  return { tl, sky, traits };
}

const ROLE_DIM: Record<string, number> = { void: 0.55, deep: 1, mid: 1, glass: 1, light: 0.75, spark: 0.9 };

function tonedPalette(traits: Traits, tl: Timeline) {
  const G = PARAMS.growth;
  const k = smootherstep(0, 1, tl.t);
  const dim = lerp(G.dimAt0, 1, k);
  const sat = lerp(G.satAt0, 1, k);
  const pulse = 1 + PARAMS.clock.pulseAmp * tl.pulse;
  const src = traits.colors;
  const tone = (c: RGB, role: string) => {
    const l = lerp(1, dim, ROLE_DIM[role] ?? 1) * pulse;
    return adjust(c, { l, c: sat });
  };
  const out: any = {};
  for (const role of ['void', 'deep', 'mid', 'glass', 'light', 'spark'] as const) out[role] = tone(src.c[role], role);
  out.bloomLight = tone(src.bloomLight, 'light');
  out.haze = tone(src.haze, 'glass');
  out.walk = (t: number) => tone(src.walk(t), 'glass');
  return { pal: out as LayerCtx['pal'], dim, sat };
}

function* pieceSteps(seed: string, state: PieceState, w: number, h: number, opts: RenderOpts): Generator<string, Piece, void> {
  const t0 = performance.now();
  const quality = opts.quality ?? 'full';
  const { tl, traits } = resolvePiece(seed, state);
  const lay = layout(traits, tl, w, h);
  const { pal, dim, sat } = tonedPalette(traits, tl);
  const sc = seedCtx(seed);
  const noiseCache = new Map<string, ReturnType<typeof makeNoise>>();
  const layers: LayerOut[] = [];
  const timings: Record<string, number> = {};
  const errors: string[] = [];

  let belowCache: { n: number; cv: Cv | null } = { n: -1, cv: null };
  const below = (): Cv | null => {
    if (layers.length === 0) return null;
    if (belowCache.n === layers.length) return belowCache.cv;
    const cv = makeCanvas(w, h);
    const g = cv.getContext('2d')!;
    g.fillStyle = css(pal.void);
    g.fillRect(0, 0, w, h);
    flatten(g, layers, w, h);
    belowCache = { n: layers.length, cv };
    return cv;
  };

  const ctx: LayerCtx = {
    w, h, S: h / PARAMS.canvas.designHeight,
    quality, q: quality === 'draft' ? PARAMS.canvas.draftFactor : 1,
    P: PARAMS, seed, traits, tl, lay, pal, full: traits.colors,
    tone: { dim, sat },
    grow: (name) => growthRamp(tl, name),
    rng: (label) => sc.stream(label),
    noise: (label) => {
      let n = noiseCache.get(label);
      if (!n) noiseCache.set(label, (n = makeNoise(sc.stream('noise/' + label))));
      return n;
    },
    below,
    makeCanvas: (cw = w, ch = h) => makeCanvas(cw, ch),
  };

  for (const id of LAYER_ORDER) {
    if (opts.only && !opts.only.includes(id)) continue;
    if (opts.skip?.includes(id)) continue;
    const t = performance.now();
    try {
      const out = MODULES[id].render(ctx);
      for (const o of Array.isArray(out) ? out : [out]) layers.push(o);
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message}`);
      console.error(`[halocline] layer "${id}" failed`, e);
    }
    timings[id] = Math.round(performance.now() - t);
    yield id;
  }
  return {
    seed, state, traits, tl, lay, w, h, quality, base: pal.void,
    layers, ms: Math.round(performance.now() - t0), timings, errors,
  };
}

/** Synchronous render: every layer, then the Piece. */
export function renderPiece(seed: string, state: PieceState, w: number, h: number, opts: RenderOpts = {}): Piece {
  const it = pieceSteps(seed, state, w, h, opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

const nextFrame = () => new Promise<void>((res) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => res()) : setTimeout(res, 0)));

/**
 * Cooperative render for the site: yields to the browser between layers so a big render never freezes
 * scrolling. Pass `cancel` to abandon a render that is no longer wanted (resolves to null).
 */
export async function renderPieceAsync(
  seed: string, state: PieceState, w: number, h: number,
  opts: RenderOpts = {}, cancel?: { cancelled: boolean }, pause: () => Promise<void> = nextFrame,
): Promise<Piece | null> {
  const it = pieceSteps(seed, state, w, h, opts);
  let r = it.next();
  while (!r.done) {
    await pause();
    if (cancel?.cancelled) return null;
    r = it.next();
  }
  return r.value;
}

export interface Motion {
  /** −1..1 pointer/scroll offsets */
  dx?: number;
  dy?: number;
  /** seconds, for the slow breath of the lumen and veil */
  time?: number;
  /** fraction of frame width a layer with parallax 1 may travel (0 = static, exact) */
  bleed?: number;
  hide?: ReadonlySet<string>;
  solo?: string | null;
}

function flatten(g: CanvasRenderingContext2D, layers: LayerOut[], w: number, h: number, m: Motion = {}) {
  const bleed = m.bleed ?? 0;
  const breath = m.time ? Math.sin(m.time * 0.55) : 0;
  for (const L of layers) {
    if (m.hide?.has(L.id)) continue;
    if (m.solo && m.solo !== L.id) continue;
    const p = L.parallax;
    let a = L.alpha;
    let s = 1 + 2 * bleed * p;
    if (breath) {
      if (L.id === 'lumen' || L.id === 'inclusion') { a *= 1 + 0.05 * breath; s *= 1 + 0.004 * breath; }
      else if (L.id === 'veil') a *= 1 + 0.08 * Math.sin((m.time ?? 0) * 0.9 + 1.3);
    }
    g.globalCompositeOperation = L.blend;
    g.globalAlpha = clamp(a, 0, 1);
    if (s === 1 && !bleed) g.drawImage(L.canvas, 0, 0, w, h);
    else {
      const ox = -((s - 1) * w) / 2 + (m.dx ?? 0) * p * bleed * w;
      const oy = -((s - 1) * h) / 2 + (m.dy ?? 0) * p * bleed * w;
      g.drawImage(L.canvas, ox, oy, w * s, h * s);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/** Flatten a Piece onto a 2D context of size piece.w × piece.h. */
export function composite(g: CanvasRenderingContext2D, piece: Piece, m: Motion = {}) {
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.fillStyle = css(piece.base);
  g.fillRect(0, 0, piece.w, piece.h);
  flatten(g, piece.layers, piece.w, piece.h, m);
  g.restore();
}

/** Render + composite onto an existing canvas (uses its width/height). */
export function paint(canvas: Cv, seed: string, state: PieceState, opts: RenderOpts = {}): Piece {
  const piece = renderPiece(seed, state, canvas.width, canvas.height, opts);
  composite(canvas.getContext('2d')!, piece);
  return piece;
}

export { mix };
