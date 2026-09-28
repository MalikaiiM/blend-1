// Colour in OKLab/OKLCH. Palettes are authored in sRGB hex, but all mixing,
// dimming and tinting happens in OKLab so gradients stay clean and rich.

import { clamp } from './math.ts';

export type RGB = [number, number, number]; // 0..255 (float allowed)

export function hex(h: string): RGB {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.replace(/./g, (c) => c + c) : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const toHex = (c: RGB) =>
  '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

export function css(c: RGB, a = 1): string {
  const r = Math.round(clamp(c[0], 0, 255));
  const g = Math.round(clamp(c[1], 0, 255));
  const b = Math.round(clamp(c[2], 0, 255));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${+a.toFixed(4)})`;
}

const toLin = (v: number) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const toSrgb = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export type Lab = [number, number, number];
export type LCH = [number, number, number]; // L 0..1, C ~0..0.4, h degrees

export function rgbToOklab(c: RGB): Lab {
  const r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** Returns linear-ish sRGB 0..255 possibly out of gamut (not clamped). */
export function oklabToRgbRaw(L: number, a: number, b: number): RGB {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const inGamut = (c: RGB) => c[0] >= -0.5 && c[0] <= 255.5 && c[1] >= -0.5 && c[1] <= 255.5 && c[2] >= -0.5 && c[2] <= 255.5;

export function rgbToOklch(c: RGB): LCH {
  const [L, a, b] = rgbToOklab(c);
  const C = Math.hypot(a, b);
  return [L, C, C < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
/** OKLCH → sRGB with chroma-reduction gamut mapping (keeps hue and lightness). */
export function oklchToRgb(L: number, C: number, h: number): RGB {
  L = clamp(L, 0, 1);
  const hr = (h * Math.PI) / 180;
  let c = oklabToRgbRaw(L, C * Math.cos(hr), C * Math.sin(hr));
  if (inGamut(c)) return c.map((v) => clamp(v, 0, 255)) as RGB;
  let lo = 0, hi = C;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const t = oklabToRgbRaw(L, mid * Math.cos(hr), mid * Math.sin(hr));
    if (inGamut(t)) lo = mid; else hi = mid;
  }
  c = oklabToRgbRaw(L, lo * Math.cos(hr), lo * Math.sin(hr));
  return c.map((v) => clamp(v, 0, 255)) as RGB;
}

/** Perceptual mix in OKLab. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const A = rgbToOklab(a), B = rgbToOklab(b);
  return oklchFromLab(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function oklchFromLab(L: number, a: number, b: number): RGB {
  const c = oklabToRgbRaw(L, a, b);
  if (inGamut(c)) return c.map((v) => clamp(v, 0, 255)) as RGB;
  const C = Math.hypot(a, b), h = (Math.atan2(b, a) * 180) / Math.PI;
  return oklchToRgb(L, C, h);
}

export interface Adjust {
  /** multipliers */ l?: number; c?: number;
  /** offsets */ dl?: number; dc?: number; dh?: number;
}
export function adjust(col: RGB, o: Adjust): RGB {
  const [L, C, h] = rgbToOklch(col);
  return oklchToRgb(L * (o.l ?? 1) + (o.dl ?? 0), C * (o.c ?? 1) + (o.dc ?? 0), h + (o.dh ?? 0));
}
/** Relative luminance-ish (OKLab L). */
export const lightness = (c: RGB) => rgbToOklab(c)[0];

/** Multi-stop OKLab gradient sampler: t in [0,1]. */
export function ramp(stops: RGB[]): (t: number) => RGB {
  return (t) => {
    const x = clamp(t) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    return mix(stops[i]!, stops[i + 1]!, x - i);
  };
}
