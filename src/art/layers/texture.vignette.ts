// THE VIGNETTE (multiply) — a fall-off that is never a ring.
//
// The centre drifts toward the bloom's anchor, the far side of the light (along the axis) is deeper, each corner has
// its own strength, and the edge wobbles a little, like a lens that is not quite round. The colour it multiplies by
// is the palette's void, lifted to a dark-but-not-black tint — so the corners fall into coloured shade, not grey.
import type { Cv, LayerCtx } from './types.ts';
import { oklchToRgb, rgbToOklch } from '../color.ts';
import { clamp, lerp, smoothstep } from '../math.ts';

export function renderVignette(c: LayerCtx): Cv {
  const V = c.P.layers.texture.vignette;
  const { w, h, lay } = c;
  const k = smoothstep(0, 1, c.tl.t);
  const strength = clamp(V.strength * lerp(V.seedBoost, 1, k), 0, 1);

  // the multiply colour at full strength: void's hue, a dark-but-never-black lightness, chroma scaled by how vivid the palette is
  const hue = rgbToOklch(c.pal.void)[2];
  const vivid = smoothstep(0.004, 0.03, rgbToOklch(c.full.c.void)[1]);
  const edge = greyToLightness(V.edgeLum);
  const rgb = oklchToRgb(edge, V.tint * vivid, hue).map((v) => v / 255);

  const cell = Math.max(3, V.cell * c.S);
  const vw = Math.max(48, Math.round(w / cell)), vh = Math.max(48, Math.round(h / cell));
  const small = c.makeCanvas(vw, vh);
  const g = small.getContext('2d')!;
  const img = g.createImageData(vw, vh);
  const D = img.data;

  const rc = c.rng('texture/vignette');
  const j = V.cornerJitter;
  const f00 = 1 + (rc() - 0.5) * 2 * j, f10 = 1 + (rc() - 0.5) * 2 * j, f01 = 1 + (rc() - 0.5) * 2 * j, f11 = 1 + (rc() - 0.5) * 2 * j;
  const nz = c.noise('texture/vignette');
  const vcx = lerp(w / 2, lay.cx, V.follow), vcy = lerp(h / 2, lay.cy, V.follow);
  const lean = lay.radial ? 0 : V.lean;

  for (let y = 0, i = 0; y < vh; y++) {
    const py = ((y + 0.5) / vh) * h, v = (y + 0.5) / vh;
    for (let x = 0; x < vw; x++, i++) {
      const px = ((x + 0.5) / vw) * w, u = (x + 0.5) / vw;
      const nx = (px - vcx) / (w / 2), ny = (py - vcy) / (h / 2);
      let d = Math.hypot(nx, ny);
      d += lean * (nx * lay.ax + ny * lay.ay);
      d += V.wobble * nz.fbm((u * w) / lay.unit * 1.7, (v * h) / lay.unit * 1.7, 2);
      const t0 = Math.pow(smoothstep(V.start, V.end, d), V.gamma);
      const cf = lerp(lerp(f00, f10, u), lerp(f01, f11, u), v);
      const t = clamp(t0 * cf, 0, 1) * strength;
      const o = i * 4;
      D[o] = 255 * (1 - (1 - rgb[0]!) * t);
      D[o + 1] = 255 * (1 - (1 - rgb[1]!) * t);
      D[o + 2] = 255 * (1 - (1 - rgb[2]!) * t);
      D[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  const cv = c.makeCanvas();
  const G = cv.getContext('2d')!;
  G.imageSmoothingEnabled = true;
  G.imageSmoothingQuality = 'high';
  G.drawImage(small, 0, 0, w, h);
  return cv;
}

/** OKLab lightness of an sRGB grey (0..1) */
function greyToLightness(gr: number): number {
  const lin = gr <= 0.04045 ? gr / 12.92 : Math.pow((gr + 0.055) / 1.055, 2.4);
  return Math.cbrt(lin);
}
