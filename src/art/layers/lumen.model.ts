// The Lumen · model. Pure geometry: which petals exist, where they point, how long and wide they are,
// what their silhouettes are. No drawing here. Everything random comes from c.rng / c.noise.

import type { LayerCtx } from './types.ts';
import type { lumenParams } from './lumen.params.ts';
import { adjust, mix, type RGB } from '../color.ts';
import { angDiff, clamp, DEG, lerp, smoothstep, TAU } from '../math.ts';
import type { FormKind } from '../traits.ts';

export type LP = typeof lumenParams;
export type HorizonId = 'dawn' | 'dusk' | 'zenith' | 'nadir';
const HALF_PI = Math.PI / 2;

// ── palette ─────────────────────────────────────────────────────────────────
export interface Pal {
  /** the blown-out heart: lightness ≥ 0.95 once the piece is fully grown */
  white: RGB;
  hot: RGB;
  glass: RGB;
  mid: RGB;
  spark: RGB;
  haze: RGB;
  walk(t: number): RGB;
  spectral: boolean;
  mono: boolean;
}

/**
 * The bloom's colours from the toned palette. `lift` (0..1) pulls the hot colours toward the full-tone
 * palette so the dim seed's ember is still legible; `hueShift` (degrees) lets a twin bloom differ.
 */
export function makePal(c: LayerCtx, hueShift = 0, lift = 0, whiten = 0): Pal {
  const p = c.pal;
  const f = c.full;
  const T = (x: RGB) => (hueShift ? adjust(x, { dh: hueShift }) : x);
  const L = (a: RGB, b: RGB) => (lift > 0.001 ? mix(a, b, lift) : a);
  const grey = 255 * Math.pow(c.tone.dim, 0.85);
  const hot = T(L(p.bloomLight, f.bloomLight));
  const white = mix(hot, [grey, grey, grey], 0.84);
  let glass = T(L(p.glass, f.c.glass));
  let mid = T(L(p.mid, f.c.mid));
  if (whiten > 0.001) {
    // bright sea → the glass must be lighter than it: pull the body colours toward the light
    glass = mix(glass, white, whiten * 0.55);
    mid = mix(mid, glass, whiten * 0.6);
  }
  return {
    white,
    hot,
    glass,
    mid,
    spark: T(p.spark),
    haze: T(p.haze),
    walk: (t: number) => T(p.walk(t)),
    spectral: f.spectral,
    mono: f.id === 'blackglass',
  };
}

// ── frame + petals ──────────────────────────────────────────────────────────
export interface Frame {
  cx: number;
  cy: number;
  R: number;
  axis: number;
  spread: number;
  radial: boolean;
  /** half of the fan (π for radial) */
  half: number;
  /** extra rotation of the whole petal pattern */
  rotation: number;
  /** px per design pixel */
  S: number;
}

export interface Spec {
  form: FormKind;
  petals: number;
  rings: number;
}

export interface Petal {
  ring: number;
  idx: number;
  /** 0 = outer ring … 1 = innermost */
  kf: number;
  /** final angle offset from the axis, radians */
  da: number;
  /** −1..1 across the fan */
  u: number;
  L: number;
  W: number;
  Lc: number;
  Wc: number;
  bow: number;
  sAmp: number;
  sFreq: number;
  sPh: number;
  r0: number;
  fav: boolean;
  /** the single longest favourite: carries the spark accent on mono palettes */
  hero: boolean;
  /** 0..1 position on the colour walk */
  hue: number;
  delay: number;
  shp: number[];
  /** small per-petal brightness variation */
  bright: number;
}

const ringIndex = (rings: number) => clamp(rings - 2, 0, 3);

export function buildPetals(c: LayerCtx, F: Frame, spec: Spec, label: string): Petal[] {
  const LPar = c.P.layers.lumen as LP;
  const hz = c.traits.horizon.id as HorizonId;
  const H = LPar.horizon[hz];
  const Fm = LPar.forms[spec.form];
  const Ly = LPar.layout;
  const rng = c.rng('lumen/petals/' + label);
  const noise = c.noise('lumen/env/' + label);
  const { rings } = spec;
  const n = spec.petals;
  const sign = rng.sign();
  const nFav = rng.int(1, 2);
  const fav0 = rng.int(0, n - 1);
  const fav1 = rng.int(0, n - 1);
  const favBoost = [rng.range(Ly.favourite.boost[0]!, Ly.favourite.boost[1]!), rng.range(Ly.favourite.boost[0]!, Ly.favourite.boost[1]!)];
  const innerMin = Ly.innerMin[ringIndex(rings)]!;
  const out: Petal[] = [];

  for (let k = 0; k < rings; k++) {
    const kf = rings > 1 ? k / (rings - 1) : 0;
    // a coronet doubles its spikes: the long ones the trait counts, the short ones between them
    const crown = spec.form === 'coronet' ? 2 : 1;
    const nk = (F.radial ? n : k % 2 ? Math.max(3, n - 1) : n) * crown;
    const step = (F.radial ? TAU : F.spread) / nk;
    const fk = 1 - (1 - innerMin) * Math.pow(kf, Ly.ringPow);
    for (let i = 0; i < nk; i++) {
      // fixed number of draws per petal → the stream never shifts
      const jA = rng.range(-1, 1) * Ly.jitter.angle * step;
      const jL = rng.range(-1, 1) * Ly.jitter.length;
      const jW = rng.range(-1, 1) * Ly.jitter.width;
      const jB = rng.range(-1, 1) * Ly.jitter.bow;
      const sPh = rng.range(-0.5, 0.5);
      const sK = 0.75 + 0.5 * rng();
      const bright = rng.range(0.86, 1.1);
      const shp = [rng.range(0.27, 0.41), rng.range(0.36, 0.5), rng.range(0.56, 0.74), rng.range(0.22, 0.5)];

      let da = F.radial ? angDiff(step * (i + 0.5 * (k % 2)), 0) : (i - (nk - 1) / 2) * step;
      da += jA;
      const u = clamp(da / F.half, -1, 1);
      const ang = F.axis + F.rotation + da;

      // the horizon's envelope: rising sun / trailing light / falling shafts / deep lamp
      let env = H.base + H.peak * Math.pow(Math.max(0, Math.cos((u * Math.PI) / 2)), H.pow);
      env *= 1 + H.skew * sign * u;
      if (H.alt && i % 2 === 1) env *= 1 - H.alt;
      if (H.noise) env *= 1 + H.noise * noise.n2(Math.cos(ang) * 1.25 + k * 0.7, Math.sin(ang) * 1.25 + 3.1);

      const fav = k === 0 && (i === fav0 || (nFav > 1 && i === fav1));
      const short = crown === 2 && i % 2 === 1 ? LPar.coronet.short : 1;
      let L = F.R * Ly.lengthOuter * fk * env * (1 + jL) * (fav && !short || fav && short === 1 ? (i === fav0 ? favBoost[0]! : favBoost[1]!) : 1) * short;
      L = Math.min(L, F.R * (F.radial ? 1.04 : 1.2));
      const r0 = F.R * (Ly.baseOffset + (crown === 2 ? LPar.coronet.baseRing : Ly.baseRing) * Math.pow(1 - kf, 1.2));
      const arc = step * (Fm.sM * L + r0);
      let W = Math.min(Fm.aspect * L, Ly.overlap * 0.5 * arc) * (1 + jW);
      W = Math.max(W, Ly.minAspect * L);

      const swirl = F.radial ? (k % 2 ? -0.6 : 1) : 1;
      const bow = Fm.straight ? 0 : (Fm.bow + H.bow * (hz === 'dusk' || hz === 'nadir' ? sign : 1)) * swirl + H.bowU * u + jB;
      const sAmp = Fm.sAmp * sK * (k % 2 ? -1 : 1) * sign;

      const Lc = F.R * c.P.layers.lumen.bud.length * (1 - 0.34 * kf);
      const Wc = Lc * c.P.layers.lumen.bud.aspect;
      const O = Ly.open;
      const delay = lerp(O.startOuter, O.startInner, kf) + O.uStagger * Math.abs(u);
      out.push({
        ring: k, idx: i, kf, da, u, L, W, Lc, Wc, bow, sAmp, sFreq: Fm.sFreq, sPh, r0, fav, hero: k === 0 && i === fav0,
        hue: clamp(0.5 + u * 0.5 + kf * 0.1), delay, shp, bright,
      });
    }
  }
  return out;
}

// ── pose (a petal at a moment of the unfolding) + silhouette ───────────────
export interface Pose {
  bx: number;
  by: number;
  a: number;
  L: number;
  W: number;
  bow: number;
  sAmp: number;
  sFreq: number;
  sPh: number;
  form: FormKind;
  /** 0 = generic teardrop … 1 = final form */
  m: number;
  /** unfolding progress of this petal, 0..1 */
  q: number;
  eLen: number;
  shp: number[];
}

export function poseOf(p: Petal, F: Frame, open: number, form: FormKind, LPar: LP): Pose {
  const O = LPar.layout.open;
  const q = clamp((open - p.delay) / O.span);
  // petals part quickly and settle (ease-out); they lengthen more slowly (ease-in-out)
  const eRot = 1 - Math.pow(1 - smoothstep(O.rot[0]!, O.rot[1]!, q), 2);
  const eLen = smoothstep(O.len[0]!, O.len[1]!, q);
  const kappa = (LPar.layout.coneDeg * DEG) / F.half;
  const a = F.axis + F.rotation + p.da * lerp(kappa, 1, eRot);
  const bowC = -Math.sin(p.da * kappa);
  const r0 = p.r0 * lerp(0.12, 1, eLen);
  return {
    bx: F.cx + Math.cos(a) * r0,
    by: F.cy + Math.sin(a) * r0,
    a,
    L: lerp(p.Lc, p.L, eLen),
    W: lerp(p.Wc, p.W, eLen),
    bow: lerp(bowC, p.bow, eRot),
    sAmp: p.sAmp * eRot,
    sFreq: p.sFreq,
    sPh: p.sPh,
    form,
    m: smoothstep(0.05, 0.95, q),
    q, eLen,
    shp: p.shp,
  };
}

export interface Outline {
  n: number;
  s: number[];
  cx: number[];
  cy: number[];
  nx: number[];
  ny: number[];
  lx: number[];
  ly: number[];
  rx: number[];
  ry: number[];
  wl: number[];
  wr: number[];
  W: number;
  L: number;
  a: number;
  /** straight-edged (shard) */
  poly: boolean;
  /** shard vertex indices */
  vi: { l1: number; r1: number; rn: number };
}

function prof(s: number, sM: number, ra: number, rb: number, tp: number): number {
  if (s <= 0) return 0;
  if (s >= 1) return 0;
  if (s < sM) return Math.sin(HALF_PI * Math.pow(s / sM, ra));
  return Math.pow(Math.max(0, Math.cos(HALF_PI * Math.pow((s - sM) / (1 - sM), rb))), tp);
}
const shardL = (s: number, sk: number) => (s < sk ? Math.pow(s / sk, 1.5) : (1 - s) / (1 - sk));
const shardR = (s: number, sk: number, sn: number, nw: number) =>
  s < sk ? 0.86 * Math.pow(s / sk, 1.5) : s < sn ? lerp(0.86, nw, (s - sk) / (sn - sk)) : (nw * (1 - s)) / (1 - sn);

const N_SAMPLES = 30;

export function buildOutline(P: Pose, LPar: LP): Outline {
  const Fm = LPar.forms[P.form];
  const T = LPar.teardrop;
  const shard = P.form === 'shard';
  const poly = shard && P.m > 0.85;
  const ss: number[] = [];
  // cosine spacing: the steep tips and claws get the densest sampling
  for (let i = 0; i <= N_SAMPLES; i++) ss.push(0.5 - 0.5 * Math.cos((Math.PI * i) / N_SAMPLES));
  let vi = { l1: -1, r1: -1, rn: -1 };
  if (poly) {
    const add = (v: number) => (ss.push(v), v);
    const a = add(P.shp[0]!), b = add(P.shp[1]!), c = add(P.shp[2]!);
    ss.sort((x, y) => x - y);
    vi = { l1: ss.indexOf(a), r1: ss.indexOf(b), rn: ss.indexOf(c) };
  }
  const n = ss.length - 1;
  const dx = Math.cos(P.a), dy = Math.sin(P.a);
  const nx0 = -dy, ny0 = dx;
  const cxs: number[] = [], cys: number[] = [], wl: number[] = [], wr: number[] = [];
  for (const s of ss) {
    const tear = prof(s, T.sM, T.ra, T.rb, T.tp);
    let l: number, r: number;
    if (shard) {
      l = lerp(tear, shardL(s, P.shp[0]!), P.m);
      r = lerp(tear, shardR(s, P.shp[1]!, P.shp[2]!, P.shp[3]!), P.m);
    } else {
      l = r = lerp(tear, prof(s, Fm.sM, Fm.ra, Fm.rb, Fm.tp), P.m);
    }
    wl.push(l);
    wr.push(r);
    const off = P.L * (P.bow * s * s + P.sAmp * Math.sin(TAU * P.sFreq * s + P.sPh) * smoothstep(0, 0.35, s));
    cxs.push(P.bx + dx * s * P.L + nx0 * off);
    cys.push(P.by + dy * s * P.L + ny0 * off);
  }
  const nxs: number[] = [], nys: number[] = [], lx: number[] = [], ly: number[] = [], rx: number[] = [], ry: number[] = [];
  for (let i = 0; i <= n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1);
    let tx = cxs[i1]! - cxs[i0]!, ty = cys[i1]! - cys[i0]!;
    const m = Math.hypot(tx, ty) || 1;
    tx /= m; ty /= m;
    const nx = -ty, ny = tx;
    nxs.push(nx); nys.push(ny);
    lx.push(cxs[i]! + nx * wl[i]! * P.W); ly.push(cys[i]! + ny * wl[i]! * P.W);
    rx.push(cxs[i]! - nx * wr[i]! * P.W); ry.push(cys[i]! - ny * wr[i]! * P.W);
  }
  return { n, s: ss, cx: cxs, cy: cys, nx: nxs, ny: nys, lx, ly, rx, ry, wl, wr, W: P.W, L: P.L, a: P.a, poly, vi };
}
