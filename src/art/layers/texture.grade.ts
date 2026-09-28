// THE GRADE (soft-light) — split-toning that follows what is actually there.
//
// A low-res map of the piece's own luminance decides, per cell, how much of the shadow tint (the palette's deep) and
// how much of the highlight tint (its bloomLight) the soft-light source carries. Because the map is blurred, the
// highlight tint spills a little way around every bright thing: a warm, quiet halation. A faint gain in the toe keeps
// the deep water from being dead black (soft-light is multiplicative in the shadows: it lifts 4 → 12, never 0 → 12).
// Near-mono palettes (Blackglass) scale every tint down; the seed is cooler and flatter, and settles with growth.
import type { Cv, LayerCtx } from './types.ts';
import { oklchToRgb, rgbToOklch } from '../color.ts';
import { clamp, lerp, smoothstep } from '../math.ts';
import { boxBlur, paletteVivid, type BelowMap } from './texture.util.ts';

const hueMix = (a: number, b: number, t: number) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
};

/** channel deviations (sRGB 0..1) of a colour from its own mean: a tint that shifts hue without shifting brightness */
function tintVec(L: number, C: number, hue: number): [number, number, number] {
  const c = oklchToRgb(L, C, hue);
  const m = (c[0] + c[1] + c[2]) / 3;
  return [(c[0] - m) / 255, (c[1] - m) / 255, (c[2] - m) / 255];
}

export function renderGrade(c: LayerCtx, map: BelowMap): Cv {
  const T = c.P.layers.texture.grade;
  const { w, h } = c;
  const k = smoothstep(0, 1, c.tl.t);
  const seedK = 1 - k;
  const str = T.strength * lerp(T.seed.strength, 1, k);

  // how colourful is this palette? Blackglass → the floor.
  const vivid = paletteVivid(c);

  // tints: shadows → deep, highlights → bloomLight; the seed rotates both toward a cool blue
  const cool = T.seed.cool * seedK;
  const [, cD, hD] = rgbToOklch(c.pal.deep);
  const [, cB, hB] = rgbToOklch(c.pal.bloomLight);
  const hueS = hueMix(hD, T.seed.coolHue, cool);
  const hueL = hueMix(hB, T.seed.coolHue, cool);
  // the highlight tint keeps a floor of hue even when bloomLight is nearly white
  const chS = lerp(T.shadow.chroma * lerp(0.6, 1, smoothstep(0.01, 0.08, cD)), T.seed.coolChroma, cool) * vivid;
  const chL = lerp(T.light.chroma * lerp(0.45, 1, smoothstep(0.01, 0.07, cB)), T.seed.coolChroma, cool) * vivid;
  const vS = tintVec(T.tintL, chS, hueS).map((v) => v * T.shadow.gain);
  const vL = tintVec(T.tintL, chL, hueL).map((v) => v * T.light.gain);

  // flatter at the seed: more lift in the toe, softer highlights
  const flat = T.seed.flat * seedK;
  const lift = T.lift.amount + T.seed.flatLift * flat;
  const roll = T.seed.flatRoll * flat;

  // the halation map: the luminance of what lies below, blurred a further few cells
  const { mw, mh } = map;
  const Y = Float32Array.from(map.Y);
  boxBlur(Y, mw, mh, Math.max(1, Math.round(T.blur)), 2);

  const small = c.makeCanvas(mw, mh);
  const g = small.getContext('2d')!;
  const img = g.createImageData(mw, mh);
  const D = img.data;
  for (let i = 0; i < mw * mh; i++) {
    const y = Y[i]!;
    const ws = 1 - smoothstep(T.shadow.from, T.shadow.to, y);
    const wh = smoothstep(T.light.from, T.light.to, y);
    const wl = lift * (1 - smoothstep(0, T.lift.end, y));
    const base = str * (wl - roll * wh);
    const o = i * 4;
    for (let ch = 0; ch < 3; ch++) {
      const cs = 0.5 + base + str * (ws * vS[ch]! + wh * vL[ch]!);
      D[o + ch] = 255 * clamp(cs, 0.02, 0.98);
    }
    D[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);

  const cv = c.makeCanvas();
  const G = cv.getContext('2d')!;
  G.imageSmoothingEnabled = true;
  G.imageSmoothingQuality = 'high';
  G.drawImage(small, 0, 0, w, h);
  return cv;
}
