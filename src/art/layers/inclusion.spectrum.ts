// Full Spectrum — the rarest thing in the collection. The light has been split: the bloom is recoloured through the
// whole spectrum (a hue field composed with the 'color' blend, so it needs no copy of the picture beneath), rainbow
// arcs (a primary and a reversed, fainter secondary) stand around it, and the bloom and every sheet interface are
// fringed where the glass parts the light. Two canvases: `gc` is the hue field, `g` is the light.

import type { LayerCtx } from './types.ts';
import { css, oklchToRgb, type RGB } from '../color.ts';
import { clamp, lerp, smoothstep, TAU } from '../math.ts';
import { blit, bloomRadius, lean, lightOf, pearl, smallCanvas, type Pt } from './inclusion.util.ts';
import { drawBloom } from './lumen.ts';
import * as Strata from './strata.geom.ts';

const spec = (t: number, h0: number, L = 0.8, C = 0.16): RGB => oklchToRgb(L, C, (h0 + 360 * t) % 360);

/** The sheet interfaces, as pixel polylines — borrowed (defensively) from the strata layer's own geometry. */
function interfaceLines(c: LayerCtx): Pt[][] {
  try {
    const build = (Strata as unknown as { buildStack?: (c: LayerCtx) => any }).buildStack;
    if (typeof build !== 'function') return [];
    const st = build(c);
    const q = { fr: 0, u: 0, a1: 0, a2: 0, x: 0, y: 0, nx: 0, ny: 0 };
    const lines: Pt[][] = [];
    const step = Math.max(1, Math.floor(st.M / 120));
    for (let k = 0; k <= st.N; k++) {
      const pts: Pt[] = [];
      for (let j = 0; j <= st.M; j += step) {
        st.frame.toXY(j / st.M, st.B[k][j], q);
        pts.push([q.x, q.y]);
      }
      lines.push(pts);
    }
    return lines;
  } catch {
    return [];
  }
}

export function drawSpectrum(c: LayerCtx, g: CanvasRenderingContext2D, gc: CanvasRenderingContext2D, k: number) {
  const P = c.P.layers.inclusion.spectrum;
  const L = c.lay;
  const S = c.S;
  const R = bloomRadius(c);
  const rng = c.rng('inclusion/spectrum');
  const { white } = lightOf(c);
  const h0 = rng.range(0, 360);
  const spin = rng.sign();
  const beadN = rng.int(P.beads[0]!, P.beads[1]!);
  const beadA: { a: number; r: number; band: number; s: number }[] = [];
  for (let i = 0; i < 24; i++) beadA.push({ a: rng.range(0, TAU), r: rng.range(0, 1), band: rng() < 0.7 ? 0 : 1, s: rng.range(1.2, 3) });
  const conic = typeof (g as any).createConicGradient === 'function';

  // ── time: the rainbow turns into place as the bloom opens ──
  const arrive = smoothstep(0.06, 0.92, k);
  const fade = smoothstep(0, 0.22, k);
  const turn = (1 - arrive) * 0.42 * spin;

  // 1 · the hue field: by angle round the heart, and rings of hue drifting outward; the 'color' blend keeps the light's
  //     brightness and swaps its hue, so the petals turn through the spectrum while the sea stays deep
  {
    const rr = R * P.recolorR;
    if (conic) {
      const cg = (gc as any).createConicGradient(turn * TAU, L.cx, L.cy) as CanvasGradient;
      const N = 18;
      for (let i = 0; i <= N; i++) cg.addColorStop(i / N, css(spec(i / N, h0, 0.62, 0.22), 1));
      gc.fillStyle = cg;
      gc.fillRect(0, 0, c.w, c.h);
    } else {
      const lg = gc.createLinearGradient(0, 0, c.w, c.h);
      for (let i = 0; i <= 8; i++) lg.addColorStop(i / 8, css(spec(i / 8, h0), 1));
      gc.fillStyle = lg;
      gc.fillRect(0, 0, c.w, c.h);
    }
    const rg = gc.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, rr * 1.6);
    for (let i = 0; i <= 12; i++) rg.addColorStop(i / 12, css(spec((i / 12) * 0.9 + turn, h0 + 90, 0.62, 0.22), P.ringA));
    gc.fillStyle = rg;
    gc.fillRect(0, 0, c.w, c.h);
    // fade the field out with distance from the bloom
    gc.globalCompositeOperation = 'destination-in';
    const m = gc.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, rr * 1.7);
    const A = clamp(arrive * P.recolorMix * P.recolorA, 0, 1);
    m.addColorStop(0, css([255, 255, 255], A));
    m.addColorStop(0.42, css([255, 255, 255], A * 0.85));
    m.addColorStop(0.75, css([255, 255, 255], A * 0.3));
    m.addColorStop(1, css([255, 255, 255], 0));
    gc.fillStyle = m;
    gc.fillRect(0, 0, c.w, c.h);
  }

  // 1b · the bloom, split: the same bloom twice more in light, each turned a hair and shifted in hue — where the copies
  //      agree the light stays white, where they part the edges break into colour (drawn at half size: it is fringe, not detail)
  {
    const sp = smallCanvas(c, 2);
    for (const j of [-1, 1]) {
      drawBloom(sp.g, { ...c, q: Math.min(c.q, 0.4) }, {
        cx: L.cx, cy: L.cy, R: R * (1 + j * P.split.scale * arrive), axis: L.axis, spread: L.radial ? TAU : L.spread,
        open: k, intensity: P.split.intensity * fade, rotation: j * P.split.rot * arrive, label: 'main', hueShift: j * P.split.hue,
      });
    }
    blit(g, sp.cv, c, 1, 'lighter');
  }

  // 2 · a wide dispersion glow: the hue walks the whole wheel round the bloom, strongest where it opens
  {
    const sm = smallCanvas(c, 4);
    const sg = sm.g;
    const rr = R * P.glowR;
    if (conic) {
      const cg = (sg as any).createConicGradient(turn * TAU, L.cx, L.cy) as CanvasGradient;
      const N = 24;
      for (let i = 0; i <= N; i++) cg.addColorStop(i / N, css(spec(i / N, h0, 0.74, 0.17), 1));
      sg.fillStyle = cg;
      sg.fillRect(0, 0, c.w, c.h);
    } else {
      sg.fillStyle = css(spec(0.5, h0), 1);
      sg.fillRect(0, 0, c.w, c.h);
    }
    sg.globalCompositeOperation = 'destination-in';
    const m = sg.createRadialGradient(L.cx, L.cy, rr * 0.15, L.cx, L.cy, rr);
    const NS = 8;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      m.addColorStop(t, css([255, 255, 255], clamp(P.glowA * arrive * Math.exp(-3 * t * t) * (1 - t * t * t) * (i === 0 ? 0.5 : 1), 0, 1)));
    }
    sg.fillStyle = m;
    sg.fillRect(0, 0, c.w, c.h);
    blit(g, sm.cv, c, 1, 'lighter');
  }

  // 3 · the arcs: rainbow bands on a small canvas, shaped by an angular envelope
  {
    const sm = smallCanvas(c, 3);
    const sg = sm.g;
    for (const band of P.bands as { r: number; w: number; a: number; rev: boolean }[]) {
      const r = R * band.r * lerp(0.82, 1, arrive);
      const w = R * band.w;
      const layer = smallCanvas(c, 3);
      const lg = layer.g;
      const rgr = lg.createRadialGradient(L.cx, L.cy, Math.max(1, r - w), L.cx, L.cy, r + w * 0.15);
      const N = 20;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const hue = band.rev ? 1 - t : t;
        // rises softly from the inside, then is cut fairly crisply at the outer edge, like a real bow
        const edge = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.01)), 1.2) * (t > 0.86 ? 1 - (t - 0.86) / 0.14 : 1);
        rgr.addColorStop(t, css(spec(hue * 0.78 + turn, h0, 0.82, 0.17), clamp(band.a * edge * fade * arrive, 0, 1)));
      }
      lg.fillStyle = rgr;
      lg.fillRect(0, 0, c.w, c.h);
      // angular envelope: full where the bloom opens, fading round the back
      lg.globalCompositeOperation = 'destination-in';
      if (conic) {
        const cg = (lg as any).createConicGradient(0, L.cx, L.cy) as CanvasGradient;
        const NS = 36;
        for (let i = 0; i <= NS; i++) cg.addColorStop(i / NS, css([255, 255, 255], clamp(lean(c, (i / NS) * TAU, 0.22), 0, 1)));
        lg.fillStyle = cg;
        lg.fillRect(0, 0, c.w, c.h);
      }
      sg.globalCompositeOperation = 'lighter';
      sg.drawImage(layer.cv, 0, 0, c.w, c.h);
    }
    blit(g, sm.cv, c, 1, 'lighter');

    // supernumerary hairlines inside the primary bow: thin, crisp, colour-stepped
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 0.8 * S;
    const b0 = (P.bands as { r: number; w: number; a: number }[])[0]!;
    const nl = P.lines;
    for (let i = 0; i < nl; i++) {
      const t = i / (nl - 1);
      const r = R * (b0.r - b0.w * (0.06 + 0.7 * t)) * lerp(0.82, 1, arrive);
      const col = spec(t * 0.78 + turn, h0, 0.85, 0.18);
      if (conic) {
        const cg = (g as any).createConicGradient(0, L.cx, L.cy) as CanvasGradient;
        for (let q = 0; q <= 24; q++) cg.addColorStop(q / 24, css(col, clamp(P.lineA * lean(c, (q / 24) * TAU, 0.15) * fade * arrive, 0, 1)));
        g.strokeStyle = cg;
      } else g.strokeStyle = css(col, P.lineA * 0.5 * fade * arrive);
      g.beginPath();
      g.arc(L.cx, L.cy, r, 0, TAU);
      g.stroke();
    }
    g.restore();
  }

  // 4 · every sheet interface breaks the light: three thin lines, one per colour, a hair apart
  {
    const lines = interfaceLines(c);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const off = P.splitPx * S * arrive;
    lines.forEach((pts, li) => {
      const nn = pts.length;
      if (nn < 3) return;
      // visible parts only
      for (let ci = 0; ci < 3; ci++) {
        const col = spec(((li * 0.19 + ci * 0.33) % 1) + turn, h0, 0.84, 0.19);
        const path = new Path2D();
        let pen = false;
        for (let i = 0; i < nn; i++) {
          const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(nn - 1, i + 1)]!;
          const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const x = pts[i]![0] + (-(b[1] - a[1]) / d) * off * (ci - 1), y = pts[i]![1] + ((b[0] - a[0]) / d) * off * (ci - 1);
          if (x < -40 || x > c.w + 40 || y < -40 || y > c.h + 40) { pen = false; continue; }
          if (!pen) { path.moveTo(x, y); pen = true; } else path.lineTo(x, y);
        }
        g.lineWidth = P.splitLinePx * S;
        g.strokeStyle = css(col, clamp(P.splitA * fade * arrive, 0, 1));
        g.stroke(path);
      }
    });
    g.restore();
  }

  // 5 · pearls of split light strung along the bows
  {
    const bands = P.bands as { r: number; w: number; a: number }[];
    for (let i = 0; i < Math.min(beadN, beadA.length); i++) {
      const b = beadA[i]!;
      const band = bands[Math.min(b.band, bands.length - 1)]!;
      const r = R * (band.r - band.w * (0.1 + 0.7 * b.r)) * lerp(0.82, 1, arrive);
      const e = lean(c, b.a, 0.2);
      const col = spec(b.r * 0.78 + turn, h0, 0.88, 0.16);
      pearl(g, L.cx + Math.cos(b.a) * r, L.cy + Math.sin(b.a) * r, b.s * S, col, white, 0.8 * e * fade * arrive);
    }
  }
}
