// THE ABYSS — the far, vast, dark water that remembers every light that ever fell into it.
//
// Deepest, largest, darkest, blurriest, least saturated layer (OKLab L ≈ 0.06–0.22, a lit tail to ≈ 0.3 near
// the horizon; chroma ≈ 35–55 % of the palette's). It is painted on a small buffer (≈100 px wide) and upscaled in
// floats, so there is not one edge anywhere:
//
//   fog       coordinates are advected through a smooth curl-noise flow in small steps (a flow map never folds
//             over itself, so the fog swirls like ink in water but never creases), then read by 4-octave 3-D
//             noise (z = the days: it breathes with the tides and freezes at the reveal). Densities are soft
//             tanh curves and are blurred once more, so no front is thinner than a few buffer pixels.
//   colour    OKLab stops void → deep → mid → haze → ember (+ an "echo" lobe, cool shadows). Every element is a
//             translucent lerp toward its stop; the running weights become one colour at the end (lightness and
//             chroma mix linearly, hue as the plain OKLab a-b mix, so opposite hues go quiet, not muddy).
//   light     an asymmetric haze glow gathered at the horizon anchor and stretched along its axis, a horizon-line
//             band, an ember at the anchor, an aura of aerial perspective, and clouds rim-lit from the horizon.
//             The halo's hue turns a little from core to fringe. Far from the light the water turns cold.
//   palettes  Blackglass: silver-blue fog, restrained. Aurora Prism: hue walks the wheel across the frame.
//             Yellows are pulled toward umber/emerald in the shadows (dark yellow is olive mud).
//   growth    c.grow('abyss'): a near-black frame with an ember → layered, coloured, swollen depth (contrast,
//             chroma, cloud scale and haze all increase).
//   time      only c.tl.drift (noise z, breathing), c.tl.pulse (brightness) and c.tl.bloom (a little more light).
//   output    bicubic upscale of the float buffer, triangular dither added before the first rounding (so the
//             slow darks do not band in 8-bit), then one smooth canvas upscale to the frame.
import type { Cv, LayerFn } from './types.ts';
import { mix, oklabToRgbRaw, rgbToOklab, type RGB } from '../color.ts';
import { DEG, TAU, angDiff, clamp, hash2, lerp, smoothstep } from '../math.ts';

interface Stop { L: number; C: number; ux: number; uy: number }

/**
 * Dark yellow is olive mud. In the shadows, ochre leans toward umber and lime toward emerald; `k` (0 for lit
 * stops … 1 for the darkest) says how far. Everything outside the yellow band (≈55–140°) is left alone.
 */
function deMud(hRad: number, k: number, mud: { lo: number; mid: number; hi: number; pull: number }): number {
  const d = ((hRad / DEG) % 360 + 360) % 360;
  if (k <= 0 || d < mud.lo || d > mud.hi) return hRad;
  const target = d < mud.mid ? mud.lo - 5 : mud.hi;
  return (d + (target - d) * mud.pull * k) * DEG;
}

/** a ramp stop: hue + chroma from a (growth-toned) palette colour, lightness from the abyss ladder */
function makeStop(col: RGB, L: number, frac: number, floor: number | null, monoHue: number, chromaFloor = 0, mudK = 0, mud?: { lo: number; mid: number; hi: number; pull: number }): Stop {
  const [, a0, b0] = rgbToOklab(col);
  let C = Math.hypot(a0, b0) * frac;
  let h = Math.atan2(b0, a0);
  if (floor !== null && C < floor) { C = floor; h = monoHue * DEG; }
  else if (floor === null) C = Math.max(C, chromaFloor);
  if (mud && floor === null) h = deMud(h, mudK, mud);
  return { L, C, ux: Math.cos(h), uy: Math.sin(h) };
}

const outOfGamut = (c: RGB) => c[0] < -0.5 || c[1] < -0.5 || c[2] < -0.5 || c[0] > 255.5 || c[1] > 255.5 || c[2] > 255.5;

/** OKLab → sRGB 0..255, pulling chroma in (keeping L and hue) when the colour is outside the gamut */
function labToRgb(L: number, a: number, b: number, out: number[]): void {
  let c = oklabToRgbRaw(L, a, b);
  if (outOfGamut(c)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 7; i++) {
      const m = (lo + hi) / 2;
      if (outOfGamut(oklabToRgbRaw(L, a * m, b * m))) hi = m; else lo = m;
    }
    c = oklabToRgbRaw(L, a * lo, b * lo);
  }
  out[0] = c[0]!; out[1] = c[1]!; out[2] = c[2]!;
}

const tri = (t: number) => 1 - Math.abs(1 - (((t % 2) + 2) % 2));

/** smooth upscale of `src` to dw×dh */
function up(src: Cv, dw: number, dh: number, mk: (w: number, h: number) => Cv): Cv {
  const cv = mk(dw, dh);
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, dw, dh);
  return cv;
}

/** Catmull-Rom taps for resampling `sn` samples to `dn` (4 indices + 4 weights per destination sample) */
function cubicTaps(sn: number, dn: number): { idx: Int32Array; wt: Float32Array } {
  const idx = new Int32Array(dn * 4), wt = new Float32Array(dn * 4);
  for (let d = 0; d < dn; d++) {
    const u = ((d + 0.5) * sn) / dn - 0.5;
    const i0 = Math.floor(u), t = u - i0, t2 = t * t, t3 = t2 * t;
    wt[d * 4] = -0.5 * t3 + t2 - 0.5 * t;
    wt[d * 4 + 1] = 1.5 * t3 - 2.5 * t2 + 1;
    wt[d * 4 + 2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
    wt[d * 4 + 3] = 0.5 * t3 - 0.5 * t2;
    for (let k = 0; k < 4; k++) idx[d * 4 + k] = Math.min(sn - 1, Math.max(0, i0 - 1 + k));
  }
  return { idx, wt };
}

/** separable bicubic resample of an interleaved 3-channel float image, sw×sh → dw×dh */
function resample3(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const X = cubicTaps(sw, dw), Y = cubicTaps(sh, dh);
  const tmp = new Float32Array(dw * sh * 3);
  for (let j = 0; j < sh; j++) {
    const row = j * sw * 3;
    for (let x = 0; x < dw; x++) {
      const i0 = X.idx[x * 4]! * 3 + row, i1 = X.idx[x * 4 + 1]! * 3 + row, i2 = X.idx[x * 4 + 2]! * 3 + row, i3 = X.idx[x * 4 + 3]! * 3 + row;
      const w0 = X.wt[x * 4]!, w1 = X.wt[x * 4 + 1]!, w2 = X.wt[x * 4 + 2]!, w3 = X.wt[x * 4 + 3]!;
      const o = (j * dw + x) * 3;
      tmp[o] = src[i0]! * w0 + src[i1]! * w1 + src[i2]! * w2 + src[i3]! * w3;
      tmp[o + 1] = src[i0 + 1]! * w0 + src[i1 + 1]! * w1 + src[i2 + 1]! * w2 + src[i3 + 1]! * w3;
      tmp[o + 2] = src[i0 + 2]! * w0 + src[i1 + 2]! * w1 + src[i2 + 2]! * w2 + src[i3 + 2]! * w3;
    }
  }
  const out = new Float32Array(dw * dh * 3);
  const rw = dw * 3;
  for (let y = 0; y < dh; y++) {
    const r0 = Y.idx[y * 4]! * rw, r1 = Y.idx[y * 4 + 1]! * rw, r2 = Y.idx[y * 4 + 2]! * rw, r3 = Y.idx[y * 4 + 3]! * rw;
    const w0 = Y.wt[y * 4]!, w1 = Y.wt[y * 4 + 1]!, w2 = Y.wt[y * 4 + 2]!, w3 = Y.wt[y * 4 + 3]!;
    const o = y * rw;
    for (let i = 0; i < rw; i++) out[o + i] = tmp[r0 + i]! * w0 + tmp[r1 + i]! * w1 + tmp[r2 + i]! * w2 + tmp[r3 + i]! * w3;
  }
  return out;
}

/** in-place separable [1 2 1]/4 blur (edges clamped) */
function blur121(f: Float32Array, tmp: Float32Array, bw: number, bh: number): void {
  for (let j = 0; j < bh; j++) {
    const r = j * bw;
    for (let i = 0; i < bw; i++) {
      const a = f[r + (i > 0 ? i - 1 : 0)]!, b = f[r + i]!, c = f[r + (i < bw - 1 ? i + 1 : i)]!;
      tmp[r + i] = 0.25 * a + 0.5 * b + 0.25 * c;
    }
  }
  for (let j = 0; j < bh; j++) {
    const r0 = (j > 0 ? j - 1 : 0) * bw, r1 = j * bw, r2 = (j < bh - 1 ? j + 1 : j) * bw;
    for (let i = 0; i < bw; i++) f[r1 + i] = 0.25 * tmp[r0 + i]! + 0.5 * tmp[r1 + i]! + 0.25 * tmp[r2 + i]!;
  }
}

// stop indices in the weight vector
const V = 0, D = 1, M = 2, H = 3, E = 4, X = 5, S = 6;

export const render: LayerFn = (c) => {
  const A = c.P.layers.abyss;
  const { w, h, lay, tl } = c;
  const F = A.field, GL = A.glow;

  // ── growth ────────────────────────────────────────────────────
  const g = c.grow('abyss');
  const G = A.growth;
  const bloomK = smoothstep(0, 1, tl.bloom);
  const kL = lerp(G.levelAt0, 1, g);
  const ctK = lerp(G.contrastAt0, 1, g);
  const freqK = lerp(G.freqAt0, 1, g);
  const warpK = lerp(G.warpAt0, 1, g);
  const chromaK = lerp(G.chromaAt0, 1, g);
  const hazeK = lerp(G.hazeAt0, 1, g) * (1 + G.bloomGlow * bloomK);
  const breath = 1 + A.breath * Math.sin(tl.drift * TAU);
  // very wide or very tall frames get a proportionally larger glow, so the light still fills them
  const asp = Math.max(w, h) / Math.min(w, h);
  const aspK = clamp(Math.pow(asp / A.aspectRef, A.aspectPow), 1, A.aspectMax);
  const sizeK = lerp(G.hazeSizeAt0, 1, g) * breath * aspK;
  const pulseK = 1 + c.P.clock.pulseAmp * tl.pulse;
  const z = tl.drift * F.driftPerDay;

  // ── which kind of palette / body ─────────────────────────────
  const spectral = c.full.spectral;
  const glassLab = rgbToOklab(c.full.c.glass);
  const mono = !spectral && Math.hypot(glassLab[1], glassLab[2]) < A.mono.below;
  const MF = A.mono.floor;
  const fl = (v: number) => (mono ? v * chromaK : null);
  const glassKind = c.traits.body.glass, iface = c.traits.body.interface;

  // ── per-seed composition (fixed number of draws, independent of quality) ─
  const rc = c.rng('abyss/comp');
  const bias = rc.range(-0.1, 0.1);
  const hueMul = rc.range(0.75, 1.3);
  const freqMul = rc.range(0.92, 1.14);
  const warpMul = rc.range(0.85, 1.2);
  const swirlSign = rc.sign();
  const tiltSign = rc.sign();
  const haloSign = rc.sign();
  const off: number[] = [];
  for (let i = 0; i < 12; i++) off.push(rc.range(-30, 30));

  // ── colour stops (hue + chroma of the toned palette, lightness of the ladder) ─
  const LD = A.ladder, CH = A.chroma;
  const cFrac = (v: number) => v * chromaK * (glassKind === 'stained' ? 1.08 : 1);
  // the fog stops borrow chroma from the next role up, so even the darkest water still has a colour of its own
  const deepCol = mix(c.pal.deep, c.pal.mid, A.stopMix.deep);
  const midCol = mix(c.pal.mid, c.pal.glass, A.stopMix.mid);
  // when the horizon's tint nearly cancels the palette's glass (pale cyan on saffron…) the haze goes to grey-olive:
  // then it is pulled back toward the glass so the light keeps a colour of its own
  const cH = Math.hypot(rgbToOklab(c.pal.haze)[1], rgbToOklab(c.pal.haze)[2]);
  const cG = Math.hypot(rgbToOklab(c.pal.glass)[1], rgbToOklab(c.pal.glass)[2]) || 1e-6;
  const hazeBack = A.hazeKeep * (1 - smoothstep(A.hazeKeepLo, A.hazeKeepHi, cH / cG));
  const hazeCol = hazeBack > 0.001 && !mono ? mix(c.pal.haze, c.pal.glass, hazeBack) : c.pal.haze;
  const emberCol = mix(hazeCol, c.pal.bloomLight, 0.2);
  const echoCol = mix(hazeCol, c.pal.spark, A.echo.sparkMix);

  const CF = A.chromaFloor, MUD = A.mud;
  const cf = (v: number) => v * chromaK;
  const stops: Stop[] = [
    makeStop(c.pal.void, LD.void * kL, cFrac(CH.void), fl(MF.void), A.mono.hue, cf(CF.void), 1, MUD),
    makeStop(deepCol, LD.deep * kL, cFrac(CH.deep), fl(MF.deep), A.mono.hue, cf(CF.deep), 1, MUD),
    makeStop(midCol, LD.mid * kL, cFrac(CH.mid), fl(MF.mid), A.mono.hue, cf(CF.mid), 1, MUD),
    makeStop(hazeCol, LD.haze * kL, cFrac(CH.haze) * (mono ? A.mono.hazeFrac / CH.haze : 1), fl(MF.haze), A.mono.hue, cf(CF.haze), 0.85, MUD),
    makeStop(emberCol, LD.ember * kL, cFrac(CH.ember), fl(MF.ember), A.mono.hue, cf(CF.ember), 0.5, MUD),
    makeStop(echoCol, LD.haze * 0.9 * kL, cFrac(CH.haze), fl(MF.haze), A.mono.hue, cf(CF.haze), 0.6, MUD),
    makeStop(deepCol, LD.shadow * kL, cFrac(CH.shadow), fl(MF.shadow), A.mono.hue, cf(CF.shadow), 1, MUD),
  ];
  // cool shadows under warm light: the shadow stop is the deep hue leaned toward blue-violet — an analogue of the
  // palette, never its complement (opposite hues mixed through the middle turn to olive)
  {
    const st = stops[S]!;
    const h0 = Math.atan2(st.uy, st.ux);
    const d = angDiff(A.troughs.coolHue * DEG, h0);
    const lim = A.troughs.coolShift * DEG;
    const h1 = h0 + clamp(d, -lim, lim);
    st.ux = Math.cos(h1); st.uy = Math.sin(h1);
  }
  if (spectral) {
    const SF = A.spectral.floor;
    stops[D]!.C = Math.max(stops[D]!.C, SF.deep * chromaK); stops[M]!.C = Math.max(stops[M]!.C, SF.mid * chromaK);
    stops[H]!.C = Math.max(stops[H]!.C, SF.haze * chromaK); stops[E]!.C = Math.max(stops[E]!.C, SF.ember * chromaK);
    stops[X]!.C = Math.max(stops[X]!.C, SF.haze * chromaK); stops[S]!.C = Math.max(stops[S]!.C, SF.deep * chromaK * 0.8);
  }
  const sC = stops.map((s) => s.C), sL = stops.map((s) => s.L);
  // chroma-poor palettes (teals, greens, ice) read dimmer at the same lightness, so their light is given a little more reach
  const hazeRef = Math.max(Math.hypot(rgbToOklab(c.full.haze)[1], rgbToOklab(c.full.haze)[2]) * CH.haze, A.chromaFloor.haze);
  const hazeMul = mono ? 1 : 1 + A.poorBoost * clamp((A.poorChroma - hazeRef) / A.poorChroma, 0, 1);

  // spectral hue wheel LUT (unit vectors in the a-b plane)
  const LUT_N = 64;
  const lutA = new Float32Array(LUT_N), lutB = new Float32Array(LUT_N);
  if (spectral) {
    for (let i = 0; i < LUT_N; i++) {
      const [, a, b] = rgbToOklab(c.pal.walk(i / (LUT_N - 1)));
      const m = Math.hypot(a, b) || 1;
      lutA[i] = a / m; lutB[i] = b / m;
    }
  }
  const rs = c.rng('abyss/spectral');
  const sAng = rs.range(0, TAU);
  const sdx = Math.cos(sAng), sdy = Math.sin(sAng);

  // ── geometry ─────────────────────────────────────────────────
  const NU = 0.5 * (Math.min(w, h) + Math.sqrt(w * h)); // "noise unit" ≈ mean frame size
  const feel = A.feel[c.traits.horizon.index]!;
  const tilt = (A.ifaceTilt[iface] ?? 0) * tiltSign;
  const frame = lay.axis + feel.slant + tilt;
  const fx = Math.cos(frame), fy = Math.sin(frame);
  const span = Math.abs(fx) * w + Math.abs(fy) * h;
  const halfDiag = 0.5 * Math.hypot(w, h);
  const R = lay.R;
  const cx = lay.cx, cy = lay.cy;
  const freq = F.freq * A.cloudScale * freqK * freqMul;
  const warpAmt = F.warpAmp * A.warp * warpMul * warpK;
  const swirl = feel.swirl * warpK * swirlSign * Math.min(1.6, 0.4 + A.warp * 0.6);
  const ct = A.contrast * ctK * (A.glassContrast[glassKind] ?? 1);
  const hueAmp = (mono ? A.mono.hueDrift : F.hueDrift) * (A.glassHue[glassKind] ?? 1) * hueMul * DEG;
  const hueMax = (mono ? A.mono.hueDrift : F.hueMax) * DEG * Math.max(1, hueMul);
  const axK = Math.pow(A.contrast, A.contrastAxis);
  const trK = Math.pow(A.contrast, A.contrastTrough);
  const ember = A.ember;
  const emberK = lerp(ember.at0, 1, g) * Math.sqrt(A.haze);
  const emberR = R * ember.radius * lerp(0.6, 1, lay.bud) * breath;

  // troughs: 2–3 large, soft, darker shapes so the frame has structure, not just one blob
  const rt = c.rng('abyss/troughs');
  const TR = A.troughs;
  const troughs: { x: number; y: number; ix: number; iy: number; s: number; c: number; d: number }[] = [];
  for (let i = 0; i < TR.count; i++) {
    let x = rt.range(0.08, 0.92) * w, y = rt.range(0.08, 0.92) * h;
    const ang = rt.range(0, Math.PI);
    const rx = rt.range(TR.rx[0]!, TR.rx[1]!) * NU, ry = rt.range(TR.ry[0]!, TR.ry[1]!) * NU;
    const depth = rt.range(TR.depth[0]!, TR.depth[1]!) * (A.ifaceTrough[iface] ?? 1);
    // keep the darkness away from the anchor: push outward if too close
    const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy) || 1, min = TR.keepAway * NU;
    if (dist < min) { x = cx + (dx / dist) * min; y = cy + (dy / dist) * min; }
    troughs.push({ x, y, ix: Math.cos(ang) / rx, iy: Math.sin(ang) / rx, s: Math.cos(ang) / ry, c: Math.sin(ang) / ry, d: depth });
  }
  // the echo: a distant second lobe of light along the axis
  const re = c.rng('abyss/echo');
  const EC = A.echo;
  const eAlong = re.range(EC.along[0]!, EC.along[1]!) * R, eAcross = re.range(EC.across[0]!, EC.across[1]!) * R;
  const eRad = re.range(EC.radius[0]!, EC.radius[1]!) * R;
  const eStr = re.range(0.55, 1) * EC.strength;
  const ex = cx + fx * eAlong - fy * eAcross, ey = cy + fy * eAlong + fx * eAcross;

  // ── paint the small buffer ───────────────────────────────────
  // buffer size: fixed by quality (never by the frame's size, so the composition is identical), except that very
  // tiny frames don't need more than ~0.45 px per buffer px and very tall/wide ones are capped in total pixels
  let bw = Math.min(c.quality === 'draft' ? A.res.draft : A.res.full, Math.max(A.res.min, Math.round(w * A.res.perPx)));
  let bh = Math.max(8, Math.round((bw * h) / w));
  if (bw * bh > A.res.maxPix) {
    const sc = Math.sqrt(A.res.maxPix / (bw * bh));
    bw = Math.max(16, Math.round(bw * sc)); bh = Math.max(8, Math.round(bh * sc));
  }
  const frgb = new Float32Array(bw * bh * 3); // the painted buffer, in floats (sRGB 0..255)
  const nzF = c.noise('abyss/fog'), nzC = c.noise('abyss/cloud'), nzW = c.noise('abyss/warp'), nzH = c.noise('abyss/hue'), nzM = c.noise('abyss/mottle');
  const ditherSeed = Math.floor(c.rng('abyss/dither')() * 1e9);
  const DI = A.dither;
  const rgb = [0, 0, 0];
  const wf = F.warpFreq;
  const flowSteps = F.flowSteps, FE = 0.05;
  // per-step advection: total swirl (cells) = warpAmp × sliders × growth, split over the steps, ÷ the potential's slope
  const flowK = (warpAmt / flowSteps) / FE * F.flowGain;
  const RIM = A.rim;
  const nPix = bw * bh;
  const fQ1 = new Float32Array(nPix), fQ2 = new Float32Array(nPix), fHn = new Float32Array(nPix);
  const fM = new Float32Array(nPix);
  const fA = new Float32Array(nPix), fB = new Float32Array(nPix), fS = new Float32Array(nPix), fH = new Float32Array(nPix);

  // pass 1: the fields (expensive noise, once per buffer pixel). Densities are soft tanh curves, never hard steps.
  const sFog = F.softFog * ct, sCld = F.softCloud * ct;
  const bShift = bias * F.coverage;
  for (let j = 0; j < bh; j++) {
    const y = ((j + 0.5) * h) / bh;
    for (let i = 0; i < bw; i++) {
      const x = ((i + 0.5) * w) / bw;
      const rx = x - cx, ry = y - cy;
      const par = rx * fx + ry * fy;
      const per = -rx * fy + ry * fx;

      // noise frame: stretched along / across the axis, swirled for Nadir
      let npar = par, nper = per;
      if (swirl !== 0) {
        const rr = Math.hypot(rx, ry) / (R * 0.95);
        const ang = swirl * Math.exp(-rr * rr);
        const cs = Math.cos(ang), sn = Math.sin(ang);
        npar = par * cs - per * sn; nper = par * sn + per * cs;
      }
      const nx = (npar / (NU * feel.sPar)) * freq + off[0]!;
      const ny = (nper / (NU * feel.sPerp)) * freq + off[1]!;

      // fold-proof domain warp: the coordinates are advected through a smooth curl-noise flow in several small
      // steps (a flow map of a smooth field never folds over itself, so the fog swirls but never creases)
      let wx = nx, wy = ny;
      for (let st = 0; st < flowSteps; st++) {
        const zs = z + st * 1.7, gx0 = wx * wf, gy0 = wy * wf;
        const p0 = nzW.fbm3(gx0, gy0, zs, 2, 2, 0.5);
        const dpx = nzW.fbm3(gx0 + FE, gy0, zs, 2, 2, 0.5) - p0;
        const dpy = nzW.fbm3(gx0, gy0 + FE, zs, 2, 2, 0.5) - p0;
        wx += dpy * flowK; wy -= dpx * flowK;
      }
      const q1 = clamp((wx - nx) * F.shapeFlow, -1, 1), q2 = clamp((wy - ny) * F.shapeFlow, -1, 1);

      // fields
      const fog = nzF.fbm3(wx + off[2]!, wy + off[3]!, z, F.octFog, 2, F.gainFog);
      const cld = nzC.fbm3(wx * 0.62 + off[4]!, wy * 0.62 + off[5]!, z * 1.3 + 4, F.octCloud, 2, F.gainCloud);
      const fil = nzF.n3(wx * F.filamentFreq + off[6]!, wy * F.filamentFreq + off[7]!, z * 0.8 + 2.5);
      const hn = nzH.n3(nx * 0.4 + off[8]!, ny * 0.4 + off[9]!, z * 0.5) * 1.4
        + F.hueCloud * nzH.n3(wx * 0.55 + off[10]!, wy * 0.55 + off[11]!, z * 0.6 + 3) * 1.4;

      const k = j * bw + i;
      fQ1[k] = q1; fQ2[k] = q2; fHn[k] = hn;
      fM[k] = nzM.fbm3(wx * F.mottleFreq + off[10]!, wy * F.mottleFreq + off[11]!, z * 0.9 + 9, 2, 2, 0.5);
      const dA0 = 0.5 + 0.5 * Math.tanh(sFog * (fog + bShift));
      const dB0 = 0.5 + 0.5 * Math.tanh(sCld * cld);
      fA[k] = dA0; fB[k] = dB0;
      fS[k] = Math.exp(-((fil / F.filamentWidth) ** 2));
      fH[k] = RIM.mixA * dA0 + (1 - RIM.mixA) * dB0; // "thickness" of the fog, for the rim light
    }
  }

  // soften: a [1 2 1] blur (twice, separable) so no density edge is ever thinner than a few buffer pixels
  const tmpB = new Float32Array(nPix);
  for (const f of [fA, fB, fS, fH, fM, fHn]) for (let pass = 0; pass < A.res.blur; pass++) blur121(f, tmpB, bw, bh);

  // pass 2: light, colour, compose (needs the neighbours of the height field for the rim light)
  const W = new Float64Array(7);
  const over = (idx: number, a: number) => {
    const keep = 1 - a;
    for (let m = 0; m < 7; m++) W[m] = W[m]! * keep;
    W[idx] = W[idx]! + a;
  };
  const stepX = w / bw, stepY = h / bh;
  for (let j = 0; j < bh; j++) {
    const y = ((j + 0.5) * h) / bh;
    for (let i = 0; i < bw; i++) {
      const x = ((i + 0.5) * w) / bw;
      const rx = x - cx, ry = y - cy;
      const par = rx * fx + ry * fy;
      const per = -rx * fy + ry * fx;
      const k = j * bw + i;
      const q1 = fQ1[k]!, q2 = fQ2[k]!, hn = fHn[k]!, dA = fA[k]!, dB = fB[k]!, silk = fS[k]!;

      // rim light: cloud slopes that face the anchor catch the haze (clouds lit from the horizon)
      const ia = i > 0 ? k - 1 : k, ib = i < bw - 1 ? k + 1 : k, ja = j > 0 ? k - bw : k, jb = j < bh - 1 ? k + bw : k;
      const gx = (fH[ib]! - fH[ia]!) / (((ib - ia) || 1) * stepX);
      const gy = (fH[jb]! - fH[ja]!) / ((((jb - ja) / bw) || 1) * stepY);
      const rl = Math.hypot(rx, ry) || 1;
      // thickness falling toward the light = a slope that faces it
      const lit = 1 - Math.exp(-Math.max(0, -((gx * rx + gy * ry) / rl) * NU * RIM.gain));

      // haze glow, elongated along the axis; asymmetric (long ahead, short behind, blended smoothly); fog-broken
      const gp = par / (R * sizeK) + q1 * GL.shapeWarp;
      const gq = per / (R * sizeK) + q2 * GL.shapeWarp;
      const sf = feel.back + (feel.fwd - feel.back) * (0.5 + 0.5 * Math.tanh(gp / 0.2));
      const d2 = (gp / sf) ** 2 + (gq / feel.perp) ** 2;
      let glow = GL.core * Math.exp(-1.6 * d2) + GL.tail / (1 + 2.4 * d2);
      if (feel.band > 0) {
        // the horizon-line band: broad, dragged about by the fog, thinning toward its ends
        const bp = par / (R * sizeK) + q1 * GL.bandWarp, bq = per / (R * sizeK) + q2 * GL.bandWarp;
        glow += feel.band * Math.exp(-((bp / feel.bandW) ** 2) - (bq / feel.bandLen) ** 2) * (0.35 + 0.65 * dB);
      }
      const fogMod = 1 - GL.fogMod + GL.fogMod * dB;
      const glowC = clamp(glow);

      // the halo's colour turns slowly as it falls away from the light (core → fringe), an analogue shift of a few tens of degrees
      const hp = haloSign * A.haloHue * DEG * smoothstep(0.1, 1.4, Math.sqrt(d2));
      const hcs = Math.cos(hp), hsn = Math.sin(hp);
      // pixel hue: palette hue drifting with the fog; spectral palettes walk the wheel
      let cs: number, sn: number;
      if (spectral) {
        const t = tri(0.5 + A.spectral.span * ((((x - w / 2) * sdx + (y - h / 2) * sdy) / NU) * A.spectral.along + A.spectral.noise * hn) + tl.drift * A.spectral.driftPerDay);
        const u = t * (LUT_N - 1), l0 = Math.min(LUT_N - 2, Math.floor(u)), fr = u - l0;
        cs = lutA[l0]! + (lutA[l0 + 1]! - lutA[l0]!) * fr;
        sn = lutB[l0]! + (lutB[l0 + 1]! - lutB[l0]!) * fr;
      } else {
        // soft-limited so a fold in the fog can never spin the hue right round the wheel
        const th = hueMax * Math.tanh((hn * hueAmp) / hueMax);
        cs = Math.cos(th); sn = Math.sin(th);
      }

      // ── compose by weights: void → deep fog → silk → mid cloud → shadows → haze → echo → ember ──
      // Every layer is a translucent lerp toward its stop; we keep the running weights of the stops and
      // only at the end turn them into a colour. Lightness and chroma mix linearly; hue mixes as a
      // (chroma-biased) circular mean — so navy → coral passes through rose, never through grey mud.
      W[V] = 1 - dA; W[D] = dA; W[M] = 0; W[H] = 0; W[E] = 0; W[X] = 0; W[S] = 0;
      // far from the light the water turns cold: a wash of the shadow hue that grows with distance
      over(S, TR.farTint * smoothstep(TR.farFrom, TR.farTo, Math.sqrt(d2)));
      over(M, F.filament * silk * (0.25 + 0.75 * dA) * (0.4 + 0.6 * glowC));
      over(M, clamp((F.midFar + F.midAmt * Math.pow(glowC, 0.8)) * dB * (0.35 + 0.65 * dA)));

      // troughs (multiplying darkness, tinted toward the spark) and the slow value gradient
      let tr = 0;
      for (let m = 0; m < troughs.length; m++) {
        const T = troughs[m]!;
        const dx = x - T.x, dy = y - T.y;
        const u = dx * T.ix + dy * T.iy, v = -dx * T.s + dy * T.c;
        tr += T.d * Math.exp(-(u * u + v * v));
      }
      tr = 0.8 * (1 - Math.exp((-tr * trK) / 0.8)); // soft saturation, no kink where troughs overlap
      over(S, tr * TR.shadowMix);
      const gr = lay.radial
        ? smoothstep(0.12, 1.0, Math.hypot(rx, ry) / halfDiag)
        : smoothstep(-0.25, 1.0, par / span);
      const dark = (1 - tr) * (1 - A.axisGrad * axK * feel.grad * gr);
      const cKeep = 1 - tr * (1 - TR.chromaKeep);

      // haze: light gathered toward the anchor (painted over the dark, dampened a little by troughs)
      const aBase = A.haze * hazeMul * hazeK * (GL.alpha * glow * fogMod + GL.aura / (1 + 0.6 * d2)) * (1 - 0.35 * tr);
      const aRim = A.haze * hazeK * RIM.amt * lit * (RIM.base + (1 - RIM.base) * glowC) * (0.4 + 0.6 * dB);
      over(H, clamp(1 - (1 - clamp(aBase)) * (1 - clamp(aRim)), 0, 0.97));
      // echo lobe: a distant second light (a whisper of the palette's spark)
      const ed2 = ((x - ex) * (x - ex) + (y - ey) * (y - ey)) / (eRad * eRad);
      over(X, clamp(eStr * hazeK * Math.sqrt(A.haze) * Math.exp(-1.3 * ed2) * (0.5 + 0.5 * dB)));
      // the ember: a small warm heart at the anchor, relatively strongest at the seed
      const er2 = (rx * rx + ry * ry) / (emberR * emberR);
      over(E, clamp(ember.strength * emberK * Math.exp(-1.2 * er2)));

      // stops' hue vectors at this pixel: fog stops rotate with the drift (spectral: they take the wheel's hue)
      let vx = 0, vy = 0, Lm = 0, Cm = 0, Lw = 0;
      for (let m = 0; m < 7; m++) {
        const wm = W[m]!;
        if (wm <= 0) continue;
        const st = stops[m]!;
        let hx = st.ux, hy = st.uy;
        if (m === D || m === M) {
          if (spectral) { hx = cs; hy = sn; } else { hx = st.ux * cs - st.uy * sn; hy = st.ux * sn + st.uy * cs; }
        } else if (spectral && (m === H || m === E)) { hx = cs; hy = sn; }
        else if (m === H && !mono) { hx = st.ux * hcs - st.uy * hsn; hy = st.ux * hsn + st.uy * hcs; }
        else if (spectral && m === S) { hx = -sn; hy = cs; } // shadows sit a quarter-turn round the wheel
        const mw = wm * sC[m]!;
        vx += mw * hx; vy += mw * hy; Lw += wm;
        Lm += wm * sL[m]!; Cm += wm * sC[m]!;
      }
      const vl = Math.hypot(vx, vy) || 1;
      vx /= vl; vy /= vl;
      const L = (Lm * (1 + F.mottle * fM[k]!) + F.mottleAdd * kL * fM[k]!) * dark, a = Cm * cKeep * vx, b = Cm * cKeep * vy;

      labToRgb(L * pulseK, a, b, rgb);
      frgb[k * 3] = rgb[0]!; frgb[k * 3 + 1] = rgb[1]!; frgb[k * 3 + 2] = rgb[2]!;
    }
  }

  // ── upscale in floats (small → mid, bicubic), dither BEFORE rounding, then smooth up to the frame ─────
  // Adding the noise while the values are still fractional is what keeps the slow darks from banding in 8-bit:
  // the local average of the noise carries the sub-level information the eight bits cannot.
  const tw = Math.min(w, Math.round(bw * A.res.midFactor));
  const th = Math.min(h, Math.max(bh, Math.round((tw * h) / w)));
  const mid = resample3(frgb, bw, bh, tw, th);
  const midCv = c.makeCanvas(tw, th);
  const mg = midCv.getContext('2d')!;
  const md = mg.createImageData(tw, th);
  const mdata = md.data;
  const isFinal = tw === w; // no further upscale: this canvas is the final one, so it carries all of the dither
  const dMid = isFinal ? DI.mid + DI.full : DI.mid;
  const lower = isFinal ? 0 : DI.full; // the full-res tile only ever adds light (mean = DI.full), so lower the frame by that first
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const tri = hash2(x, y, ditherSeed + 7) + hash2(x, y, ditherSeed + 13) - 1; // triangular, −1..1
      const o = (y * tw + x) * 4, m = (y * tw + x) * 3;
      const d = tri * dMid - lower;
      mdata[o] = clamp(Math.round(mid[m]! + d), 0, 255) as number;
      mdata[o + 1] = clamp(Math.round(mid[m + 1]! + d), 0, 255) as number;
      mdata[o + 2] = clamp(Math.round(mid[m + 2]! + d), 0, 255) as number;
      mdata[o + 3] = 255;
    }
  }
  mg.putImageData(md, 0, 0);
  const cv = isFinal ? midCv : up(midCv, w, h, c.makeCanvas);

  // ── a whisper of full-res triangular dither on top (the mid-res noise is smeared by the last upscale) ─────
  if (!isFinal && DI.full > 0) {
    const cg = cv.getContext('2d')!;
    const T = 128;
    const tile = c.makeCanvas(T, T);
    const tg = tile.getContext('2d')!;
    const td = tg.createImageData(T, T);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const v = Math.round(DI.full * (hash2(x, y, ditherSeed + 21) + hash2(x, y, ditherSeed + 29)));
        const o = (y * T + x) * 4;
        td.data[o] = v; td.data[o + 1] = v; td.data[o + 2] = v; td.data[o + 3] = 255;
      }
    }
    tg.putImageData(td, 0, 0);
    cg.globalCompositeOperation = 'lighter';
    cg.fillStyle = cg.createPattern(tile, 'repeat')!;
    cg.fillRect(0, 0, w, h);
    cg.globalCompositeOperation = 'source-over';
  }

  return { id: 'abyss', canvas: cv, ...A.compose };
};
