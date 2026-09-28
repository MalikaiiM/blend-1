// THE THREADS · generation — where every filament is born, how it steers, how it branches.
//
// Everything here is a pure function of (seed, traits, layout, PARAMS). ONE rng stream ('threads') is consumed in
// a fixed order that depends on neither the quality, the growth nor the clock; the flow field is a named noise
// ('threads') read only in space. The result is a list of full-length polylines: growth and sway are applied
// afterwards by the painter, so the same filaments are simply revealed a little further every tide.
import type { LayerCtx } from './types.ts';
import type { Noise } from '../noise.ts';
import type { Rng } from '../rng.ts';
import { TAU, angDiff, clamp, lerp } from '../math.ts';

export interface Thread {
  /** segments (points = n + 1) */
  n: number;
  /** colour/brightness chunks */
  k: number;
  x: Float32Array;
  y: Float32Array;
  /** unit normals at each point */
  nx: Float32Array;
  ny: Float32Array;
  /** width profile (1 at the root → wTip at the tip) and sway envelope s^p at each point */
  prof: Float32Array;
  env: Float32Array;
  /** arc length, px */
  len: number;
  /** base width px (already × S) and the width at the tip as a fraction of it */
  w0: number;
  wTip: number;
  /** brightness 0..1 */
  a: number;
  /** growth time g at which the filament starts to lengthen, and the fraction a seed already has */
  start: number;
  stub: number;
  hueT: number;
  colK: number;
  spark: boolean;
  sparkU: number;
  sparkU2: number;
  swayA: number;
  swayPh: number;
  swayF: number;
  swayK: number;
  swayP: number;
  /** tip bead radius px (0 = plain glint tip) */
  tipR: number;
  /** extra beads / glints as arc fractions */
  beads: number[];
  glints: number[];
  flick: number[];
  depth: number;
  grp: number;
}

export interface Frame {
  W: number; H: number; S: number; U: number; reach: number;
  cx: number; cy: number; ax: number; ay: number; axis: number; spread: number; radial: boolean;
  /** where the ray behind the anchor leaves the frame, the edge's direction and length */
  ex: number; ey: number; px: number; py: number; span: number;
}

interface Genes {
  aU: number; sparkU: number; sparkU2: number; colK: number; swayU: number; swayPh: number; swayFU: number; swayKU: number;
  tipU: number; g1: number; g2: number; g3: number; wobOff: number; wU: number; startU: number; stubU: number; stubL: number;
  flick: number[];
}

type FlowCfg = { wa: number; wc: number; wr: number; ws: number; freq: number; ell: number; wob: number; wobF: number; fine: number };
type Vortex = { x: number; y: number; s: number; r: number };
type Flow = (x: number, y: number, out: number[]) => void;

interface Gen {
  c: LayerCtx;
  rng: Rng;
  fr: Frame;
  nz: Noise;
  wob: Noise;
  T: LayerCtx['P']['layers']['threads'];
  cnt: number;
  ox: number; oy: number; oz: number;
  swirl: number;
  vort: Vortex[];
  out: Thread[];
}

export function makeFrame(c: LayerCtx, lengthMul: number): Frame {
  const { w: W, h: H, S, lay } = c;
  const dx = -lay.ax, dy = -lay.ay;
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (W - lay.cx) / dx); else if (dx < -1e-6) t = Math.min(t, (0 - lay.cx) / dx);
  if (dy > 1e-6) t = Math.min(t, (H - lay.cy) / dy); else if (dy < -1e-6) t = Math.min(t, (0 - lay.cy) / dy);
  if (!isFinite(t)) t = 0;
  const px = -lay.ay, py = lay.ax;
  return {
    W, H, S, U: lay.unit, reach: Math.sqrt(W * H) * lengthMul,
    cx: lay.cx, cy: lay.cy, ax: lay.ax, ay: lay.ay, axis: lay.axis, spread: lay.spread, radial: lay.radial,
    ex: lay.cx + dx * t, ey: lay.cy + dy * t, px, py, span: Math.abs(px) * W + Math.abs(py) * H,
  };
}

// ── small helpers ───────────────────────────────────────────────────────────────
function drawGenes(r: Rng): Genes {
  const g: Genes = {
    aU: r(), sparkU: r(), sparkU2: r(), colK: r(), swayU: r(), swayPh: r() * TAU, swayFU: r(), swayKU: r(),
    tipU: r(), g1: r(), g2: r(), g3: r(), wobOff: r() * 200, wU: r(), startU: r(), stubU: r(), stubL: r(), flick: [],
  };
  for (let i = 0; i < 9; i++) g.flick.push(r());
  return g;
}

function makeFlow(G: Gen, cfg: FlowCfg): { flow: Flow; gain: (ds: number) => number; fine: number } {
  const { fr, nz, T } = G;
  const freq = cfg.freq * T.curlScale;
  const inv = 1 / fr.U;
  const rad = fr.radial;
  const wa = cfg.wa * (rad ? 0.35 : 1);
  const wr = cfg.wr * (rad ? 1.9 : 1);
  const vort = G.vort;
  const direct: Flow = (x, y, out) => {
    const u = (x - fr.cx) * inv, v = (y - fr.cy) * inv;
    let fx = wa * fr.ax, fy = wa * fr.ay;
    if (cfg.wc) {
      const cv = nz.curl(u * freq + G.ox, v * freq + G.oy, G.oz);
      fx += cfg.wc * cv[0]; fy += cfg.wc * cv[1];
    }
    const r = Math.hypot(u, v) + 1e-4;
    if (wr) {
      const k = wr * (0.4 + 0.6 * Math.exp(-r * r * 3));
      fx += (u / r) * k; fy += (v / r) * k;
    }
    if (cfg.ws) {
      const k = cfg.ws * G.swirl * Math.exp(-(r * r) / 0.32);
      fx += (-v / r) * k; fy += (u / r) * k;
      for (let i = 0; i < vort.length; i++) {
        const q = vort[i]!;
        const qu = x - q.x, qv = y - q.y;
        const qr = Math.hypot(qu, qv) * inv + 1e-4;
        const kk = cfg.ws * q.s * Math.exp(-(qr * qr) / (q.r * q.r));
        fx += (-qv * inv / qr) * kk; fy += (qu * inv / qr) * kk;
      }
    }
    out[0] = fx; out[1] = fy;
  };
  // the field is smooth, so sample it once on a grid (a fraction of the cost of curl-noise at every step)
  const cell = fr.U / 34;
  const mx = fr.W * 0.22, my = fr.H * 0.22;
  const gw = Math.ceil((fr.W + 2 * mx) / cell) + 2, gh = Math.ceil((fr.H + 2 * my) / cell) + 2;
  const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
  const tmp = [0, 0];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    direct(i * cell - mx, j * cell - my, tmp);
    gx[j * gw + i] = tmp[0]!; gy[j * gw + i] = tmp[1]!;
  }
  const flow: Flow = (x, y, out) => {
    const fx = (x + mx) / cell, fy = (y + my) / cell;
    if (fx < 0 || fy < 0 || fx >= gw - 1 || fy >= gh - 1) { direct(x, y, out); return; }
    const i = Math.floor(fx), j = Math.floor(fy), rx = fx - i, ry = fy - j;
    const k = j * gw + i;
    const a = (1 - rx) * (1 - ry), b = rx * (1 - ry), c = (1 - rx) * ry, d = rx * ry;
    out[0] = gx[k]! * a + gx[k + 1]! * b + gx[k + gw]! * c + gx[k + gw + 1]! * d;
    out[1] = gy[k]! * a + gy[k + 1]! * b + gy[k + gw]! * c + gy[k + gw + 1]! * d;
  };
  return { flow, gain: (ds: number) => ds / (cfg.ell * fr.S), fine: cfg.fine };
}

/** Integrate one polyline: heading follows a curvature profile, is pulled toward the flow, and wobbles. */
function trace(
  G: Gen, x0: number, y0: number, th0: number, n: number, len: number,
  kap: (s: number) => number, fl: { flow: Flow; gain: (ds: number) => number; fine: number } | null,
  wobAmp: number, wobF: number, wobOff: number, jag = 0,
): { xs: Float32Array; ys: Float32Array } {
  const xs = new Float32Array(n + 1), ys = new Float32Array(n + 1);
  const ds = len / n;
  let x = x0, y = y0, th = th0;
  const f = [0, 0];
  const gain = fl ? fl.gain(ds) : 0;
  const wob = G.wob;
  for (let i = 0; i < n; i++) {
    xs[i] = x; ys[i] = y;
    const s = i / n;
    let dth = kap(s) * ds;
    if (fl) {
      fl.flow(x, y, f);
      if (Math.abs(f[0]!) + Math.abs(f[1]!) > 1e-6) dth += clamp(angDiff(Math.atan2(f[1]!, f[0]!), th), -1.1, 1.1) * gain;
    }
    if (wobAmp) dth += (Math.sin(s * wobF * 6.283 + wobOff) * 0.55 + Math.sin(s * wobF * 15.1 + wobOff * 2.3) * 0.3 + Math.sin(s * wobF * 34.7 + wobOff * 0.71) * 0.15) * wobAmp * 1e-3 * ds * 6;
    if (fl && fl.fine) dth += Math.sin(s * wobF * 137 + wobOff * 3.1) * Math.sin(s * wobF * 31 + wobOff * 1.7) * fl.fine * ds * 0.06;
    if (jag) {
      const j = wob.n2(wobOff + 71.3, s * 19);
      if (j > 0.62) dth += (j - 0.62) * jag * (Math.sin(s * 11 + wobOff) > 0 ? 1 : -1) * ds * 0.06;
    }
    th += dth;
    x += Math.cos(th) * ds; y += Math.sin(th) * ds;
  }
  xs[n] = x; ys[n] = y;
  return { xs, ys };
}

function normals(xs: Float32Array, ys: Float32Array): { nx: Float32Array; ny: Float32Array } {
  const n = xs.length;
  const nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const tx = xs[b]! - xs[a]!, ty = ys[b]! - ys[a]!;
    const m = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / m; ny[i] = tx / m;
  }
  return { nx, ny };
}

function arcLen(xs: Float32Array, ys: Float32Array): number {
  let L = 0;
  for (let i = 1; i < xs.length; i++) L += Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!);
  return L;
}

/** Point and tangent angle at arc fraction u of an existing thread (by index interpolation). */
function pointAt(t: Thread, u: number): { x: number; y: number; ang: number } {
  const f = clamp(u) * t.n;
  const i = Math.min(t.n - 1, Math.floor(f)), r = f - i;
  const x = lerp(t.x[i]!, t.x[i + 1]!, r), y = lerp(t.y[i]!, t.y[i + 1]!, r);
  const a = Math.max(0, i - 1), b = Math.min(t.n, i + 2);
  return { x, y, ang: Math.atan2(t.y[b]! - t.y[a]!, t.x[b]! - t.x[a]!) };
}

interface Base {
  xs: Float32Array; ys: Float32Array; w0: number; wTip: number; a: number; start: number;
  hueT: number; depth: number; grp: number; swayAmp: [number, number]; tipR?: number; beads?: number[];
  gn: Genes; stubOK: boolean; stubLen: [number, number]; stubP: number;
}

function finish(G: Gen, b: Base): Thread {
  const { S } = G.fr;
  const { nx, ny } = normals(b.xs, b.ys);
  const n = b.xs.length - 1;
  const len = arcLen(b.xs, b.ys);
  const gn = b.gn;
  const D = G.T.draw;
  const k = clamp(Math.round(len / (D.chunkLen * S)), D.chunkMin, D.chunkMax);
  const stub = b.stubOK && gn.stubU < b.stubP ? lerp(b.stubLen[0], b.stubLen[1], gn.stubL) : 0;
  const glints: number[] = [];
  if (gn.g1 < 0.05 + 0.5 * b.a * b.a) glints.push(0.18 + 0.72 * gn.g2);
  if (b.a > 0.55 && gn.g3 < 0.45) glints.push(0.12 + 0.8 * ((gn.g2 * 7.13) % 1));
  const sw = G.T.sway.freq;
  const prof = new Float32Array(n + 1), env = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    prof[i] = 1 - (1 - b.wTip) * Math.pow(s, 0.85);
    env[i] = Math.pow(s, b.swayAmp[1]);
  }
  return {
    n, k, x: b.xs, y: b.ys, nx, ny, prof, env, len,
    w0: b.w0, wTip: b.wTip, a: b.a, start: b.start, stub,
    hueT: b.hueT, colK: gn.colK,
    spark: false, sparkU: gn.sparkU, sparkU2: gn.sparkU2,
    swayA: b.swayAmp[0] * (0.4 + 0.9 * gn.swayU) * S, swayPh: gn.swayPh, swayF: lerp(sw[0], sw[1], gn.swayFU),
    swayK: 1.5 + 4.5 * gn.swayKU, swayP: b.swayAmp[1],
    tipR: b.tipR ?? 0, beads: b.beads ?? [], glints, flick: gn.flick, depth: b.depth, grp: b.grp,
  };
}

// ── origins ─────────────────────────────────────────────────────────────────────
interface Origin { x: number; y: number; h: number }

function fanDir(G: Gen): number {
  const { fr, rng } = G;
  if (fr.radial) return rng() * TAU;
  const half = fr.spread * 0.48;
  return fr.axis + clamp(rng.gauss() * fr.spread * G.T.origin.fanSigma, -half, half);
}

/** kind 0: a cluster at the anchor, fanning out; kind 1: along the horizon edge behind it (nadir: a ring) */
function pickOrigin(G: Gen, kind: 0 | 1 | 2, sigmaMul = 1, tFixed?: number): Origin {
  const { fr, rng, T } = G;
  const O = T.origin;
  if (kind === 0) {
    const ang = fanDir(G);
    const r = Math.abs(rng.gauss()) * O.anchorSigma * fr.U * sigmaMul;
    return { x: fr.cx + Math.cos(ang) * r, y: fr.cy + Math.sin(ang) * r, h: ang + rng.gauss() * 0.1 };
  }
  if (kind === 2) {
    // out in the fan: a place the light has already reached
    const ang = fanDir(G);
    const r = rng.range(0.1, 0.55) * fr.U;
    return { x: fr.cx + Math.cos(ang) * r, y: fr.cy + Math.sin(ang) * r, h: ang + rng.gauss() * 0.3 };
  }
  if (fr.radial) {
    const ang = rng() * TAU;
    const r = rng.range(O.ring[0], O.ring[1]) * fr.U;
    return { x: fr.cx + Math.cos(ang) * r, y: fr.cy + Math.sin(ang) * r, h: ang + rng.gauss() * 0.16 };
  }
  const tg = clamp(rng.gauss() * O.edgeSigma, -0.52, 0.52);
  const t = tFixed === undefined ? tg : clamp(tFixed + tg * 0.12, -0.52, 0.52);
  const off = 0.012 * fr.U; // just outside the frame, so filaments enter it
  const x = fr.ex + fr.px * t * fr.span - fr.ax * off;
  const y = fr.ey + fr.py * t * fr.span - fr.ay * off;
  const h = fr.axis + t * fr.spread * 0.3 + rng.gauss() * 0.06;
  return { x, y, h };
}

const dist2Anchor = (fr: Frame, x: number, y: number) => Math.hypot(x - fr.cx, y - fr.cy) / fr.U;

/** the whispers-to-bright curve */
function brightness(F: { alpha: number[] }, u: number, boost = 1): number {
  return clamp((F.alpha[0]! + (F.alpha[1]! - F.alpha[0]!) * Math.pow(u, F.alpha[2]!)) * boost);
}

// ── families ────────────────────────────────────────────────────────────────────
function genSilk(G: Gen) {
  const { rng, fr, T } = G;
  const F = T.families.silk;
  const S = fr.S;
  const nR = rng.int(F.ribbons[0]!, F.ribbons[1]!);
  const rib: { x: number; y: number; h: number; theta: number; L: number; w: number; m: number; ph: number; st: number; hue: number; share: number; wgt: number }[] = [];
  for (let r = 0; r < nR; r++) {
    // ribbons are spread evenly along the edge (stratified), so the frame is never lopsided
    const o = pickOrigin(G, rng() < F.edgeShare ? 1 : 0, 1, ((r + 0.5) / nR - 0.5) * 0.9);
    rib.push({
      x: o.x, y: o.y, h: o.h,
      theta: rng.sign() * rng.range(F.turn[0]!, F.turn[1]!),
      L: fr.reach * rng.range(F.len[0]!, F.len[1]!),
      w: S * rng.range(F.ribW[0]!, F.ribW[1]!),
      m: rng.range(F.pinch[0]!, F.pinch[1]!), ph: rng.range(0, TAU),
      st: rng.range(0, F.startMax * 0.9),
      hue: (r + rng()) / nR, share: rng.range(0.6, 1.4), wgt: rng.range(0.62, 1),
    });
  }
  const total = Math.round(F.n * G.cnt);
  const sum = rib.reduce((s, r) => s + r.share, 0);
  const per = rib.map((r) => Math.max(3, Math.round((total * r.share) / sum)));
  const maxPer = Math.max(...per);
  const fl = makeFlow(G, F.flow);
  const nz = G.nz;
  for (let j = 0; j < maxPer; j++) {
    for (let r = 0; r < nR; r++) {
      if (j >= per[r]!) continue;
      const R = rib[r]!;
      const gn = drawGenes(rng);
      const a = rng.gauss(), a2 = rng.gauss();
      const px = -Math.sin(R.h), py = Math.cos(R.h);
      const x0 = R.x + px * a * R.w * F.originSpread, y0 = R.y + py * a * R.w * F.originSpread;
      const th0 = R.h + rng.gauss() * F.headJit;
      const Theta = R.theta * (1 + rng.gauss() * F.turnJit);
      const L = R.L * rng.range(F.lenJit[0]!, F.lenJit[1]!);
      const kap = (s: number) => (Theta / L) * (1 + 0.25 * Math.sin(s * 3.1 + R.ph));
      const tr = trace(G, x0, y0, th0, F.steps, L, kap, fl, F.flow.wob, F.flow.wobF, gn.wobOff);
      // braid: the strands of a ribbon cross and pinch as they run
      const nn = normals(tr.xs, tr.ys);
      const amp = R.w * F.braid * (a + 0.35 * a2);
      for (let i = 0; i <= F.steps; i++) {
        const s = i / F.steps;
        const env = Math.sin(Math.min(1, s * 6) * Math.PI * 0.5) * (0.5 + 0.5 * Math.sin(Math.PI * R.m * s + R.ph));
        tr.xs[i] += nn.nx[i]! * amp * env; tr.ys[i] += nn.ny[i]! * amp * env;
      }
      const wu = Math.pow(gn.wU, 1.6);
      const bright = brightness(F, gn.aU, 0.6 + 0.4 * R.wgt);
      G.out.push(finish(G, {
        xs: tr.xs, ys: tr.ys, w0: S * lerp(F.w[0]!, F.w[1]!, wu) * (0.8 + 0.4 * R.wgt), wTip: F.wTip, a: bright,
        start: clamp(R.st * 0.8 + gn.startU * 0.2 * F.startMax, 0, F.startMax),
        hueT: clamp(R.hue * 0.8 + 0.05 * (gn.colK - 0.5) + 0.1, 0, 0.78), depth: 0, grp: r, swayAmp: F.sway as [number, number],
        gn, stubOK: dist2Anchor(fr, x0, y0) < F.stubR, stubLen: F.stubLen as [number, number], stubP: F.stubP,
       
      }));
    }
  }
  void nz;
  return nR;
}

function genRoot(G: Gen) {
  const { rng, fr, T } = G;
  const F = T.families.root;
  const S = fr.S;
  const fl = makeFlow(G, F.flow);
  const nT = Math.max(3, Math.round(rng.int(F.trunks[0]!, F.trunks[1]!) * Math.pow(G.cnt, 0.8)));
  const cap = Math.round(F.n * G.cnt);
  const rec: { th: Thread; hue: number }[] = [];
  const spawn = (b: Omit<Base, 'gn'>, gn: Genes, hue: number) => {
    const th = finish(G, { ...b, gn });
    G.out.push(th);
    rec.push({ th, hue });
    return th;
  };
  const trunkHue: number[] = [];
  for (let t = 0; t < nT; t++) {
    const gn = drawGenes(rng);
    const o = pickOrigin(G, rng() < F.edgeShare ? 1 : 0, 1.4);
    const L = fr.reach * rng.range(F.len[0]!, F.len[1]!);
    const bendS = rng.sign() * rng.range(0, 0.9) / L;
    const tr = trace(G, o.x, o.y, o.h + rng.gauss() * 0.08, F.steps, L, (s) => bendS * (1 - s * 0.5), fl, F.flow.wob, F.flow.wobF, gn.wobOff, F.jag);
    const hue = (t + rng()) / nT;
    trunkHue.push(hue);
    spawn({
      xs: tr.xs, ys: tr.ys, w0: S * lerp(F.w[0]!, F.w[1]!, Math.pow(gn.wU, 0.8)), wTip: F.wTip, a: brightness(F, 0.55 + 0.45 * gn.aU),
      start: clamp(gn.startU * F.startMax * 0.55, 0, F.startMax), hueT: clamp(hue * 0.8 + 0.08, 0, 0.78), depth: 0, grp: t, swayAmp: F.sway as [number, number],
      stubOK: dist2Anchor(fr, o.x, o.y) < F.stubR, stubLen: F.stubLen as [number, number], stubP: F.stubP,
    }, gn, hue);
  }
  // breadth-first: parents always precede their children (so a draft prefix is a coherent tree)
  for (let qi = 0; qi < rec.length && rec.length < cap; qi++) {
    const P = rec[qi]!.th;
    if (P.depth >= 3) continue;
    const kr = F.kids[P.depth]!;
    const nk = rng.int(kr[0]!, kr[1]!);
    let side: number = rng.sign();
    const us: number[] = [];
    for (let i = 0; i < nk; i++) us.push(rng.range(F.spawn[0]!, F.spawn[1]!));
    us.sort((p, q) => p - q);
    for (const u of us) {
      if (rec.length >= cap) break;
      const gn = drawGenes(rng);
      const pt = pointAt(P, u);
      side = rng() < 0.7 ? -side : side;
      const ang = side * rng.range(F.kidAngle[0]!, F.kidAngle[1]!) * (Math.PI / 180);
      const L = P.len * (1 - u) * rng.range(F.kidLen[0]!, F.kidLen[1]!) * (1 + 0.25 * (1 - P.depth * 0.3));
      const n = Math.max(30, Math.round(F.steps * (0.55 + 0.45 * (L / (P.len + 1)))));
      const bendS = rng.sign() * rng.range(0, 0.7) / (L + 1);
      const tr = trace(G, pt.x, pt.y, pt.ang + ang, n, L, (s) => bendS * (0.6 + s * 0.8), fl, F.flow.wob * 1.3, F.flow.wobF, gn.wobOff, F.jag);
      const wAt = P.w0 * (1 - (1 - P.wTip) * Math.pow(u, 0.8));
      const startC = clamp(P.start + u * (1 - P.start) + 0.01 * gn.startU, 0, 0.94);
      spawn({
        xs: tr.xs, ys: tr.ys, w0: Math.max(S * 0.55, wAt * F.kidW), wTip: F.wTip,
        a: clamp(P.a * F.kidAlpha * (0.72 + 0.4 * gn.aU)), start: startC,
        hueT: clamp(rec[qi]!.hue * 0.8 + 0.08 + 0.05 * (gn.colK - 0.5), 0, 0.78), depth: P.depth + 1, grp: P.grp, swayAmp: F.sway as [number, number],
        stubOK: false, stubLen: [0, 0], stubP: 0,
      }, gn, rec[qi]!.hue);
    }
  }
  return nT;
}

function genCoral(G: Gen) {
  const { rng, fr, T } = G;
  const F = T.families.coral;
  const S = fr.S;
  const fl = makeFlow(G, F.flow);
  const nC = rng.int(F.clumps[0]!, F.clumps[1]!);
  const cl: { x: number; y: number; h: number; r: number; flip: number; size: number; share: number; hue: number; st: number }[] = [];
  for (let i = 0; i < nC; i++) {
    const u = rng();
    const kind: 0 | 1 | 2 = u < F.edgeShare ? 1 : u < F.edgeShare + F.fieldShare ? 2 : 0;
    const o = pickOrigin(G, kind, 2.6);
    cl.push({
      x: o.x, y: o.y, h: o.h, r: S * rng.range(F.clumpR[0]!, F.clumpR[1]!), flip: rng() < 0.5 ? 1 : -1,
      size: rng.range(0.55, 1.25), share: rng.range(0.6, 1.5), hue: (i + rng()) / nC, st: rng.range(0, F.startMax * 0.85),
    });
  }
  const total = Math.round(F.n * G.cnt);
  const sum = cl.reduce((s, c) => s + c.share, 0);
  const per = cl.map((c) => Math.max(3, Math.round((total * c.share) / sum)));
  const maxPer = Math.max(...per);
  for (let j = 0; j < maxPer; j++) {
    for (let i = 0; i < nC; i++) {
      if (j >= per[i]!) continue;
      const C = cl[i]!;
      const gn = drawGenes(rng);
      const ang = rng() * TAU, rr = Math.abs(rng.gauss()) * C.r * 0.6;
      const x0 = C.x + Math.cos(ang) * rr, y0 = C.y + Math.sin(ang) * rr;
      const h0 = C.h + rng.gauss() * F.headSpread * 0.55 + (ang - C.h) * 0.08;
      const L = fr.reach * rng.range(F.len[0]!, F.len[1]!) * C.size;
      const flipped = rng() < F.flipP ? -C.flip : C.flip;
      const bend = flipped * rng.range(F.bend[0]!, F.bend[1]!);
      const curl = flipped * rng.range(F.curl[0]!, F.curl[1]!);
      const from = rng.range(F.curlFrom[0]!, F.curlFrom[1]!);
      const kap = (s: number) => {
        let k = bend / L;
        if (s > from) { const q = (s - from) / (1 - from); k += (3 * curl * q * q) / (L * (1 - from)); }
        return k;
      };
      const tr = trace(G, x0, y0, h0, F.steps, L, kap, fl, F.flow.wob, F.flow.wobF, gn.wobOff);
      const bead = gn.tipU < F.beadP;
      G.out.push(finish(G, {
        xs: tr.xs, ys: tr.ys, w0: S * lerp(F.w[0]!, F.w[1]!, Math.pow(gn.wU, 1.2)), wTip: F.wTip, a: brightness(F, gn.aU),
        start: clamp(C.st * 0.75 + gn.startU * 0.25 * F.startMax, 0, F.startMax), hueT: clamp(C.hue * 0.8 + 0.08, 0, 0.78),
        depth: 0, grp: i, swayAmp: F.sway as [number, number], tipR: bead ? S * lerp(F.beadR[0]!, F.beadR[1]!, gn.g1) : 0,
        gn, stubOK: dist2Anchor(fr, x0, y0) < F.stubR, stubLen: F.stubLen as [number, number], stubP: F.stubP,
      }));
    }
  }
  return nC;
}

function genReed(G: Gen) {
  const { rng, fr, T } = G;
  const F = T.families.reed;
  const S = fr.S;
  const fl = makeFlow(G, F.flow);
  const W = fr.W, H = fr.H;
  const scaleW = clamp(W / (0.8 * H), 0.7, 2.1);
  const nTf = Math.max(6, Math.round(rng.int(F.tufts[0]!, F.tufts[1]!) * scaleW * Math.pow(G.cnt, 0.85)));
  const total = Math.round(F.n * G.cnt * Math.pow(scaleW, 0.6));
  const tf: { x: number; h: number; lean: number; w: number; share: number; hue: number; st: number; turn: number }[] = [];
  const lean0 = fr.ax * F.lean * (fr.radial ? 0 : 1);
  for (let i = 0; i < nTf; i++) {
    // x: a mix of the whole width and a crowd around the anchor
    // (the rest are spread evenly along the edge, with jitter, so a wide frame is a meadow and not a few candles)
    let x: number;
    const crowd = rng() < F.crowd, jit = rng(), gs = rng.gauss();
    if (crowd) x = fr.cx + gs * F.crowdWidth * W * 0.5;
    else x = ((i + jit * 0.9) / nTf) * W * 1.04 - 0.02 * W;
    x = clamp(x, -0.02 * W, 1.02 * W);
    const near = Math.exp(-Math.pow((x - fr.cx) / (0.32 * W), 2));
    const hgt = Math.min(H * 1.05, H * rng.range(F.len[0]!, F.len[1]!) * (0.62 + 0.38 * near) * T.length);
    tf.push({
      x, h: hgt, lean: lean0 + rng.gauss() * F.leanJit, w: S * rng.range(F.tuftW[0]!, F.tuftW[1]!),
      share: rng.range(0.5, 1.5), hue: x / W, st: rng.range(0, F.startMax * 0.9), turn: rng.range(F.bendTurn[0]!, F.bendTurn[1]!),
    });
  }
  const sum = tf.reduce((s, t) => s + t.share, 0);
  const per = tf.map((t) => Math.max(2, Math.round((total * t.share) / sum)));
  const maxPer = Math.max(...per);
  for (let j = 0; j < maxPer; j++) {
    for (let i = 0; i < nTf; i++) {
      if (j >= per[i]!) continue;
      const Tf = tf[i]!;
      const gn = drawGenes(rng);
      const x0 = Tf.x + rng.gauss() * Tf.w;
      const y0 = fr.H + S * rng.range(2, 14);
      const L = Tf.h * rng.range(0.62, 1) / 0.96;
      const lean = Tf.lean + rng.gauss() * F.leanJit * 0.5;
      const th0 = -Math.PI / 2 + lean * 0.5;
      const sgn = lean >= 0 ? 1 : -1;
      const turn = sgn * Tf.turn * rng.range(0.6, 1.2);
      const kap = (s: number) => (turn / L) * 2.4 * Math.pow(s, 1.4) * 0.55 + (lean * 0.9) / L * (1 - s);
      const tr = trace(G, x0, y0, th0, F.steps, L, kap, fl, F.flow.wob, F.flow.wobF, gn.wobOff);
      const pearls: number[] = [];
      if (gn.g1 < F.pearlP) {
        const np = rng.int(F.pearls[0]!, F.pearls[1]!);
        for (let p = 0; p < np; p++) pearls.push(rng.range(F.pearlSpan[0]!, F.pearlSpan[1]!) - 0.03 * p);
      }
      G.out.push(finish(G, {
        xs: tr.xs, ys: tr.ys, w0: S * lerp(F.w[0]!, F.w[1]!, Math.pow(gn.wU, 1.3)), wTip: F.wTip, a: brightness(F, gn.aU),
        start: clamp(Tf.st * 0.8 + gn.startU * 0.2 * F.startMax, 0, F.startMax), hueT: clamp(Tf.hue * 0.78 + 0.02, 0, 0.78),
        depth: 0, grp: i, swayAmp: F.sway as [number, number], tipR: S * lerp(F.beadR[0]!, F.beadR[1]!, gn.g2), beads: pearls,
        gn, stubOK: Math.abs(x0 - fr.cx) < F.stubR * fr.W, stubLen: F.stubLen as [number, number], stubP: F.stubP,
      }));
    }
  }
  return nTf;
}

function genStorm(G: Gen) {
  const { rng, fr, T } = G;
  const F = T.families.storm;
  const S = fr.S;
  const fl = makeFlow(G, F.flow);
  const total = Math.round(F.n * G.cnt);
  for (let i = 0; i < total; i++) {
    const gn = drawGenes(rng);
    const u = rng();
    let o: Origin;
    if (u < F.anchorShare) o = pickOrigin(G, 0, F.anchorSigma / T.origin.anchorSigma);
    else if (u < F.anchorShare + F.edgeShare) o = pickOrigin(G, 1);
    else {
      const q = G.vort[Math.floor(rng() * G.vort.length)]!;
      const a = rng() * TAU, r = Math.abs(rng.gauss()) * 0.09 * fr.U;
      o = { x: q.x + Math.cos(a) * r, y: q.y + Math.sin(a) * r, h: a + Math.PI / 2 * q.s };
    }
    const toward = rng() < 0.4;
    const h0 = toward ? fanDir(G) : rng() * TAU;
    const L = fr.reach * (F.len[0]! + (F.len[1]! - F.len[0]!) * Math.pow(rng(), 1.7));
    const bend = rng.gauss() * 0.9 / L;
    const tr = trace(G, o.x, o.y, o.h * 0.4 + h0 * 0.6, F.steps, L, () => bend, fl, F.flow.wob, F.flow.wobF, gn.wobOff, F.jag);
    const hue = ((Math.atan2(o.y - fr.cy, o.x - fr.cx) / TAU) + 1) % 1;
    G.out.push(finish(G, {
      xs: tr.xs, ys: tr.ys, w0: S * lerp(F.w[0]!, F.w[1]!, Math.pow(gn.wU, 1.5)), wTip: F.wTip, a: brightness(F, gn.aU),
      start: clamp(gn.startU * F.startMax, 0, F.startMax), hueT: clamp(hue * 0.8, 0, 0.78), depth: 0, grp: i % 9, swayAmp: F.sway as [number, number],
      gn, stubOK: dist2Anchor(fr, o.x, o.y) < F.stubR, stubLen: F.stubLen as [number, number], stubP: F.stubP,
      tipR: gn.tipU < 0.1 ? S * 1.4 : 0,
    }));
  }
  return 9;
}

/** Generate every filament of this seed, in a fixed order. */
export function generate(c: LayerCtx): Thread[] {
  const T = c.P.layers.threads;
  const rng = c.rng('threads');
  const fr = makeFrame(c, T.length);
  const nz = c.noise('threads');
  const wob = c.noise('threads/wobble');
  // fixed opening draws (so later structure never shifts them)
  const ox = rng.range(0, 90), oy = rng.range(0, 90), oz = rng.range(0, 40);
  const swirl = rng.sign();
  const sparkPick = rng();
  const nV = rng.int(T.families.storm.vortices[0]!, T.families.storm.vortices[1]!);
  const vort: Vortex[] = [];
  for (let i = 0; i < nV; i++) {
    const a = rng() * TAU, r = rng.range(0.08, 0.3) * fr.U;
    vort.push({ x: fr.cx + Math.cos(a) * r, y: fr.cy + Math.sin(a) * r, s: rng.sign() * rng.range(0.7, 1.25), r: rng.range(0.14, 0.26) });
  }
  const G: Gen = { c, rng, fr, nz, wob, T, cnt: T.count, ox, oy, oz, swirl, vort, out: [] };
  const kind = c.traits.body.growth;
  if (kind === 'silk') genSilk(G);
  else if (kind === 'root') genRoot(G);
  else if (kind === 'coral') genCoral(G);
  else if (kind === 'reed') genReed(G);
  else genStorm(G);
  if (G.out.length > T.guard.maxThreads) G.out.length = T.guard.maxThreads;
  // the accent: a single family (ribbon / lineage / clump / tuft) carries a little of the palette's spark
  let groups = 1;
  for (const t of G.out) groups = Math.max(groups, t.grp + 1);
  const pick = Math.floor(sparkPick * groups);
  for (const t of G.out) t.spark = (t.grp === pick && t.sparkU < T.color.sparkFamily) || t.sparkU2 < T.color.sparkAny;
  return G.out;
}
