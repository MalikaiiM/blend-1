// THE SHEETS · geometry — where the glass lies.
//
// A stack is described in its own (fr, u) frame: `fr` runs along the sheets (0..1), `u` across them, in px.
// Level / Leaning / Folded stacks live in a rotated LINEAR frame; a Fan lives in a POLAR frame whose rings
// curve around the bloom's anchor. Boundaries b_0 … b_N are tables of u over fr (`samples` + 1 entries, the
// last equal to the first in a polar frame so it closes). Sheet i lies between b_i and b_{i+1}, plus a tail
// that dips under its neighbour (the overlap). Everything here is a pure function of the seed, the horizon,
// the frame size and (for the slow phase of the waves only) tl.drift.
import type { LayerCtx } from './types.ts';
import { DEG, TAU, clamp, lerp } from '../math.ts';

export interface Q { fr: number; u: number; a1: number; a2: number; x: number; y: number; nx: number; ny: number }

export interface Frame {
  polar: boolean;
  ox: number; oy: number; cs: number; sn: number; asp: number; Rref: number;
  s0: number; s1: number;
  /** pixel → (fr, u) plus two noise-plane coordinates (a1, a2) that wrap correctly in a polar frame */
  toSU(x: number, y: number, q: Q): void;
  /** (fr, u) → pixel */
  toXY(fr: number, u: number, q: Q): void;
  /** unit normal (direction of growing u) at fr */
  normal(fr: number, q: Q): void;
  uMin: number; uMax: number;
  /** growth shift: +1 sheets start at larger u (linear: lower), −1 start closer to the centre (polar) */
  riseSign: number;
}

export interface Stack {
  frame: Frame;
  N: number; M: number;
  dir: 1 | -1;
  /** N + 1 boundary tables (u, px) */
  B: Float32Array[];
  /** N overlap tables (px): how far sheet i dips under its neighbour */
  OV: Float32Array[];
  thick: number[];
  mid: number[];
  anchorFr: number; anchorU: number;
  /** per-sheet random draws in [0,1) reserved for the painter */
  rj: number[];
  kind: string;
  /** polar: partial-ring centre (fr) and whether the fan is a full radial */
  axisFr: number;
}

function linearFrame(w: number, h: number, ang: number, shA = 0, shK = 0, shP = 0): Frame {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const Ls = Math.abs(cs) * w + Math.abs(sn) * h;
  const E = Math.abs(cs) * h + Math.abs(sn) * w;
  const pad = 0.07 * Ls + Math.abs(shA);
  const ox = w / 2, oy = h / 2;
  const s0 = -Ls / 2 - pad, s1 = Ls / 2 + pad;
  const inv = 1 / (s1 - s0);
  return {
    polar: false, ox, oy, cs, sn, asp: 1, Rref: 0, s0, s1, uMin: -E / 2, uMax: E / 2, riseSign: 1,
    toSU(x, y, q) {
      const dx = x - ox, dy = y - oy;
      q.u = -dx * sn + dy * cs;
      // a folded stack leans over itself: a shear that depends only on u, so it inverts exactly
      const s = dx * cs + dy * sn - (shA !== 0 ? shA * Math.sin(shK * q.u + shP) : 0);
      const f = (s - s0) * inv;
      q.fr = f < 0 ? 0 : f > 1 ? 1 : f;
      q.a1 = s; q.a2 = 0;
    },
    toXY(fr, u, q) {
      const s = s0 + fr * (s1 - s0) + (shA !== 0 ? shA * Math.sin(shK * u + shP) : 0);
      q.x = ox + s * cs - u * sn;
      q.y = oy + s * sn + u * cs;
    },
    normal(_fr, q) { q.nx = -sn; q.ny = cs; },
  };
}

function polarFrame(w: number, h: number, ox: number, oy: number, asp: number, Rref: number): Frame {
  let maxR = 0;
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]] as const) maxR = Math.max(maxR, Math.hypot(cx - ox, (cy - oy) * asp));
  return {
    polar: true, ox, oy, cs: 1, sn: 0, asp, Rref, s0: 0, s1: TAU * Rref, uMin: 0, uMax: maxR, riseSign: -1,
    toSU(x, y, q) {
      const dx = x - ox, dy = (y - oy) * asp;
      q.u = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      q.fr = th / TAU + 0.5;
      q.a1 = Math.cos(th) * Rref; q.a2 = Math.sin(th) * Rref;
    },
    toXY(fr, u, q) {
      const th = (fr - 0.5) * TAU;
      q.x = ox + u * Math.cos(th);
      q.y = oy + (u * Math.sin(th)) / asp;
    },
    normal(fr, q) {
      const th = (fr - 0.5) * TAU;
      const nx = Math.cos(th), ny = Math.sin(th) / asp;
      const m = Math.hypot(nx, ny) || 1;
      q.nx = nx / m; q.ny = ny / m;
    },
  };
}

/** thickness rhythm → relative weights */
function rhythmWeights(kind: string, N: number, rj: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = N > 1 ? i / (N - 1) : 0.5;
    const r = rj[i]!;
    switch (kind) {
      case 'even': out.push(1 + 0.16 * (r - 0.5)); break;
      case 'swell': out.push(0.5 + 1.2 * Math.sin(Math.PI * (0.1 + 0.8 * t)) + 0.2 * r); break;
      case 'taper': out.push(0.45 + 1.3 * t + 0.14 * r); break;
      case 'pulse': out.push(i % 2 ? 0.6 + 0.16 * r : 1.4 + 0.24 * r); break;
      default: out.push(0.42 + 1.15 * r);
    }
  }
  if (kind === 'taper' && rj[0]! > 0.5) out.reverse();
  return out;
}

/** scale weights to `total`, keeping each thickness inside [lo, hi] */
function fitThickness(wts: number[], total: number, lo: number, hi: number): number[] {
  const n = wts.length;
  const fixed = new Array<boolean>(n).fill(false);
  const th = new Array<number>(n).fill(0);
  for (let pass = 0; pass < 5; pass++) {
    let free = 0, left = total;
    for (let i = 0; i < n; i++) { if (fixed[i]) left -= th[i]!; else free += wts[i]!; }
    if (free <= 0) break;
    let any = false;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      const v = (wts[i]! / free) * left;
      if (v < lo) { th[i] = lo; fixed[i] = true; any = true; }
      else if (v > hi) { th[i] = hi; fixed[i] = true; any = true; }
      else th[i] = v;
    }
    if (!any) break;
  }
  return th;
}

export function buildStack(c: LayerCtx): Stack {
  const P = c.P.layers.strata;
  const { w, h, lay, traits, tl } = c;
  const H = h;
  const kind = traits.body.interface;
  const N = traits.body.sheets;
  const polar = kind === 'fan';
  const hzc = P.horizon[traits.horizon.index]!;
  const rc = c.rng('strata/comp');
  const nzE = c.noise('strata/edge');
  const M = P.samples, T = M + 1;
  const K = P.kinds;

  // ── the fixed set of draws (never depends on quality or time) ──────────
  const dir = rc.weighted(P.stack.direction) as 1 | -1;
  const rhythm = rc.weighted(P.stack.rhythm);
  const cover = rc.range(P.stack.coverage[0]!, P.stack.coverage[1]!);
  const leanK = rc.range(P.stack.lean[0]!, P.stack.lean[1]!);
  const rj: number[] = [];
  for (let i = 0; i < N; i++) rj.push(rc());
  const tiltRand = rc.range(-1, 1);
  const leanSign = rc.sign();
  const leanAng = rc.range(K.leaning.angle[0]!, K.leaning.angle[1]!);
  const fanRand = rc.range(0, 1) * rc.sign();
  const foldTilt = rc.range(-1, 1);
  const back = rc.range(K.fan.back[0]!, K.fan.back[1]!) * H;
  const asp = rc.range(K.fan.asp[0]!, K.fan.asp[1]!);
  const hole = rc.range(P.stack.ringHole[0]!, P.stack.ringHole[1]!) * H;
  const egg = rc.range(K.fan.egg[0]!, K.fan.egg[1]!) * H;
  const inner = rc.range(K.fan.inner[0]!, K.fan.inner[1]!) * H;
  const wS = P.waves;
  const wAmp: number[] = [], wFreq: number[] = [], wStep: number[] = [], wPh0: number[] = [];
  for (let m = 0; m < 3; m++) {
    wAmp.push(rc.range(wS.amp[0]!, wS.amp[1]!) * (m === 0 ? 1 : m === 1 ? 0.45 : 0.16));
    wFreq.push(rc.range(wS.freq[0]!, wS.freq[1]!) * (m === 0 ? 1 : m === 1 ? 1.9 : 3.3));
    wStep.push(rc.range(wS.phaseStep[0]!, wS.phaseStep[1]!) * rc.sign());
    wPh0.push(rc.range(0, TAU));
  }
  const nW = rc.int(wS.count[0]!, wS.count[1]!);
  const bAmp: number[][] = [], bPh: number[][] = [];
  for (let k = 0; k <= N; k++) {
    bAmp.push([0, 1, 2].map(() => 1 + wS.ampSpread * rc.range(-1, 1)));
    bPh.push([0, 1, 2].map((m) => wPh0[m]! + k * wStep[m]! + rc.range(-0.25, 0.25)));
  }
  const fAmp = rc.range(wS.fold.amp[0]!, wS.fold.amp[1]!) * H;
  const fFreq = rc.range(wS.fold.freq[0]!, wS.fold.freq[1]!);
  const fStep = rc.range(wS.fold.phaseStep[0]!, wS.fold.phaseStep[1]!) * rc.sign();
  const fPh = rc.range(0, TAU);
  const shA = rc.range(K.folded.shear[0]!, K.folded.shear[1]!) * H * rc.sign();
  const shL = rc.range(K.folded.shearWave[0]!, K.folded.shearWave[1]!) * H;
  const shP = rc.range(0, TAU);
  const hemPh = rc.range(0, TAU);
  const hemF = rc.range(3.2, 5.4);
  const ripF = rc.range(wS.ripple.freq[0]!, wS.ripple.freq[1]!);
  const ripPh: number[] = [];
  for (let k = 0; k <= N; k++) ripPh.push(rc.range(0, TAU));
  const ovK: number[] = [];
  for (let i = 0; i < N; i++) ovK.push(rc.range(P.stack.overlap[0]!, P.stack.overlap[1]!));
  const slopeSpread = kind === 'level' ? lerp(K.level.fan[0]!, K.level.fan[1]!, Math.abs(fanRand)) * Math.sign(fanRand || 1)
    : kind === 'leaning' ? lerp(K.leaning.fan[0]!, K.leaning.fan[1]!, Math.abs(fanRand)) * Math.sign(fanRand || 1) : 0;

  // ── the frame ───────────────────────────────────────────────────────
  let frame: Frame;
  if (polar) {
    const cx = lay.cx - lay.ax * back, cy = lay.cy - lay.ay * back;
    frame = polarFrame(w, h, lay.radial ? lay.cx : cx, lay.radial ? lay.cy : cy, asp, 0.5 * Math.min(w, h));
  } else {
    let deg = 0;
    if (kind === 'level') deg = lerp(K.level.tilt[0]!, K.level.tilt[1]!, (tiltRand + 1) / 2) + hzc.tilt;
    else if (kind === 'leaning') deg = leanSign * leanAng + hzc.tilt * 0.6;
    else deg = foldTilt * K.folded.tilt[1]! + hzc.tilt;
    frame = linearFrame(w, h, deg * DEG, kind === 'folded' ? shA : 0, TAU / shL, shP);
  }

  const q: Q = { fr: 0, u: 0, a1: 0, a2: 0, x: 0, y: 0, nx: 0, ny: 0 };
  frame.toSU(lay.cx, lay.cy, q);
  const anchorFr = q.fr, anchorU = q.u;
  // where the ring is centred on the axis (polar): the angle of the axis as a fraction of the circle
  const axisFr = polar ? (Math.atan2(lay.ay * asp, lay.ax) / TAU + 0.5) : 0.5;

  // ── thickness rhythm and the base positions ────────────────────────────
  const E = frame.uMax - frame.uMin;
  let U0: number, total: number;
  let wts = rhythmWeights(rhythm, N, rj);
  if (polar) {
    const rIn = lay.radial ? hole : Math.max(hole, back - inner);
    total = cover * Math.max(0.2 * H, frame.uMax - rIn);
    wts = wts.map((x, i) => x * (1 + 0.1 * i));
    U0 = rIn;
  } else {
    total = cover * E;
    const slack = (E - total) / 2 + 0.05 * H;
    const uc = clamp(leanK * anchorU, -slack, slack);
    U0 = uc - total / 2;
  }
  const th = fitThickness(wts, total, P.stack.minThick * H, P.stack.maxThick * H);
  const U: number[] = [U0];
  for (let i = 0; i < N; i++) U.push(U[i]! + th[i]!);
  const Uc = (U[0]! + U[N]!) / 2;
  const half = Math.max(1, (U[N]! - U[0]!) / 2);

  // ── the boundary tables ──────────────────────────────────────────────
  const amp = P.waveAmp;
  const kindAmp = wS.kindAmp[kind] ?? 1;
  const drift = tl.drift * wS.phasePerDay;
  const rho = wS.noiseFreq / TAU;
  const sideSign = anchorFr > 0.5 ? 1 : -1;
  const B: Float32Array[] = [];
  for (let k = 0; k <= N; k++) {
    const t = new Float32Array(T);
    const wgt = polar ? 1 : 0.5 + 0.5 * Math.exp(-(((U[k]! - anchorU) / (0.55 * H)) ** 2));
    const slope = slopeSpread * ((2 * k) / N - 1);
    // near the eye of a ring stack the waves must shrink with the radius, or the rings fold through the centre
    const ak = polar ? clamp(U[k]! / (0.32 * H), 0.18, 1) : 1;
    for (let j = 0; j < T; j++) {
      const fr = j / M;
      let v = U[k]!;
      // internal waves: a sum of 2–3 sinusoids …
      for (let m = 0; m < nW; m++) {
        const f = polar ? Math.max(1, Math.round(wFreq[m]! * 1.7)) : wFreq[m]!;
        v += ak * amp * kindAmp * wAmp[m]! * H * bAmp[k]![m]! * Math.sin(TAU * f * fr + bPh[k]![m]! + drift * (m % 2 ? -1 : 1) * (1 + 0.3 * m));
      }
      // … plus low-frequency noise
      const en = polar
        ? nzE.n3(Math.cos(TAU * fr) * rho + k * 5.13, Math.sin(TAU * fr) * rho, k * 1.7 + 0.5)
        : nzE.n3(fr * wS.noiseFreq + k * 5.13, k * 1.7, 0.5);
      v += ak * amp * wS.noiseAmp * H * en;
      // tiny irregularities
      v += ak * amp * wS.ripple.amp * H * Math.sin(TAU * (polar ? Math.round(ripF * 1.6) : ripF) * fr + ripPh[k]!);
      if (kind === 'folded') {
        const ph = fPh + k * fStep;
        v += amp * fAmp * (Math.sin(TAU * fFreq * fr + ph) + wS.fold.second * Math.sin(TAU * 2 * fFreq * fr + 2 * ph + 1.1));
      }
      if (!polar) {
        v += slope * (frame.s0 + fr * (frame.s1 - frame.s0));
        const gs = Math.exp(-(((fr - anchorFr) / hzc.width) ** 2));
        v += hzc.bow * H * gs * wgt;
        v += hzc.droop * H * Math.pow(clamp((fr - 0.5) * sideSign + 0.5), 1.6);
        v += hzc.dome * H * ((U[k]! - Uc) / half) * gs;
        if (hzc.hem !== 0) {
          const hp = 0.5 + 0.5 * Math.cos(TAU * hemF * fr + hemPh + k * 0.9);
          v += hzc.hem * H * hp * hp * (0.6 + 0.4 * wgt);
        }
      } else {
        const th2 = (fr - 0.5) * TAU;
        v += ak * egg * Math.cos(th2 - (axisFr - 0.5) * TAU) * (0.4 + 0.6 * (k / N));
        v += ak * K.fan.ringDrift * H * (k - N / 2) * Math.sin(th2 * 2 + k);
        if (v < 0.014 * H) v = 0.014 * H;
      }
      t[j] = v;
    }
    B.push(t);
  }
  // soft minimum gap between neighbouring boundaries (smooth, so lines never kink)
  const mg = P.stack.minGap * H;
  for (let k = 1; k <= N; k++) {
    const a = B[k - 1]!, b = B[k]!;
    for (let j = 0; j < T; j++) {
      const gap = b[j]! - a[j]!;
      b[j] = a[j]! + 0.5 * (gap + mg + Math.sqrt((gap - mg) * (gap - mg) + (0.35 * mg) ** 2));
    }
  }
  // overlap tails
  const OV: Float32Array[] = [];
  for (let i = 0; i < N; i++) {
    const t = new Float32Array(T);
    for (let j = 0; j < T; j++) {
      const fr = j / M;
      const en = polar
        ? nzE.n3(Math.cos(TAU * fr) * rho * 1.6 + 40 + i * 3.1, Math.sin(TAU * fr) * rho * 1.6, 9.5)
        : nzE.n3(fr * wS.noiseFreq * 1.6 + 40 + i * 3.1, 9.5, 0.5);
      const gap = B[i + 1]![j]! - B[i]![j]!;
      t[j] = Math.max(0.02 * gap, gap * ovK[i]! * (1 + P.stack.overlapWobble * en));
    }
    OV.push(t);
  }
  const mid: number[] = [], thick: number[] = [];
  for (let i = 0; i < N; i++) {
    let s = 0, m2 = 0;
    for (let j = 0; j < T; j++) { s += B[i + 1]![j]! - B[i]![j]!; m2 += 0.5 * (B[i + 1]![j]! + B[i]![j]!); }
    thick.push(s / T); mid.push(m2 / T);
  }
  return { frame, N, M, dir, B, OV, thick, mid, anchorFr, anchorU, rj, kind, axisFr };
}
