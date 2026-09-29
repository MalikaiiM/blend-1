// Twin Bloom — a second, smaller bloom opens on the far side of the frame, turned to face the first,
// and a fine thread of light arcs between the two hearts.

import type { LayerCtx } from './types.ts';
import { css, mix } from '../color.ts';
import { clamp, smoothstep, TAU } from '../math.ts';
import { drawBloom } from './lumen.ts';
import { blit, bloomRadius, lightOf, linePath, pearl, smallCanvas, type Pt } from './inclusion.util.ts';

/** Pick the far side of the frame: away from the primary, and out of its fan. */
function place(c: LayerCtx, rng: ReturnType<LayerCtx['rng']>, Rt: number): Pt {
  const L = c.lay;
  const { w, h } = c;
  const unit = Math.min(w, h);
  const cands: { p: Pt; bonus: number }[] = [
    { p: [w - L.cx, h - L.cy], bonus: 0.12 },
    ...([[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8], [0.5, 0.17], [0.5, 0.83], [0.17, 0.5], [0.83, 0.5]] as Pt[]).map((p) => ({ p: [p[0] * w, p[1] * h] as Pt, bonus: 0 })),
  ];
  let best = cands[0]!.p, bestScore = -Infinity;
  for (const cd of cands) {
    const dx = cd.p[0] - L.cx, dy = cd.p[1] - L.cy;
    const d = Math.hypot(dx, dy);
    const jitter = rng.range(-0.06, 0.06);
    const inFan = L.radial ? 0 : Math.max(0, (dx * L.ax + dy * L.ay) / (d || 1));
    // a place that would sit on the primary heart is never chosen while a clearer one exists
    const crowd = 3 * Math.max(0, Rt * 1.2 - d) / unit;
    const score = d / unit + cd.bonus - 0.32 * inFan + jitter - crowd;
    if (score > bestScore) { bestScore = score; best = cd.p; }
  }
  // keep the whole small bloom's heart inside the frame
  const m = Rt * 0.42;
  return [clamp(best[0], m, w - m), clamp(best[1], m, h - m)];
}

export function drawTwin(c: LayerCtx, g: CanvasRenderingContext2D, k: number) {
  const P = c.P.layers.inclusion.twin;
  const L = c.lay;
  const S = c.S;
  const rng = c.rng('inclusion/twin');
  const { hot, white } = lightOf(c);

  const Rt = bloomRadius(c) * rng.range(P.scale[0]!, P.scale[1]!) * P.size;
  const [tx, ty] = place(c, rng, Rt);
  const toward = Math.atan2(L.cy - ty, L.cx - tx);
  const axis = L.radial ? rng.range(0, TAU) : toward + rng.range(-0.4, 0.4);
  const rotation = rng.range(0.12, 0.4) * rng.sign();
  const hue = P.hue * rng.sign();
  const bulge = rng.range(P.arc[0]!, P.arc[1]!) * rng.sign();
  const beads = rng.int(P.beads[0]!, P.beads[1]!);
  const beadT: number[] = [];
  for (let i = 0; i < beads; i++) beadT.push(rng.range(0.12, 0.88));

  // it opens a little after the first bloom, like a second sun clearing the water
  const open = smoothstep(0.08, 1, k);
  const inten = P.intensity * smoothstep(0, 0.28, k);
  drawBloom(g, c, { cx: tx, cy: ty, R: Rt, axis, spread: L.radial ? TAU : L.spread, open, intensity: inten, rotation, label: 'twin', hueShift: hue });

  // ── the thread: a shallow arc between the two hearts ──
  const ax = L.cx, ay = L.cy;
  const dx = tx - ax, dy = ty - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist;
  const cxp = (ax + tx) / 2 + nx * dist * bulge, cyp = (ay + ty) / 2 + ny * dist * bulge;
  const reach = smoothstep(0.22, 0.88, k);
  const pts: Pt[] = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * reach;
    const u = 1 - t;
    pts.push([u * u * ax + 2 * u * t * cxp + t * t * tx, u * u * ay + 2 * u * t * cyp + t * t * ty]);
  }
  if (reach > 0.01 && pts.length > 2) {
    const th = mix(hot, white, 0.5);
    const fade = smoothstep(0.15, 0.5, k);
    // glow, on a small canvas
    const sm = smallCanvas(c, 3);
    sm.g.lineCap = 'round';
    sm.g.lineJoin = 'round';
    sm.g.globalCompositeOperation = 'lighter';
    const path = linePath(pts);
    for (let i = 0; i < P.glowPx.length; i++) {
      sm.g.lineWidth = P.glowPx[i]! * S;
      sm.g.strokeStyle = css(hot, clamp(P.glowA[i]! * fade, 0, 1));
      sm.g.stroke(path);
    }
    blit(g, sm.cv, c, 1, 'lighter');
    // the thread: brighter where it leaves each heart, faintest in the middle
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i++) {
      const edge = Math.pow(Math.abs(2 * (i / N) - 1), 1.6);
      const a = (P.threadA * (0.35 + 0.65 * edge)) * fade;
      g.beginPath();
      g.moveTo(pts[i]![0], pts[i]![1]);
      g.lineTo(pts[i + 1]![0], pts[i + 1]![1]);
      g.lineWidth = P.threadPx * S;
      g.strokeStyle = css(th, clamp(a, 0, 1));
      g.stroke();
    }
    // a hair-fine companion, drifting a little to one side, for the sense of a wound filament
    const comp: Pt[] = pts.map((p, i) => {
      const s = i / N;
      const off = Math.sin(s * Math.PI * 3) * 2.2 * S * Math.sin(s * Math.PI);
      return [p[0] + nx * off, p[1] + ny * off];
    });
    g.lineWidth = 0.55 * S;
    g.strokeStyle = css(th, 0.35 * fade);
    g.stroke(linePath(comp));
    g.restore();
    // pearls strung along it (only those the thread has reached)
    for (let i = 0; i < beadT.length; i++) {
      const t = beadT[i]!;
      if (t > reach) continue;
      const u = 1 - t;
      const bx = u * u * ax + 2 * u * t * cxp + t * t * tx, by = u * u * ay + 2 * u * t * cyp + t * t * ty;
      const r = (1.2 + 1.3 * ((i * 0.618) % 1)) * S;
      pearl(g, bx, by, r, hot, white, 0.85 * fade * smoothstep(t, t + 0.1, reach));
    }
  }
}
