// The Inclusion · shared drawing helpers. Pure functions over a 2D context; no hidden state, no randomness.

import type { LayerCtx } from './types.ts';
import { css, hex, mix, type RGB } from '../color.ts';
import { clamp, lerp, smoothstep } from '../math.ts';

export type Pt = [number, number];

/** A canvas at 1/div resolution whose context is pre-scaled, so callers keep drawing in full-size pixel coordinates. */
export function smallCanvas(c: LayerCtx, div: number) {
  const w = Math.max(2, Math.round(c.w / div)), h = Math.max(2, Math.round(c.h / div));
  const cv = c.makeCanvas(w, h);
  const g = cv.getContext('2d')!;
  g.scale(w / c.w, h / c.h);
  return { cv, g };
}

/** Draw a (usually smaller) canvas over the whole frame — the cheap way to get a soft blur. */
export function blit(dst: CanvasRenderingContext2D, src: HTMLCanvasElement, c: LayerCtx, a = 1, op: GlobalCompositeOperation = 'source-over') {
  dst.save();
  dst.imageSmoothingEnabled = true;
  dst.imageSmoothingQuality = 'high';
  dst.globalAlpha = clamp(a, 0, 1);
  dst.globalCompositeOperation = op;
  dst.drawImage(src, 0, 0, c.w, c.h);
  dst.restore();
}

/** The bloom's opening, half-eased exactly like the lumen so an inclusion and the bloom move together. */
export function bloomOpen(c: LayerCtx): number {
  const b = c.tl.bloom;
  return lerp(b, smoothstep(0, 1, b), 0.5);
}

/** Radius of the primary bloom in px (the lumen's own size knob included). */
export const bloomRadius = (c: LayerCtx) => c.lay.R * c.P.layers.lumen.size;

/** A soft, gaussian-ish falloff disc. */
export function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: RGB, a: number, tight = 3.4) {
  if (a <= 0.002 || r <= 0.5) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    gr.addColorStop(t, css(col, clamp(a * Math.exp(-tight * t * t) * (1 - t * t * t), 0, 1)));
  }
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A pearl of light: hot white centre, coloured skirt, wide faint halo. */
export function pearl(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: RGB, white: RGB, a: number) {
  if (a <= 0.003) return;
  glow(g, x, y, r * 5.5, col, a * 0.28, 3.0);
  glow(g, x, y, r * 2.2, col, a * 0.55, 2.6);
  glow(g, x, y, r, white, a, 2.0);
}

/** Polyline through the points, rounded by quadratic curves through the midpoints. */
export function smoothPath(pts: Pt[], into?: Path2D): Path2D {
  const p = into ?? new Path2D();
  if (pts.length < 2) return p;
  p.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  const l = pts[pts.length - 1]!;
  p.lineTo(l[0], l[1]);
  return p;
}
export function linePath(pts: Pt[], into?: Path2D): Path2D {
  const p = into ?? new Path2D();
  if (pts.length < 1) return p;
  p.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i]![0], pts[i]![1]);
  return p;
}

/** Stroke a path several times, wide + faint to narrow + strong: a soft glow with a bright core, no blur filter. */
export function strokeGlow(
  g: CanvasRenderingContext2D, path: Path2D, col: RGB, core: RGB,
  widths: number[], alphas: number[], coreW: number, coreA: number,
) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i < widths.length; i++) {
    g.lineWidth = widths[i]!;
    g.strokeStyle = css(col, clamp(alphas[i]!, 0, 1));
    g.stroke(path);
  }
  g.lineWidth = coreW;
  g.strokeStyle = css(core, clamp(coreA, 0, 1));
  g.stroke(path);
}

/** Total length of a polyline and cumulative lengths. */
export function cumulative(pts: Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return out;
}

/** The part of a polyline from arc length 0 to `len`, interpolated at the end. */
export function headOf(pts: Pt[], cum: number[], len: number): Pt[] {
  if (len >= cum[cum.length - 1]!) return pts;
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    if (cum[i]! <= len) out.push(pts[i]!);
    else {
      const t = (len - cum[i - 1]!) / Math.max(1e-6, cum[i]! - cum[i - 1]!);
      out.push([pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * t, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * t]);
      break;
    }
  }
  return out;
}

/** The colour of the piece's light, kept from going grey. */
export function lightOf(c: LayerCtx): { hot: RGB; white: RGB; light: RGB } {
  const hot = c.pal.bloomLight;
  const grey = 255 * Math.pow(c.tone.dim, 0.85);
  return { hot, light: c.pal.light, white: mix(hot, [grey, grey, grey], 0.82) };
}

export const GOLD = hex('#ffd27a');

/** Is this the near-monochrome palette (one hot accent)? */
export const isMono = (c: LayerCtx) => c.full.id === 'blackglass';

/** Angular envelope: 1 in the direction of `axis`, falling to `floor` opposite (radial bloom: flat). */
export function lean(c: LayerCtx, ang: number, floor = 0.3): number {
  if (c.lay.radial) return 1;
  const d = Math.cos(ang - c.lay.axis);
  return floor + (1 - floor) * (0.5 + 0.5 * d);
}

