// Comet — one bright streak crossing the frame ahead of the bloom: a tiny hot head, a broad dust tail that
// flares as it fades, a thin ion tail, and sparks shed along the way. It arrives during the bloom's day and stops.

import type { LayerCtx } from './types.ts';
import { css, mix, type RGB } from '../color.ts';
import { clamp, lerp, smoothstep } from '../math.ts';
import { blit, bloomRadius, glow, isMono, lightOf, smallCanvas, type Pt } from './inclusion.util.ts';

export function drawComet(c: LayerCtx, g: CanvasRenderingContext2D, k: number) {
  const P = c.P.layers.inclusion.comet;
  const L = c.lay;
  const S = c.S;
  const R = bloomRadius(c);
  const rng = c.rng('inclusion/comet');
  const rs = c.rng('inclusion/comet/sparks');
  const nz = c.noise('inclusion/comet');
  const { hot, white } = lightOf(c);
  const mono = isMono(c);
  const unit = Math.min(c.w, c.h);

  // ── the path: a diagonal through a point in front of the bloom ──
  const u = rng.range(P.ahead[0]!, P.ahead[1]!) * R;
  const v = rng.range(P.across[0]!, P.across[1]!) * R;
  const ang0 = rng.range(P.angleDeg[0]!, P.angleDeg[1]!) * (Math.PI / 180) * rng.sign() + (rng() < 0.5 ? 0 : Math.PI);
  const slide = rng.range(-0.14, 0.14) * unit;
  // the head sits ahead of the bloom; the heading is flipped, if need be, so the tail trails back across the frame
  const m = unit * 0.1;
  const hx1 = clamp(L.cx + L.ax * u - L.ay * v + Math.cos(ang0) * slide, m, c.w - m);
  const hy1 = clamp(L.cy + L.ay * u + L.ax * v + Math.sin(ang0) * slide, m, c.h - m);
  const toMid = (c.w / 2 - hx1) * Math.cos(ang0) + (c.h / 2 - hy1) * Math.sin(ang0);
  const ang = toMid > 0 ? ang0 + Math.PI : ang0; // the tail (−heading) should point toward the middle of the frame
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const tail = unit * rng.range(P.tail[0]!, P.tail[1]!);
  const bend = rng.range(-P.bend, P.bend) * tail;
  const dustCol = mono ? mix(white, c.pal.glass, 0.25) : mix(hot, c.pal.glass, P.dustMix);
  const ionCol = mono ? mix(white, c.pal.glass, 0.5) : mix(c.pal.glass, white, 0.22);
  const seedN = rng.range(0, 100);
  const sparkCol: RGB = c.pal.spark;

  // ── time: it flies in and slows to rest ──
  const fade = smoothstep(0, 0.16, k);
  const fly = 1 - Math.pow(1 - smoothstep(0.02, 0.95, k), 2.6);
  const travel = (1 - fly) * unit * P.travel;
  const hx = hx1 - dx * travel, hy = hy1 - dy * travel;
  const grow = lerp(0.35, 1, fly);
  const L1 = tail * grow;

  // the tail follows a shallow curve behind the head
  const at = (s: number, lift = 0): Pt => {
    const t = s / Math.max(1, L1);
    return [hx - dx * s + nx * (bend * t * t + lift), hy - dy * s + ny * (bend * t * t + lift)];
  };

  // 1 · dust tail — a fan of soft fibres on a small canvas
  {
    const sm = smallCanvas(c, 3);
    const sg = sm.g;
    sg.globalCompositeOperation = 'lighter';
    // broad body
    const N = 48;
    const w0 = P.dustW[0]! * S, w1 = P.dustW[1]! * S * grow;
    const left: Pt[] = [], right: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const s = t * L1;
      const hw = lerp(w0, w1, Math.pow(t, 0.75)) * (0.78 + 0.34 * nz.n2(t * 3 + seedN, 1.7));
      left.push(at(s, hw)); right.push(at(s, -hw));
    }
    sg.beginPath();
    sg.moveTo(left[0]![0], left[0]![1]);
    for (const p of left) sg.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) sg.lineTo(right[i]![0], right[i]![1]);
    sg.closePath();
    const h0 = at(0), h1 = at(L1);
    const lg = sg.createLinearGradient(h0[0], h0[1], h1[0], h1[1]);
    const dust = P.dustA * fade;
    const far = c.full.spectral ? c.pal.walk(0.85) : mix(c.pal.mid, c.pal.glass, 0.35);
    const midc = c.full.spectral ? c.pal.walk(0.45) : mix(dustCol, c.pal.glass, 0.5);
    lg.addColorStop(0, css(mix(dustCol, white, 0.35), dust));
    lg.addColorStop(0.16, css(dustCol, dust * 0.7));
    lg.addColorStop(0.55, css(midc, dust * 0.3));
    lg.addColorStop(1, css(far, 0));
    sg.fillStyle = lg;
    sg.fill();
    // fibres: thin strands fanning inside the tail
    const NF = Math.ceil(P.fibres * (c.q < 1 ? 0.7 : 1));
    for (let f = 0; f < P.fibres; f++) {
      const off = rng.range(-1, 1);
      const len = rng.range(0.35, 1) * L1;
      const al = rng.range(0.25, 1);
      const wob = rng.range(-0.3, 0.3);
      const fw = rng.range(0.6, 1.8) * S;
      if (f >= NF) continue;
      const pts: Pt[] = [];
      for (let i = 0; i <= 26; i++) {
        const t = (i / 26) * (len / L1);
        const s = t * L1;
        const hw = lerp(w0, w1, Math.pow(t, 0.75));
        pts.push(at(s, off * hw * (0.6 + wob * t)));
      }
      const a0 = pts[0]!, a1 = pts[pts.length - 1]!;
      const fg = sg.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
      fg.addColorStop(0, css(mix(dustCol, white, 0.4), 0.42 * al * fade));
      fg.addColorStop(1, css(dustCol, 0));
      sg.strokeStyle = fg;
      sg.lineWidth = fw;
      sg.beginPath();
      sg.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length; i++) sg.lineTo(pts[i]![0], pts[i]![1]);
      sg.stroke();
    }
    blit(g, sm.cv, c, 1, 'lighter');
  }

  // 2 · ion tail — thin, bright, straighter and longer
  {
    const N = 40;
    const len = L1 * P.ionLen;
    const pts: Pt[] = [];
    for (let i = 0; i <= N; i++) pts.push(at((i / N) * len, Math.sin((i / N) * 5 + seedN) * 1.2 * S * (i / N)));
    const a0 = pts[0]!, a1 = pts[N]!;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const [wk, ak] of [[9, 0.09], [3.4, 0.22], [1, 0.9]] as const) {
      const lg = g.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
      lg.addColorStop(0, css(mix(ionCol, white, 0.5), P.ionA * ak * fade));
      lg.addColorStop(0.35, css(ionCol, P.ionA * ak * fade * 0.55));
      lg.addColorStop(1, css(ionCol, 0));
      g.strokeStyle = lg;
      g.lineWidth = P.ionPx * S * wk;
      g.beginPath();
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
      g.stroke();
    }
    g.restore();
  }

  // 3 · sparks shed along the tail
  {
    const n = P.sparks;
    const nDraw = Math.ceil(n * c.q);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const t = Math.pow(rs(), P.sparkBias);
      const lat = rs.gauss();
      const size = rs.range(0.8, 2.5) * S;
      const kind = rs();
      const tw = rs();
      if (i >= nDraw) continue;
      const hw = lerp(P.dustW[0]!, P.dustW[1]!, Math.pow(t, 0.75)) * S * grow;
      const p = at(t * L1, lat * hw * 0.7);
      const a = (1 - t) ** 1.2 * (0.35 + 0.65 * tw) * fade;
      if (a < 0.02) continue;
      const col = kind < P.sparkAccent ? sparkCol : mix(hot, white, 0.4 + 0.5 * tw);
      if (kind > 0.72) {
        // a short dash, aligned with the flight
        const len = rs.range(4, 13) * S * (1 - 0.5 * t);
        g.lineCap = 'round';
        g.lineWidth = size * 0.75;
        g.strokeStyle = css(col, clamp(a * 0.85, 0, 1));
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(p[0] - dx * len, p[1] - dy * len);
        g.stroke();
      } else {
        glow(g, p[0], p[1], size * 5, col, a * 0.25, 3);
        glow(g, p[0], p[1], size * 1.3, mix(col, white, 0.5), a, 2.2);
      }
    }
    g.restore();
  }

  // 4 · the head: a hot core, a coma stretched a little back along the tail, a fine flare
  {
    const hp = at(0);
    const a = fade;
    glow(g, hp[0], hp[1], P.comaPx * S * 4.4, dustCol, 0.2 * a, 2.6);
    // an elongated coma
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(hp[0] - dx * P.comaPx * S * 0.5, hp[1] - dy * P.comaPx * S * 0.5);
    g.rotate(Math.atan2(dy, dx));
    g.scale(2.1, 1);
    glow(g, 0, 0, P.comaPx * S * 0.8, mix(dustCol, white, 0.4), 0.55 * a, 2.6);
    g.restore();
    glow(g, hp[0], hp[1], P.headPx * S * 2.2, mix(hot, white, 0.6), 0.95 * a, 2.4);
    glow(g, hp[0], hp[1], P.headPx * S, white, a, 1.8);
    // a fine cross flare
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const [len, ang0, al] of [[P.flarePx, ang, 0.7], [P.flarePx * 0.6, ang + Math.PI / 2, 0.45]] as const) {
      const lg = g.createLinearGradient(hp[0] - Math.cos(ang0) * len * S, hp[1] - Math.sin(ang0) * len * S, hp[0] + Math.cos(ang0) * len * S, hp[1] + Math.sin(ang0) * len * S);
      lg.addColorStop(0, css(white, 0));
      lg.addColorStop(0.5, css(white, al * a));
      lg.addColorStop(1, css(white, 0));
      g.strokeStyle = lg;
      g.lineWidth = 0.8 * S;
      g.beginPath();
      g.moveTo(hp[0] - Math.cos(ang0) * len * S, hp[1] - Math.sin(ang0) * len * S);
      g.lineTo(hp[0] + Math.cos(ang0) * len * S, hp[1] + Math.sin(ang0) * len * S);
      g.stroke();
    }
    g.restore();
  }
}
