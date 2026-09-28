// THE SHEETS · body — the glass itself, painted on a small buffer and upscaled (free softness).
//
// Sheets are laid back to front. For each pixel a sheet covers, we look *through* it: the scene painted so far
// (the abyss first, then earlier sheets) is sampled at a displaced, slightly magnified position, filtered by the
// sheet's colour (multiply-like absorption), mixed with its own backlit tint, then edge-lit, streaked and shaded.
// Coverage is kept as a separate alpha so the layer is transparent outside the sheets.
import type { Cv, LayerCtx } from './types.ts';
import type { Stack } from './strata.geom.ts';
import { oklchToRgb, type RGB } from '../color.ts';
import { clamp, hash2 } from '../math.ts';

export interface SheetInfo {
  /** spatial index 0..N−1 */
  i: number;
  /** paint order (0 = painted first) */
  ord: number;
  lo: Float32Array; hi: Float32Array;
  frontLo: boolean;
  /** growth ease 0..1, the alpha (with the ghost floor), the u shift while it settles, refraction factor */
  e: number; alpha: number; shift: number; refK: number;
  tpOn: boolean; tpA: number; tpB: number; tpF: number;
  tintAlpha: number;
  topA: RGB; botA: RGB; topB: RGB; botB: RGB;
  filt: RGB; rim: RGB; milk: RGB; line: RGB; lit: RGB;
  o: number[];
  spark: boolean;
  /** where the broad sheen of this sheet sits (fr) and how wide */
  shC: number; shW: number;
  /** floor of the interface line's strength while the sheet is still a ghost */
  ghostLine: number;
}

export interface Look {
  haze: RGB;
  /** 0..1 how strongly the horizon haze colours the sheets (lower for mono palettes) */
  hazeK: number;
  /** extra light near the anchor while the bloom opens */
  bloomLift: number;
}

const sstep = (a: number, b: number, v: number) => { const t = (v - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

export function taperAt(sh: SheetInfo, fr: number, polar: boolean): number {
  if (!sh.tpOn) return 1;
  if (polar) {
    let d = Math.abs(fr - sh.tpA);
    if (d > 0.5) d = 1 - d;
    return 1 - sstep(sh.tpB - sh.tpF, sh.tpB + sh.tpF, d);
  }
  return sstep(sh.tpA - sh.tpF, sh.tpA + sh.tpF, fr) * (1 - sstep(sh.tpB - sh.tpF, sh.tpB + sh.tpF, fr));
}

let sr = 0, sg = 0, sb = 0;
function samp(buf: Float32Array, bx: number, by: number, bw: number, bh: number) {
  if (bx < 0) bx = 0; else if (bx > bw - 1.001) bx = bw - 1.001;
  if (by < 0) by = 0; else if (by > bh - 1.001) by = bh - 1.001;
  const x0 = bx | 0, y0 = by | 0, fx = bx - x0, fy = by - y0;
  const o = (y0 * bw + x0) * 3, o2 = o + bw * 3;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  sr = buf[o]! * w00 + buf[o + 3]! * w10 + buf[o2]! * w01 + buf[o2 + 3]! * w11;
  sg = buf[o + 1]! * w00 + buf[o + 4]! * w10 + buf[o2 + 1]! * w01 + buf[o2 + 4]! * w11;
  sb = buf[o + 2]! * w00 + buf[o + 5]! * w10 + buf[o2 + 2]! * w01 + buf[o2 + 5]! * w11;
}

function boxH(src: Float32Array, dst: Float32Array, bw: number, bh: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < bh; y++) {
    const row = y * bw;
    for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[(row + Math.min(bw - 1, Math.max(0, x))) * 3 + ch]!;
      for (let x = 0; x < bw; x++) {
        dst[(row + x) * 3 + ch] = sum * inv;
        sum += src[(row + Math.min(bw - 1, x + r + 1)) * 3 + ch]! - src[(row + Math.max(0, x - r)) * 3 + ch]!;
      }
    }
  }
}
function boxV(src: Float32Array, dst: Float32Array, bw: number, bh: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < bw; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += src[(Math.min(bh - 1, Math.max(0, y)) * bw + x) * 3 + ch]!;
      for (let y = 0; y < bh; y++) {
        dst[(y * bw + x) * 3 + ch] = sum * inv;
        sum += src[(Math.min(bh - 1, y + r + 1) * bw + x) * 3 + ch]! - src[(Math.max(0, y - r) * bw + x) * 3 + ch]!;
      }
    }
  }
}
function blurRGB(src: Float32Array, dst: Float32Array, tmp: Float32Array, bw: number, bh: number, r: number) {
  const rr = Math.max(1, Math.round(r));
  boxH(src, tmp, bw, bh, rr); boxV(tmp, dst, bw, bh, rr);
  boxH(dst, tmp, bw, bh, rr); boxV(tmp, dst, bw, bh, rr);
}

export function paintBody(c: LayerCtx, st: Stack, sheets: SheetInfo[], scene0: Float32Array, bw: number, bh: number, look: Look): Cv {
  const P = c.P.layers.strata;
  const { w, h, lay, tl } = c;
  const sc = c.S;
  const Bp = P.body;
  const GK = P.glass[c.traits.body.glass]!;
  const frame = st.frame;
  const polar = frame.polar;
  const M = st.M;
  const kx = w / bw, ky = h / bh;
  const n = bw * bh;
  const H = h;
  const glassKind = c.traits.body.glass;

  // per-pixel frame coordinates, computed once and shared by every sheet
  const FR = new Float32Array(n), UU = new Float32Array(n), A1 = new Float32Array(n), A2 = new Float32Array(n), FALL = new Float32Array(n), FALLP = new Float32Array(n);
  const q = { fr: 0, u: 0, a1: 0, a2: 0, x: 0, y: 0, nx: 0, ny: 0 };
  const Rl = lay.R * Bp.lit.radius;
  const inv2 = 1 / (Rl * Rl);
  for (let j = 0; j < bh; j++) {
    const y = (j + 0.5) * ky;
    for (let i = 0; i < bw; i++) {
      const x = (i + 0.5) * kx;
      const k = j * bw + i;
      frame.toSU(x, y, q);
      FR[k] = q.fr; UU[k] = q.u; A1[k] = q.a1; A2[k] = q.a2;
      const d2 = ((x - lay.cx) ** 2 + (y - lay.cy) ** 2) * inv2;
      FALL[k] = Math.exp(-1.7 * d2);
      FALLP[k] = Math.pow(FALL[k]!, 1.25);
    }
  }

  let SC = new Float32Array(scene0);
  let SC2 = new Float32Array(n * 3);
  const Pm = new Float32Array(n * 3);
  const Al = new Float32Array(n);
  // the two slow fields (mottling, broad drift) live on a coarse grid and are interpolated
  const STEP = 4;
  const gwN = ((bw - 1) >> 2) + 2, ghN = ((bh - 1) >> 2) + 2;
  const MG = new Float32Array(gwN * ghN), DG = new Float32Array(gwN * ghN);
  const blurT = GK.blur > 0 ? new Float32Array(n * 3) : null;
  const blurD = GK.blur > 0 ? new Float32Array(n * 3) : null;

  const nzS = c.noise('strata/streak'), nzM = c.noise('strata/mottle');
  const ca = 1 / (Bp.streakAlong * sc), cc = 1 / (Bp.streakAcross * sc), cm = 1 / (Bp.mottle * sc), cv = 1 / (Bp.broad * sc);
  const soft = GK.soft;
  const fe = Bp.feather * kx * soft, feB = Bp.bleed * kx * soft;
  const reach = Bp.shadowReach * H;
  const pad = Math.max(fe, feB, reach) + 2;
  frame.normal(0, q);
  const nlx = q.nx, nly = q.ny;
  const ax = lay.cx, ay = lay.cy;
  const fallBoost = 1 + look.bloomLift;
  const isPrism = glassKind === 'prismatic';
  const NZ = 2.4;
  const fallPow = Math.pow(fallBoost, 1.25);
  const rw0 = GK.rimW[0]! * sc, rw1 = GK.rimW[1]! * sc;
  const lamW = 1 / (Bp.lamina * sc);
  const capY = Bp.cap, kneeY = Bp.cap * Bp.knee;
  const disp = GK.disp;

  // prismatic rim: a short spectral ramp from the front edge inward
  const FH = P.color.fringe;
  const rimLUT: RGB[] = [];
  if (isPrism) for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const hue = FH.hues[0]! + t * (FH.hues[2]! + 360 - FH.hues[0]!);
    rimLUT.push(oklchToRgb(0.8, FH.chroma * 1.25, hue));
  }

  for (const sh of sheets) {
    if (sh.alpha < 0.002) continue;
    SC2.set(SC);
    let src = SC;
    if (blurT && blurD) { blurRGB(SC, blurD, blurT, bw, bh, (GK.blur * sc * bw) / w); src = blurD; }
    const lo = sh.lo, hi = sh.hi;
    const frontLo = sh.frontLo;
    const bs = frontLo ? -1 : 1;
    const tintA = sh.tintAlpha * P.opacity;
    const refPx = Bp.refract * sc * P.refraction * GK.refract * sh.refK;
    const mag = Bp.magnify * P.refraction * GK.refract * sh.refK;
    const filt = sh.filt;
    const o = sh.o;
    const shadowAmt = Bp.shadow * sh.e;
    const nodeEdge = pad + STEP * kx * 1.5;
    for (let gj = 0; gj < ghN; gj++) {
      const pj = Math.min(bh - 1, gj * STEP);
      for (let gi = 0; gi < gwN; gi++) {
        const k = pj * bw + Math.min(bw - 1, gi * STEP);
        const gidx = gj * gwN + gi;
        const tt = FR[k]! * M;
        let j0 = tt | 0; if (j0 >= M) j0 = M - 1;
        const ft = tt - j0;
        const l = lo[j0]! + (lo[j0 + 1]! - lo[j0]!) * ft + sh.shift;
        const hh = hi[j0]! + (hi[j0 + 1]! - hi[j0]!) * ft + sh.shift;
        const u = UU[k]!;
        if (u < l - nodeEdge || u > hh + nodeEdge) { MG[gidx] = 0; DG[gidx] = 0; continue; }
        const dF = Math.max(0, frontLo ? u - l : hh - u);
        const th = hh - l;
        const vv = th > 1 ? Math.min(1, dF / th) : 0;
        let m1 = NZ * nzM.n3(A1[k]! * cm + o[3]!, A2[k]! * cm + o[4]!, dF * cm * 1.1 + o[5]!);
        let d1 = NZ * nzM.n3(A1[k]! * cv + o[6]!, A2[k]! * cv + o[7]!, vv * 0.4 + o[8]!);
        MG[gidx] = m1 < -1.2 ? -1.2 : m1 > 1.2 ? 1.2 : m1;
        DG[gidx] = d1 < -1.2 ? -1.2 : d1 > 1.2 ? 1.2 : d1;
      }
    }

    for (let j = 0; j < bh; j++) {
      const wy = (j + 0.5) * ky;
      for (let i = 0; i < bw; i++) {
        const k = j * bw + i;
        const frac = FR[k]!;
        const tp = sh.tpOn ? taperAt(sh, frac, polar) : 1;
        if (tp < 0.004) continue;
        const tt = frac * M;
        let j0 = tt | 0; if (j0 >= M) j0 = M - 1;
        const ft = tt - j0;
        const l = lo[j0]! + (lo[j0 + 1]! - lo[j0]!) * ft + sh.shift;
        const hh = hi[j0]! + (hi[j0 + 1]! - hi[j0]!) * ft + sh.shift;
        const u = UU[k]!;
        if (u < l - pad || u > hh + pad) continue;
        const k3 = k * 3;
        const Aprev = Al[k]!;

        // contact shadow this sheet casts on whatever lies behind its front edge
        const ef = frontLo ? l : hh;
        const sdist = bs * (u - ef);
        if (sdist > 0 && sdist < reach && Aprev > 0.004) {
          const sd = shadowAmt * tp * Math.exp((-sdist * 2.4) / reach) * Aprev;
          SC2[k3] = SC2[k3]! * (1 - sd); SC2[k3 + 1] = SC2[k3 + 1]! * (1 - sd); SC2[k3 + 2] = SC2[k3 + 2]! * (1 - sd);
          Pm[k3] = Pm[k3]! * (1 - sd); Pm[k3 + 1] = Pm[k3 + 1]! * (1 - sd); Pm[k3 + 2] = Pm[k3 + 2]! * (1 - sd);
        }

        // soft coverage: crisp-ish on the front edge, softer where the sheet tucks under its neighbour
        let cl: number, ch: number;
        if (frontLo) { cl = sstep(l - fe, l + fe, u); ch = 1 - sstep(hh - feB, hh + feB, u); }
        else { cl = sstep(l - feB, l + feB, u); ch = 1 - sstep(hh - fe, hh + fe, u); }
        const cov = cl * ch * tp * sh.alpha;
        if (cov < 0.003) continue;

        const th = hh - l;
        const dF = Math.max(0, frontLo ? u - l : hh - u);
        const dBk = Math.max(0, th - dF);
        const vv = th > 1 ? Math.min(1, dF / th) : 0;
        const fall = FALL[k]! * fallBoost;

        // fields: contour-following streaks, density mottling, broad brightness drift
        const a1 = A1[k]!, a2 = A2[k]!;
        // (gradient noise sits in about ±0.4; NZ brings it to a usable ±1)
        let n1 = NZ * nzS.n3(a1 * ca + o[0]!, a2 * ca + o[1]!, dF * cc + o[2]!); n1 = n1 < -1.2 ? -1.2 : n1 > 1.2 ? 1.2 : n1;
        const rib = 1 - Math.min(1, Math.abs(n1));
        const gx = i >> 2, gy = j >> 2, fx = (i & 3) * 0.25, fy = (j & 3) * 0.25;
        const g00 = gy * gwN + gx, g10 = g00 + gwN;
        const mott = (MG[g00]! * (1 - fx) + MG[g00 + 1]! * fx) * (1 - fy) + (MG[g10]! * (1 - fx) + MG[g10 + 1]! * fx) * fy;
        const drift = (DG[g00]! * (1 - fx) + DG[g00 + 1]! * fx) * (1 - fy) + (DG[g10]! * (1 - fx) + DG[g10 + 1]! * fx) * fy;

        // ── look through the glass ───────────────────────────────────
        let nx: number, ny: number;
        if (polar) {
          nx = a1 / frame.Rref; ny = a2 / frame.Rref / frame.asp;
          const m = Math.sqrt(nx * nx + ny * ny) || 1; nx /= m; ny /= m;
        } else { nx = nlx; ny = nly; }
        const wx = (i + 0.5) * kx;
        const ramp = Bp.refractRamp[0]! + (Bp.refractRamp[1]! - Bp.refractRamp[0]!) * vv;
        const off = refPx * ramp * (1 + Bp.wobble * n1);
        let sx = wx - nx * off, sy = wy - ny * off;
        sx = ax + (sx - ax) * (1 - mag * fall); sy = ay + (sy - ay) * (1 - mag * fall);
        let vr: number, vg: number, vb: number;
        if (disp > 0) {
          const dpx = disp * off;
          samp(src, (sx - nx * dpx) / kx - 0.5, (sy - ny * dpx) / ky - 0.5, bw, bh); vr = sr;
          samp(src, sx / kx - 0.5, sy / ky - 0.5, bw, bh); vg = sg;
          samp(src, (sx + nx * dpx) / kx - 0.5, (sy + ny * dpx) / ky - 0.5, bw, bh); vb = sb;
        } else {
          samp(src, sx / kx - 0.5, sy / ky - 0.5, bw, bh);
          vr = sr; vg = sg; vb = sb;
        }
        // multiply-like absorption, doubled where a sheet already lies beneath
        const ab = Math.min(0.95, GK.absorb * (1 + Bp.doubleRich * Aprev));
        vr *= 1 + (filt[0] - 1) * ab; vg *= 1 + (filt[1] - 1) * ab; vb *= 1 + (filt[2] - 1) * ab;

        // ── the sheet's own backlit tint ─────────────────────────────
        const vs = vv * vv * (3 - 2 * vv);
        // laminae: fine pinstripes that follow the sheet's own edge, in patches
        const lam = Math.sin(6.2832 * (dF * lamW + 0.5 * n1 + o[7]!));
        const lamK = Bp.laminaGain * GK.lamina * (0.5 + 0.5 * mott);
        const tvar = Math.max(0.3, 1 + Bp.streakGain * n1 + Bp.driftGain * drift + lamK * lam);
        const lit = (Bp.lit.floor + Bp.lit.gain * fall) * tvar;
        // (around a ring the along-blend must close on itself)
        const fB = polar ? 1 - Math.abs(1 - 2 * frac) : frac;
        const fA = 1 - fB;
        const tr = (fA * (sh.topA[0] + (sh.botA[0] - sh.topA[0]) * vs) + fB * (sh.topB[0] + (sh.botB[0] - sh.topB[0]) * vs)) * lit;
        const tg = (fA * (sh.topA[1] + (sh.botA[1] - sh.topA[1]) * vs) + fB * (sh.topB[1] + (sh.botB[1] - sh.topB[1]) * vs)) * lit;
        const tb = (fA * (sh.topA[2] + (sh.botA[2] - sh.topA[2]) * vs) + fB * (sh.topB[2] + (sh.botB[2] - sh.topB[2]) * vs)) * lit;
        let hzA = Bp.lit.haze * look.hazeK * FALLP[k]! * fallPow * (1 - 0.35 * vv);
        hzA *= 1 + 0.35 * drift;
        const dens = 1 + GK.dens * mott;
        const aT = clamp(tintA * dens * (1 + Bp.depthTint * (vv - 0.35)), 0, 0.95);
        const eT = Bp.emit * P.opacity * (0.55 + 0.45 * dens);
        let r = vr * (1 - aT) + (tr + look.haze[0] * hzA) * eT;
        let g = vg * (1 - aT) + (tg + look.haze[1] * hzA) * eT;
        let b = vb * (1 - aT) + (tb + look.haze[2] * hzA) * eT;

        // pigment pooling at the edges (stained), milk of the frosted glass, backlit centre
        if (GK.edgeDark > 0) {
          let ed = 0;
          if (dF < rw0 * 3.2) ed += Math.exp(-dF / (rw0 * 0.7));
          if (dBk < rw1 * 3.2) ed += Math.exp(-dBk / (rw1 * 0.7));
          ed = Math.min(0.7, GK.edgeDark * ed);
          r *= 1 - ed; g *= 1 - ed; b *= 1 - ed;
        }
        if (GK.milk > 0) {
          const mk = GK.milk * (0.72 + 0.28 * (0.5 + 0.5 * mott)) * (0.7 + 0.3 * lit);
          r += (sh.milk[0] * lit - r) * mk; g += (sh.milk[1] * lit - g) * mk; b += (sh.milk[2] * lit - b) * mk;
        }
        if (GK.inner > 0) {
          const inn = GK.inner * 4 * vv * (1 - vv) * (0.6 + 0.8 * fall);
          r += sh.lit[0] * inn; g += sh.lit[1] * inn; b += sh.lit[2] * inn;
        }
        if (Aprev > 0.01) {
          const dk = 1 - Bp.doubleDark * Aprev;
          r *= dk; g *= dk; b *= dk;
        }
        // the body stays dark-to-mid: a soft shoulder on its luminance
        {
          const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (Y > kneeY) {
            const yc = kneeY + (capY - kneeY) * (1 - Math.exp(-(Y - kneeY) / (capY - kneeY)));
            const kk = yc / Y;
            r *= kk; g *= kk; b *= kk;
          }
        }
        // a broad sheen, as if light glanced off a polished face
        if (GK.sheen > 0) {
          let dc = Math.abs(frac - sh.shC); if (dc > 0.5) dc = 1 - dc;
          const sw = dc / sh.shW;
          const shn = sw < 2.6 ? GK.sheen * Bp.sheen * Math.exp(-sw * sw) * (1 - vv) * Math.sqrt(1 - vv) * (0.55 + 0.45 * Math.min(1, fall * 1.5)) : 0;
          if (shn > 0.002) {
            if (isPrism) {
              const tq = frac * (polar ? 2 : 2.2) + vv * 0.8 + sh.shC;
              const li = rimLUT[Math.min(23, (1 - Math.abs(1 - 2 * (tq - Math.floor(tq)))) * 23) | 0]!;
              r += li[0] * shn; g += li[1] * shn; b += li[2] * shn;
            } else { r += sh.rim[0] * shn; g += sh.rim[1] * shn; b += sh.rim[2] * shn; }
          }
        }

        // edge light: a bevel that catches the horizon, brighter toward the anchor
        const rimN = 0.62 + 0.38 * (0.5 + 0.5 * n1);
        const rimL = Bp.rimLit + (1 - Bp.rimLit) * Math.min(1.4, fall);
        let rimE = 0;
        if (dF < rw0 * 4.5) rimE += GK.rim[0]! * Math.exp(-dF / rw0);
        if (dBk < rw1 * 4.5) rimE += GK.rim[1]! * Math.exp(-dBk / rw1);
        const rimF = rimE * rimN * rimL * Bp.rimGain;
        if (rimF > 0.002) {
          if (isPrism) {
            const li = rimLUT[Math.min(23, ((dF / (GK.rimW[0]! * sc * 2.4)) * 23) | 0)]!;
            r += li[0] * rimF; g += li[1] * rimF; b += li[2] * rimF;
          } else {
            r += sh.rim[0] * rimF; g += sh.rim[1] * rimF; b += sh.rim[2] * rimF;
          }
        }
        // ribbons of focused light, following the sheet
        if (GK.streak > 0) {
          const rb = Bp.ribbonGain * GK.streak * (rib * rib * rib * rib * rib * rib * rib) * (0.3 + 0.7 * lit) * (0.4 + 0.6 * (0.5 + 0.5 * mott));
          r += sh.rim[0] * rb; g += sh.rim[1] * rb; b += sh.rim[2] * rb;
        }
        r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;

        // ── lay it down ────────────────────────────────────────────
        SC2[k3] = SC2[k3]! + (r - SC2[k3]!) * cov;
        SC2[k3 + 1] = SC2[k3 + 1]! + (g - SC2[k3 + 1]!) * cov;
        SC2[k3 + 2] = SC2[k3 + 2]! + (b - SC2[k3 + 2]!) * cov;
        Pm[k3] = Pm[k3]! * (1 - cov) + r * cov;
        Pm[k3 + 1] = Pm[k3 + 1]! * (1 - cov) + g * cov;
        Pm[k3 + 2] = Pm[k3 + 2]! * (1 - cov) + b * cov;
        Al[k] = Aprev * (1 - cov) + cov;
      }
    }
    const t = SC; SC = SC2; SC2 = t;
  }

  // ── out: un-premultiply into a small canvas ──────────────────────────
  const small = c.makeCanvas(bw, bh);
  const sg2 = small.getContext('2d')!;
  const img = sg2.createImageData(bw, bh);
  const px = img.data;
  const dseed = Math.floor(c.rng('strata/dither')() * 1e9);
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const k = j * bw + i;
      const a = Al[k]!;
      const o4 = k * 4;
      if (a < 0.003) { px[o4 + 3] = 0; continue; }
      const nn = hash2(i, j, dseed) - 0.5;
      const ia = 1 / a;
      px[o4] = clamp(Math.round(Pm[k * 3]! * ia + nn), 0, 255);
      px[o4 + 1] = clamp(Math.round(Pm[k * 3 + 1]! * ia + nn), 0, 255);
      px[o4 + 2] = clamp(Math.round(Pm[k * 3 + 2]! * ia + nn), 0, 255);
      px[o4 + 3] = clamp(Math.round(a * 255), 0, 255);
    }
  }
  sg2.putImageData(img, 0, 0);
  void tl;
  return small;
}
