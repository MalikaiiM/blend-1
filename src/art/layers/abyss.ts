// THE ABYSS — the far, vast, dark water that remembers every light that ever fell into it.
//
// Deepest, largest, darkest, blurriest, least saturated layer. It is painted on a tiny buffer
// (≈100 px wide) from domain-warped, multi-octave 3-D noise (z = the days, so it breathes and
// freezes at the reveal), mapped through OKLab ramps void → deep → mid → haze, then upscaled twice
// with high-quality smoothing so there is not one edge anywhere. A haze of light gathers toward the
// horizon anchor (elongated along the axis) so the whole frame already knows where the light will rise.
//
//   fields    deep fog · mid clouds (only near the haze) · silk filaments · hue drift · 3 dark troughs
//   light     asymmetric haze glow + horizon-line band + ember at the anchor + a distant "echo" lobe
//   growth    near-black with an ember → layered, coloured, swollen depth (c.grow('abyss'))
//   time      only c.tl.drift (noise z, breathing), c.tl.pulse (brightness) and c.tl.bloom (a little more light)
import type { Cv, LayerFn } from './types.ts';
import { mix, oklabToRgbRaw, rgbToOklab, type RGB } from '../color.ts';
import { DEG, TAU, clamp, hash2, lerp, smoothstep } from '../math.ts';

interface Stop { L: number; C: number; ux: number; uy: number }

/** a ramp stop: hue + chroma from a (growth-toned) palette colour, lightness from the abyss ladder */
function makeStop(col: RGB, L: number, frac: number, floor: number | null, monoHue: number): Stop {
  const [, a0, b0] = rgbToOklab(col);
  let C = Math.hypot(a0, b0) * frac;
  let h = Math.atan2(b0, a0);
  if (floor !== null && C < floor) { C = floor; h = monoHue * DEG; }
  return { L, C, ux: Math.cos(h), uy: Math.sin(h) };
}

/** OKLab → sRGB 0..255, pulling chroma in (keeping L and hue) when the colour is outside the gamut */
function labToRgb(L: number, a: number, b: number, out: number[]): void {
  let c = oklabToRgbRaw(L, a, b);
  if (c[0]! < -0.5 || c[1]! < -0.5 || c[2]! < -0.5 || c[0]! > 255.5 || c[1]! > 255.5 || c[2]! > 255.5) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 7; i++) {
      const m = (lo + hi) / 2;
      const t = oklabToRgbRaw(L, a * m, b * m);
      if (t[0]! < -0.5 || t[1]! < -0.5 || t[2]! < -0.5 || t[0]! > 255.5 || t[1]! > 255.5 || t[2]! > 255.5) hi = m; else lo = m;
    }
    c = oklabToRgbRaw(L, a * lo, b * lo);
  }
  out[0] = c[0]!; out[1] = c[1]!; out[2] = c[2]!;
}

const tri = (t: number) => 1 - Math.abs(1 - (((t % 2) + 2) % 2));
const sstep = (v: number) => v * v * (3 - 2 * v);

/** smooth upscale of `src` to dw×dh */
function up(src: Cv, dw: number, dh: number, mk: (w: number, h: number) => Cv): Cv {
  const cv = mk(dw, dh);
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, dw, dh);
  return cv;
}

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
  const sizeK = lerp(G.hazeSizeAt0, 1, g) * breath;
  const pulseK = 1 + c.P.clock.pulseAmp * tl.pulse;
  const z = tl.drift * F.driftPerDay;

  // ── which kind of palette / body ─────────────────────────────
  const spectral = c.full.spectral;
  const gChroma = Math.hypot(rgbToOklab(c.full.c.glass)[1], rgbToOklab(c.full.c.glass)[2]);
  const mono = !spectral && gChroma < A.mono.below;
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
  const off: number[] = [];
  for (let i = 0; i < 12; i++) off.push(rc.range(-30, 30));

  // ── colour stops (hue + chroma of the toned palette, lightness of the ladder) ─
  const LD = A.ladder, CH = A.chroma;
  const cFrac = (v: number) => v * chromaK * (glassKind === 'stained' ? 1.08 : 1);
  const emberCol = mix(c.pal.haze, c.pal.bloomLight, 0.2);
  const sV = makeStop(c.pal.void, LD.void * kL, cFrac(CH.void), fl(MF.void), A.mono.hue);
  const sD = makeStop(c.pal.deep, LD.deep * kL, cFrac(CH.deep), fl(MF.deep), A.mono.hue);
  const sM = makeStop(c.pal.mid, LD.mid * kL, cFrac(CH.mid), fl(MF.mid), A.mono.hue);
  const sH = makeStop(c.pal.haze, LD.haze * kL, cFrac(CH.haze) * (mono ? A.mono.hazeFrac / CH.haze : 1), fl(MF.haze), A.mono.hue);
  const sE = makeStop(emberCol, LD.ember * kL, cFrac(CH.ember), fl(MF.ember), A.mono.hue);
  const echoCol = mix(c.pal.haze, c.pal.spark, A.echo.sparkMix);
  const sX = makeStop(echoCol, LD.haze * 0.9 * kL, cFrac(CH.haze), fl(MF.haze), A.mono.hue);
  if (spectral) {
    const SF = A.spectral.floor;
    sD.C = Math.max(sD.C, SF.deep * chromaK); sM.C = Math.max(sM.C, SF.mid * chromaK);
    sH.C = Math.max(sH.C, SF.haze * chromaK); sE.C = Math.max(sE.C, SF.ember * chromaK); sX.C = Math.max(sX.C, SF.haze * chromaK);
  }

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
  const bw = c.quality === 'draft' ? A.res.draft : A.res.full;
  const bh = Math.max(8, Math.round((bw * h) / w));
  const small = c.makeCanvas(bw, bh);
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(bw, bh);
  const px = img.data;
  const nzF = c.noise('abyss/fog'), nzC = c.noise('abyss/cloud'), nzW = c.noise('abyss/warp'), nzH = c.noise('abyss/hue');
  const ditherSeed = Math.floor(c.rng('abyss/dither')() * 1e9);
  const dAmp = A.dither;
  const rgb = [0, 0, 0];
  const wf = F.warpFreq;
  const RIM = A.rim;
  const nPix = bw * bh;
  const fQ1 = new Float32Array(nPix), fQ2 = new Float32Array(nPix), fHn = new Float32Array(nPix);
  const fA = new Float32Array(nPix), fB = new Float32Array(nPix), fS = new Float32Array(nPix), fH = new Float32Array(nPix);

  // pass 1: the fields (expensive noise, once per buffer pixel)
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

      // domain warp
      const q1 = nzW.fbm3(nx * wf, ny * wf, z, 2, 2, 0.5);
      const q2 = nzW.fbm3(nx * wf + 5.2, ny * wf + 1.3, z + 7.1, 2, 2, 0.5);
      // second level: warp the warp, so the fog folds like ink in water
      const r1 = nzW.fbm3(nx * wf * 1.7 + 1.7 + q1 * 1.6, ny * wf * 1.7 + 9.2 + q2 * 1.6, z * 1.2 + 3.3, 2, 2, 0.5);
      const r2 = nzW.fbm3(nx * wf * 1.7 + 8.3 + q1 * 1.6, ny * wf * 1.7 + 2.8 + q2 * 1.6, z * 1.2 + 6.1, 2, 2, 0.5);
      const wx = nx + (q1 + F.warp2 * r1) * warpAmt, wy = ny + (q2 + F.warp2 * r2) * warpAmt;

      // fields
      const fog = nzF.fbm3(wx + off[2]!, wy + off[3]!, z, F.octFog, 2, F.gainFog);
      const cld = nzC.fbm3(wx * 0.62 + off[4]!, wy * 0.62 + off[5]!, z * 1.3 + 4, F.octCloud, 2, F.gainCloud);
      const fil = nzF.n3(wx * F.filamentFreq + off[6]!, wy * F.filamentFreq + off[7]!, z * 0.8 + 2.5);
      const hn = nzH.n3(nx * 0.35 + off[8]!, ny * 0.35 + off[9]!, z * 0.5) * 1.4;

      const k = j * bw + i;
      fQ1[k] = q1; fQ2[k] = q2; fHn[k] = hn;
      const dA0 = sstep(clamp(0.5 + (fog * F.gain + bias) * ct));
      const dB0 = sstep(clamp(0.5 + cld * F.gain * ct));
      fA[k] = dA0; fB[k] = dB0;
      fS[k] = Math.exp(-((fil / F.filamentWidth) ** 2));
      fH[k] = RIM.mixA * dA0 + (1 - RIM.mixA) * dB0; // "thickness" of the fog, for the rim light
    }
  }

  // pass 2: light, colour, compose (needs the neighbours of the height field for the rim light)
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
      const stepX = w / bw, stepY = h / bh;
      const gx = (fH[ib]! - fH[ia]!) / (((ib - ia) || 1) * stepX);
      const gy = (fH[jb]! - fH[ja]!) / ((((jb - ja) / bw) || 1) * stepY);
      const rl = Math.hypot(rx, ry) || 1;
      // thickness falling toward the light = a slope that faces it
      const lit = clamp(-((gx * rx + gy * ry) / rl) * NU * RIM.gain);

      // haze glow, elongated along the axis; asymmetric (long ahead, short behind); fog-broken
      const gp = par / (R * sizeK) + q1 * GL.shapeWarp;
      const gq = per / (R * sizeK) + q2 * GL.shapeWarp;
      const sf = gp >= 0 ? feel.fwd : feel.back;
      const d2 = (gp / sf) ** 2 + (gq / feel.perp) ** 2;
      let glow = GL.core * Math.exp(-1.6 * d2) + GL.tail / (1 + 2.4 * d2);
      if (feel.band > 0) glow += feel.band * Math.exp(-((gp / feel.bandW) ** 2) - (gq / feel.bandLen) ** 2);
      const fogMod = 1 - GL.fogMod + GL.fogMod * dB;
      const glowC = clamp(glow);

      // pixel hue: palette hue drifting with the fog; spectral palettes walk the wheel
      let cs: number, sn: number;
      if (spectral) {
        const t = tri(0.5 + A.spectral.span * ((((x - w / 2) * sdx + (y - h / 2) * sdy) / NU) * A.spectral.along + A.spectral.noise * hn) + tl.drift * A.spectral.driftPerDay);
        const u = t * (LUT_N - 1), l0 = Math.min(LUT_N - 2, Math.floor(u)), fr = u - l0;
        cs = lutA[l0]! + (lutA[l0 + 1]! - lutA[l0]!) * fr;
        sn = lutB[l0]! + (lutB[l0 + 1]! - lutB[l0]!) * fr;
      } else {
        const th = hn * hueAmp;
        cs = Math.cos(th); sn = Math.sin(th);
      }
      // ── compose by weights: void → deep fog → silk → mid cloud → (troughs) → haze → echo → ember ──
      // Every layer is a translucent lerp toward its stop; we keep the running weights of the six stops and
      // only at the end turn them into a colour. Lightness and chroma mix linearly; hue mixes as a
      // (chroma-biased) circular mean — so navy → coral passes through rose, never through grey mud.
      let w0 = 1, w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0; // void deep mid haze ember echo
      w0 = 1 - dA; w1 = dA;
      const aSilk = F.filament * silk * (0.25 + 0.75 * dA) * (0.4 + 0.6 * glowC);
      w0 *= 1 - aSilk; w1 *= 1 - aSilk; w2 = aSilk;
      const aMid = clamp((F.midFar + F.midAmt * Math.pow(glowC, 0.8)) * dB * (0.35 + 0.65 * dA));
      w0 *= 1 - aMid; w1 *= 1 - aMid; w2 = w2 * (1 - aMid) + aMid;

      // troughs (multiplying darkness with a little chroma kept) and the slow value gradient
      let tr = 0;
      for (let m = 0; m < troughs.length; m++) {
        const T = troughs[m]!;
        const dx = x - T.x, dy = y - T.y;
        const u = dx * T.ix + dy * T.iy, v = -dx * T.s + dy * T.c;
        tr += T.d * Math.exp(-(u * u + v * v));
      }
      tr = Math.min(0.8, tr);
      const gr = lay.radial
        ? smoothstep(0.12, 1.0, Math.hypot(rx, ry) / halfDiag)
        : smoothstep(-0.25, 1.0, par / span);
      const dark = (1 - tr) * (1 - A.axisGrad * feel.grad * gr);
      const cKeep = 1 - tr * (1 - TR.chromaKeep);

      // haze: light gathered toward the anchor (painted over the dark, dampened a little by troughs)
      const aBase = A.haze * hazeK * GL.alpha * glow * fogMod * (1 - 0.35 * tr);
      const aRim = A.haze * hazeK * RIM.amt * lit * (RIM.base + (1 - RIM.base) * glowC) * (0.4 + 0.6 * dB);
      const aH = clamp(1 - (1 - clamp(aBase)) * (1 - clamp(aRim)), 0, 0.97);
      w0 *= 1 - aH; w1 *= 1 - aH; w2 *= 1 - aH; w3 = aH;
      // echo lobe: a distant second light (a whisper of the palette's spark)
      const ed2 = ((x - ex) * (x - ex) + (y - ey) * (y - ey)) / (eRad * eRad);
      const aX = clamp(eStr * hazeK * Math.sqrt(A.haze) * Math.exp(-1.3 * ed2) * (0.5 + 0.5 * dB));
      w0 *= 1 - aX; w1 *= 1 - aX; w2 *= 1 - aX; w3 *= 1 - aX; w5 = aX;
      // the ember: a small warm heart at the anchor, relatively strongest at the seed
      const er2 = (rx * rx + ry * ry) / (emberR * emberR);
      const aE = clamp(ember.strength * emberK * Math.exp(-1.2 * er2));
      w0 *= 1 - aE; w1 *= 1 - aE; w2 *= 1 - aE; w3 *= 1 - aE; w5 *= 1 - aE; w4 = aE;

      // stops' hue vectors at this pixel: fog stops rotate with the drift (spectral: they take the wheel's hue)
      const rc1 = spectral ? cs : sD.ux * cs - sD.uy * sn, rs1 = spectral ? sn : sD.ux * sn + sD.uy * cs;
      const rc2 = spectral ? cs : sM.ux * cs - sM.uy * sn, rs2 = spectral ? sn : sM.ux * sn + sM.uy * cs;
      const kap = 0.02;
      const m0 = w0 * (sV.C + kap), m1 = w1 * (sD.C + kap), m2 = w2 * (sM.C + kap), m3 = w3 * (sH.C + kap), m4 = w4 * (sE.C + kap), m5 = w5 * (sX.C + kap);
      const hxa = spectral ? cs : sH.ux, hya = spectral ? sn : sH.uy;
      const exa = spectral ? cs : sE.ux, eya = spectral ? sn : sE.uy;
      let vx = m0 * sV.ux + m1 * rc1 + m2 * rc2 + m3 * hxa + m4 * exa + m5 * sX.ux;
      let vy = m0 * sV.uy + m1 * rs1 + m2 * rs2 + m3 * hya + m4 * eya + m5 * sX.uy;
      const vl = Math.hypot(vx, vy) || 1;
      vx /= vl; vy /= vl;
      const Lm = w0 * sV.L + w1 * sD.L + w2 * sM.L + w3 * sH.L + w4 * sE.L + w5 * sX.L;
      const Cm = w0 * sV.C + w1 * sD.C + w2 * sM.C + w3 * sH.C + w4 * sE.C + w5 * sX.C;
      const L = Lm * dark, a = Cm * cKeep * vx, b = Cm * cKeep * vy;

      labToRgb(L * pulseK, a, b, rgb);
      // stochastic rounding: the small buffer stays unbiased; minus the mean of the full-res dither tile
      const o = (j * bw + i) * 4;
      const n = hash2(i, j, ditherSeed) - 0.5;
      px[o] = clamp(Math.round(rgb[0]! - dAmp + n), 0, 255) as number;
      px[o + 1] = clamp(Math.round(rgb[1]! - dAmp + n), 0, 255) as number;
      px[o + 2] = clamp(Math.round(rgb[2]! - dAmp + n), 0, 255) as number;
      px[o + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);

  // ── upscale twice (small → mid → full): perfectly smooth, no blockiness ─────
  const mw = Math.round(bw * A.res.midFactor);
  let src: Cv = small;
  if (mw < w) src = up(small, mw, Math.round((mw * h) / w), c.makeCanvas);
  const cv = up(src, w, h, c.makeCanvas);
  const cg = cv.getContext('2d')!;

  // ── full-res triangular dither: the darks would otherwise band in 8-bit ─────
  if (dAmp > 0) {
    const T = 128;
    const tile = c.makeCanvas(T, T);
    const tg = tile.getContext('2d')!;
    const td = tg.createImageData(T, T);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const v = Math.round(dAmp * (hash2(x, y, ditherSeed + 7) + hash2(x, y, ditherSeed + 13)));
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
