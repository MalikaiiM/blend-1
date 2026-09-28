// Shared helpers of the texture layer: the low-res luminance map (modelled, or read from what lies below), separable
// blurs on float fields, a scratch-buffer pool, and a row sampler that bilinearly reads a low-res map at full
// resolution without per-pixel allocation. Hot loops are small top-level functions on typed arrays.
import type { Cv, LayerCtx } from './types.ts';
import { clamp, lerp, smoothstep } from '../math.ts';
import { rgbToOklch } from '../color.ts';

export interface BelowMap {
  mw: number;
  mh: number;
  /** sRGB luma of the piece, 0..1, one value per cell */
  Y: Float32Array;
  /** true when read from c.below() rather than modelled */
  real: boolean;
}

// ── scratch pool ───────────────────────────────────────────────────────────────────────
// The big float fields are fully overwritten before they are read, so reusing them between renders changes nothing
// but the garbage collector's mood. (Renders are synchronous per layer, so two never interleave.)
const pool = new Map<string, Float32Array>();
export function scratch(name: string, n: number): Float32Array {
  let a = pool.get(name);
  if (!a || a.length !== n) { a = new Float32Array(n); pool.set(name, a); }
  return a;
}

/** 1 for a colourful palette, down to PARAMS mono.floor for a near-mono one (Blackglass) */
export function paletteVivid(c: LayerCtx): number {
  const M = c.P.layers.texture.mono;
  const chroma = (rgbToOklch(c.full.c.mid)[1] + rgbToOklch(c.full.c.glass)[1]) / 2;
  return lerp(M.floor, 1, smoothstep(M.from, M.to, chroma));
}

const lum = (c: readonly number[]) => (0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!) / 255;

function gridFor(c: LayerCtx): { mw: number; mh: number } {
  const M = c.P.layers.texture.map;
  const cell = Math.max(M.minCell, M.cell * c.S);
  return { mw: Math.max(16, Math.round(c.w / cell)), mh: Math.max(16, Math.round(c.h / cell)) };
}

/**
 * The luminance of the finished piece, on a small grid — modelled from the palette (already toned for growth), the anchor,
 * the axis and the bud: a dark sea, a lamp at the anchor, the light falling off from it, stretched along the axis.
 */
export function modelMap(c: LayerCtx): BelowMap {
  const E = c.P.layers.texture.model;
  const { mw, mh } = gridFor(c);
  const p = c.pal, lay = c.lay;
  const far = E.far.void * lum(p.void) + E.far.deep * lum(p.deep) + E.far.floor;
  const peak = Math.min(1, Math.max(far, E.peak * lum(p.bloomLight)));
  const open = smoothstep(0, 1, c.tl.bloom);
  const lamp = lay.bud * (E.lampBud + (1 - E.lampBud) * open);
  const size = lay.R * (0.3 + 0.7 * lamp);
  const Y = new Float32Array(mw * mh);
  for (let j = 0; j < mh; j++) {
    const py = ((j + 0.5) / mh) * c.h - lay.cy;
    for (let i = 0; i < mw; i++) {
      const px = ((i + 0.5) / mw) * c.w - lay.cx;
      const d = Math.hypot(px, py) / size;
      let rad: number, ex: number;
      if (lay.radial) { rad = E.radial.rad; ex = E.radial.expo; }
      else {
        const b = smoothstep(-0.35, 0.35, (px * lay.ax + py * lay.ay) / (Math.hypot(px, py) + 1e-6)); // 1 ahead of the anchor, 0 behind
        rad = E.behind.rad + (E.ahead.rad - E.behind.rad) * b;
        ex = E.behind.expo + (E.ahead.expo - E.behind.expo) * b;
      }
      Y[j * mw + i] = far + (peak - far) * Math.exp(-Math.pow(d / rad, ex));
    }
  }
  return { mw, mh, Y, real: false };
}

/** Downscale `src` to mw×mh with a halving cascade (so thin bright lines are averaged, not skipped). */
function cascade(c: LayerCtx, src: Cv, mw: number, mh: number): Cv {
  let cur = src;
  while (cur.width > mw * 2 && cur.height > mh * 2) {
    const nw = Math.max(mw, cur.width >> 1), nh = Math.max(mh, cur.height >> 1);
    const nx = c.makeCanvas(nw, nh);
    const g = nx.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, nw, nh);
    cur = nx;
  }
  return cur;
}

/**
 * The exact luminance of everything below. If the pipeline offers a reduced-size flatten (c.belowSmall, see the report's
 * shared-change request) this is cheap; otherwise c.below() flattens every layer at full size — about 130 ms at 1000×1250.
 */
export function belowMap(c: LayerCtx): BelowMap {
  const src = (c as unknown as { belowSmall?: (maxSide: number) => Cv | null }).belowSmall?.(256) ?? c.below();
  if (!src) return modelMap(c);
  const { mw, mh } = gridFor(c);
  const cur = cascade(c, src, mw, mh);
  const small = c.makeCanvas(mw, mh);
  const g = small.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, mw, mh);
  const px = g.getImageData(0, 0, mw, mh).data;
  const Y = new Float32Array(mw * mh);
  for (let i = 0; i < mw * mh; i++) Y[i] = (0.2126 * px[i * 4]! + 0.7152 * px[i * 4 + 1]! + 0.0722 * px[i * 4 + 2]!) / 255;
  return { mw, mh, Y, real: true };
}

export function lumaMap(c: LayerCtx): BelowMap {
  return c.P.layers.texture.map.useBelow ? belowMap(c) : modelMap(c);
}

// ── blurs ───────────────────────────────────────────────────────────────────────────────

/** In-place separable box blur (clamped edges) of a w×h float field, `passes` times. Cheap for any radius. */
export function boxBlur(d: Float32Array, w: number, h: number, r: number, passes = 1, tmp?: Float32Array): void {
  if (r < 1) return;
  const t = tmp ?? new Float32Array(d.length);
  const inv = 1 / (2 * r + 1);
  const col = new Float32Array(w);
  for (let p = 0; p < passes; p++) {
    // horizontal: d → t
    for (let y = 0; y < h; y++) {
      const b = y * w;
      let sum = d[b]! * (r + 1);
      for (let i = 1; i <= r; i++) sum += d[b + Math.min(i, w - 1)]!;
      for (let x = 0; x < w; x++) {
        t[b + x] = sum * inv;
        sum += d[b + Math.min(x + r + 1, w - 1)]! - d[b + Math.max(x - r, 0)]!;
      }
    }
    // vertical: t → d, streaming rows with a running column sum
    for (let x = 0; x < w; x++) col[x] = t[x]! * (r + 1);
    for (let i = 1; i <= r; i++) { const b = Math.min(i, h - 1) * w; for (let x = 0; x < w; x++) col[x] += t[b + x]!; }
    for (let y = 0; y < h; y++) {
      const b = y * w;
      const add = Math.min(y + r + 1, h - 1) * w, sub = Math.max(y - r, 0) * w;
      for (let x = 0; x < w; x++) {
        d[b + x] = col[x]! * inv;
        col[x] += t[add + x]! - t[sub + x]!;
      }
    }
  }
}

/** In-place separable 3-tap blur [a, 1−2a, a] (a ≤ 1/3 → σ² = 2a per pass), clamped edges. */
export function tapBlur(d: Float32Array, w: number, h: number, a: number, tmp: Float32Array): void {
  const m = 1 - 2 * a;
  for (let y = 0; y < h; y++) {
    const b = y * w;
    let p = d[b]!, cu = d[b]!;
    for (let x = 0; x < w; x++) {
      const n = x + 1 < w ? d[b + x + 1]! : cu;
      tmp[b + x] = a * p + m * cu + a * n;
      p = cu; cu = n;
    }
  }
  for (let y = 0; y < h; y++) {
    const b = y * w, up = Math.max(y - 1, 0) * w, dn = Math.min(y + 1, h - 1) * w;
    for (let x = 0; x < w; x++) d[b + x] = a * tmp[up + x]! + m * tmp[b + x]! + a * tmp[dn + x]!;
  }
}

/** Gaussian-ish blur of std-dev `sigma` device px, from repeated 3-tap passes (small σ) or two box passes plus a 3-tap finish (large σ). */
export function blurSigma(d: Float32Array, w: number, h: number, sigma: number, tmp: Float32Array): void {
  if (sigma < 0.12) return;
  if (sigma <= 1.5) {
    const passes = Math.max(1, Math.ceil((sigma * sigma) / (2 / 3)));
    const a = clamp((sigma * sigma) / (2 * passes), 0, 1 / 3);
    for (let i = 0; i < passes; i++) tapBlur(d, w, h, a, tmp);
  } else {
    // two box passes give σ² = 2·((2r+1)²−1)/12 ; the residue is finished with fractional 3-taps (each adds ≤ 2/3)
    const r = Math.max(1, Math.floor((Math.sqrt(6 * sigma * sigma + 1) - 1) / 2));
    boxBlur(d, w, h, r, 2, tmp);
    let rest = sigma * sigma - (2 * ((2 * r + 1) ** 2 - 1)) / 12;
    while (rest > 0.05) {
      const step = Math.min(rest, 2 / 3);
      tapBlur(d, w, h, step / 2, tmp);
      rest -= step;
    }
  }
}

/** Standard deviation of a float field from a deterministic stride sample. */
export function sampleStd(d: Float32Array, n = 6000): number {
  const step = Math.max(1, Math.floor(d.length / n)) | 1;
  let s = 0, s2 = 0, k = 0;
  for (let i = 0; i < d.length; i += step) { const v = d[i]!; s += v; s2 += v * v; k++; }
  const m = s / k;
  return Math.sqrt(Math.max(1e-12, s2 / k - m * m));
}

/**
 * Returns fill(y, out): writes row y of a bilinearly-upsampled mw×mh map into out (length w).
 * Horizontal interpolation of each map row happens once and is cached, so the per-pixel cost is one lerp.
 * Rows must be requested top-down.
 */
export function rowSampler(map: Float32Array, mw: number, mh: number, w: number, h: number) {
  const x0 = new Int32Array(w), x1 = new Int32Array(w), xf = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = ((x + 0.5) * mw) / w - 0.5;
    const i0 = Math.floor(fx);
    xf[x] = fx - i0;
    x0[x] = clamp(i0, 0, mw - 1);
    x1[x] = clamp(i0 + 1, 0, mw - 1);
  }
  const rows: (Float32Array | null)[] = new Array(mh).fill(null);
  const rowAt = (j: number): Float32Array => {
    let r = rows[j];
    if (!r) {
      r = new Float32Array(w);
      const b = j * mw;
      for (let x = 0; x < w; x++) { const a = map[b + x0[x]!]!; r[x] = a + (map[b + x1[x]!]! - a) * xf[x]!; }
      rows[j] = r;
      if (j >= 2) rows[j - 2] = null; // rows are consumed top-down: let the old ones go
    }
    return r;
  };
  return (y: number, out: Float32Array): void => {
    const fy = ((y + 0.5) * mh) / h - 0.5;
    const j0 = Math.floor(fy), f = fy - j0;
    const a = rowAt(clamp(j0, 0, mh - 1)), b = rowAt(clamp(j0 + 1, 0, mh - 1));
    for (let x = 0; x < w; x++) out[x] = a[x]! + (b[x]! - a[x]!) * f;
  };
}

/** Bilinear read of a mw×mh map at fractional cell coordinates (clamped) */
export function bilerp(map: Float32Array, mw: number, mh: number, fx: number, fy: number): number {
  const x = clamp(fx, 0, mw - 1), y = clamp(fy, 0, mh - 1);
  const i = Math.min(mw - 2, Math.floor(x)), j = Math.min(mh - 2, Math.floor(y));
  const tx = x - i, ty = y - j;
  const a = map[j * mw + i]!, b = map[j * mw + i + 1]!, cc = map[(j + 1) * mw + i]!, d = map[(j + 1) * mw + i + 1]!;
  return (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
}
