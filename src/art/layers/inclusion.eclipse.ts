// Eclipse — a dark disc slides across the bloom's heart. Its rim keeps a razor of white light; a soft corona
// with streamers and four thin flare spikes leans along the bloom's axis. Petals still burn around it.

import type { LayerCtx } from './types.ts';
import { css, mix } from '../color.ts';
import { clamp, lerp, smoothstep, TAU } from '../math.ts';
import { bloomRadius, glow, isMono, lightOf } from './inclusion.util.ts';

export function drawEclipse(c: LayerCtx, g: CanvasRenderingContext2D, k: number) {
  const E = c.P.layers.inclusion.eclipse;
  const L = c.lay;
  const S = c.S;
  const R = bloomRadius(c);
  const rng = c.rng('inclusion/eclipse');
  const { hot, white } = lightOf(c);
  const mono = isMono(c);

  // ── every random draw up front, in a fixed order (composition never depends on quality) ──
  const rd = R * rng.range(E.radius[0]!, E.radius[1]!);
  const off = rd * rng.range(E.offset[0]!, E.offset[1]!);
  const offAng = L.axis + rng.range(-1.1, 1.1) + (rng() < 0.5 ? Math.PI : 0);
  const slideAng = L.axis + Math.PI / 2 * rng.sign() + rng.range(-0.35, 0.35);
  const beadAng = offAng + Math.PI + rng.range(-0.5, 0.5);
  const spikeRot = L.axis + rng.range(-0.28, 0.28);
  const streamers: { a: number; w: number; len: number; al: number }[] = [];
  for (let i = 0; i < E.corona.streamers; i++) {
    // denser along the bloom's axis (the equatorial streamers of a real corona), thinner elsewhere
    let a = rng.range(0, TAU);
    const lean = L.radial ? 1 : 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(a - L.axis));
    const keep = rng();
    const len = lerp(E.corona.streamLen[0]!, E.corona.streamLen[1]!, Math.pow(rng(), 1.6)) * (0.55 + 0.45 * lean);
    const w = lerp(E.corona.streamDeg[0]!, E.corona.streamDeg[1]!, rng()) * (Math.PI / 180);
    const al = lerp(E.corona.streamA[0]!, E.corona.streamA[1]!, rng()) * (0.6 + 0.4 * lean);
    streamers.push({ a, w, len, al: keep < 0.16 ? 0 : al });
  }
  const spikes: { a: number; len: number; al: number; px: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const main = i < 4;
    const len = (main ? lerp(E.spikes.len[0]!, E.spikes.len[1]!, rng()) : lerp(E.spikes.minorLen[0]!, E.spikes.minorLen[1]!, rng())) * R;
    spikes.push({ a: spikeRot + (i % 4) * (Math.PI / 2) + (main ? 0 : Math.PI / 4), len, al: main ? E.spikes.alpha : E.spikes.alpha * 0.4, px: main ? E.spikes.px : E.spikes.px * 0.7 });
  }

  // ── time ──
  const fadeIn = smoothstep(0.0, 0.2, k);
  const slide = 1 - smoothstep(0.05, 0.82, k);
  const cor = smoothstep(0.3, 1, k);
  const sx = L.cx, sy = L.cy;
  const mx = sx + Math.cos(offAng) * off + Math.cos(slideAng) * slide * E.slide * rd;
  const my = sy + Math.sin(offAng) * off + Math.sin(slideAng) * slide * E.slide * rd;

  const coronaCol = mono ? mix(white, c.pal.spark, 0.18) : mix(hot, white, 0.55);
  const midCol = mono ? white : mix(c.pal.glass, hot, 0.55);
  const farCol = mono ? mix(c.pal.glass, white, 0.3) : c.pal.glass;
  const ringCol = mono ? c.pal.spark : mix(white, hot, 0.25);

  g.save();
  g.lineCap = 'round';

  // 1 · the soft outer corona, centred on the sun
  if (cor > 0.01) {
    const reach = rd * E.corona.reach;
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(sx, sy, rd * 0.9, sx, sy, reach);
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const col = t < 0.35 ? mix(coronaCol, midCol, t / 0.35) : mix(midCol, farCol, (t - 0.35) / 0.65);
      const a = E.corona.alpha * cor * Math.exp(-3.4 * t) * (1 - t * t);
      gr.addColorStop(t, css(col, clamp(a, 0, 1)));
    }
    g.fillStyle = gr;
    g.fillRect(sx - reach, sy - reach, reach * 2, reach * 2);
    // a fainter, wider veil so the corona has no visible edge
    glow(g, sx, sy, reach * 1.7, farCol, E.corona.veil * cor, 2.4);

    // streamers: thin wedges leaving the limb, fading outward
    const n = Math.ceil(streamers.length * c.q);
    for (let i = 0; i < n; i++) {
      const s = streamers[i]!;
      if (s.al <= 0) continue;
      const r0 = rd * 0.985, r1 = rd * (1 + s.len);
      const cx0 = sx + Math.cos(s.a) * r0, cy0 = sy + Math.sin(s.a) * r0;
      const tx = sx + Math.cos(s.a) * r1, ty = sy + Math.sin(s.a) * r1;
      const hw = Math.tan(s.w) * r0;
      const nx = -Math.sin(s.a), ny = Math.cos(s.a);
      const lg = g.createLinearGradient(cx0, cy0, tx, ty);
      lg.addColorStop(0, css(coronaCol, s.al * cor));
      lg.addColorStop(0.35, css(midCol, s.al * cor * 0.5));
      lg.addColorStop(1, css(farCol, 0));
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(cx0 + nx * hw, cy0 + ny * hw);
      g.lineTo(tx, ty);
      g.lineTo(cx0 - nx * hw, cy0 - ny * hw);
      g.closePath();
      g.fill();
    }
  }

  // 1b · flare spikes: needles of light through the sun, drawn as stretched glows so they have no hard edge
  if (cor > 0.01) {
    g.globalCompositeOperation = 'lighter';
    const n = Math.max(4, Math.ceil(spikes.length * c.q));
    for (let i = 0; i < n; i++) {
      const sp = spikes[i]!;
      for (const [wk, ak] of [[5, 0.22], [1, 1]] as const) {
        g.save();
        g.translate(sx, sy);
        g.rotate(sp.a);
        g.scale(sp.len + rd, sp.px * S * 0.5 * wk);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        const N = 8;
        for (let j = 0; j <= N; j++) {
          const t = j / N;
          gr.addColorStop(t, css(mix(white, hot, Math.min(1, t * 1.4)), clamp(sp.al * ak * cor * Math.exp(-3.6 * t * t) * (1 - t * t * t), 0, 1)));
        }
        g.fillStyle = gr;
        g.fillRect(-1, -1, 2, 2);
        g.restore();
      }
    }
  }

  // 2 · the moon: near-black, with the faintest earthshine on its limb, and a feathered edge
  g.globalCompositeOperation = 'source-over';
  {
    const dark = mix(c.pal.void, [0, 0, 0], 0.62);
    const limb = mix(dark, c.pal.deep, E.moon.rim);
    const gr = g.createRadialGradient(mx, my, 0, mx, my, rd * 1.012);
    gr.addColorStop(0, css(dark, E.moon.alpha * fadeIn));
    gr.addColorStop(0.78, css(dark, E.moon.alpha * fadeIn));
    gr.addColorStop(0.955, css(limb, E.moon.alpha * fadeIn));
    gr.addColorStop(0.985, css(limb, E.moon.alpha * fadeIn));
    gr.addColorStop(1, css(limb, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(mx, my, rd * 1.012, 0, TAU);
    g.fill();
  }

  g.globalCompositeOperation = 'lighter';
  // a whisper of corona light on the limb that faces the diamond: it turns the disc from a hole into a sphere
  {
    const lx = mx + Math.cos(beadAng) * rd * 0.55, ly = my + Math.sin(beadAng) * rd * 0.55;
    g.save();
    g.beginPath();
    g.arc(mx, my, rd, 0, TAU);
    g.clip();
    const lg = g.createRadialGradient(lx, ly, 0, lx, ly, rd * 1.25);
    lg.addColorStop(0, css(mix(hot, c.pal.glass, 0.4), 0));
    lg.addColorStop(0.55, css(mix(hot, c.pal.glass, 0.4), 0.02 * cor));
    lg.addColorStop(1, css(mix(hot, c.pal.glass, 0.4), E.moon.shine * cor * fadeIn));
    g.fillStyle = lg;
    g.fillRect(mx - rd, my - rd, rd * 2, rd * 2);
    g.restore();
  }

  // 3 · the razor: the sun's sliver where the moon has not quite covered it, plus a hairline ring on the limb
  {
    
    const showRing = smoothstep(0.0, 0.6, k) * fadeIn;
    const inten = (a: number) => {
      const d = Math.abs(Math.atan2(Math.sin(a - beadAng), Math.cos(a - beadAng)));
      return E.ring.floor + (1 - E.ring.floor) * Math.exp(-(d * d) / (2 * E.ring.spread * E.ring.spread));
    };
    g.save();
    g.beginPath();
    g.rect(0, 0, c.w, c.h);
    g.arc(mx, my, rd, 0, TAU, true);
    g.clip();
    // light spilling just outside the limb (halation of the ring): brightest toward the diamond
    const NS = 96;
    for (let i = 0; i < E.ring.glowPx.length; i++) {
      const wpx = E.ring.glowPx[i]! * S;
      g.lineWidth = wpx;
      for (let j = 0; j < NS; j++) {
        const a0 = (j / NS) * TAU, a1 = ((j + 1.15) / NS) * TAU;
        const I = inten((a0 + a1) / 2);
        g.strokeStyle = css(mix(ringCol, hot, 0.3 + 0.2 * i), clamp(E.ring.glowA[i]! * showRing * I, 0, 1));
        g.beginPath();
        g.arc(mx, my, rd + wpx * 0.42, a0, a1);
        g.stroke();
      }
    }
    g.restore();
    // the lune: a sliver of light whose width swells toward the diamond (a ring that is not quite concentric)
    {
      const lm = rd * E.ring.lune;
      const pts: [number, number][] = [];
      const NL = 120;
      for (let j = 0; j <= NL; j++) {
        const a = (j / NL) * TAU;
        const I = inten(a);
        const t = lm * Math.pow(Math.max(0, (I - E.ring.floor) / (1 - E.ring.floor)), 1.6);
        pts.push([mx + Math.cos(a) * (rd + t), my + Math.sin(a) * (rd + t)]);
      }
      const lg = g.createRadialGradient(mx, my, rd * 0.99, mx, my, rd + lm);
      lg.addColorStop(0, css(mix(white, hot, 0.12), 0.85 * showRing));
      lg.addColorStop(0.25, css(mix(white, hot, 0.3), 0.4 * showRing));
      lg.addColorStop(1, css(hot, 0));
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (let j = 1; j < pts.length; j++) g.lineTo(pts[j]![0], pts[j]![1]);
      g.closePath();
      // (a radial gradient also paints inside its inner circle, so cut the disc out: the lune is a ring, not a plate)
      g.moveTo(mx + rd * 0.995, my);
      g.arc(mx, my, rd * 0.995, 0, TAU, true);
      g.fill();
    }
    // hairline ring: thin all round, a little fuller and brighter toward the diamond
    for (let j = 0; j < 120; j++) {
      const a0 = (j / 120) * TAU, a1 = ((j + 1.2) / 120) * TAU;
      const I = inten((a0 + a1) / 2);
      g.lineWidth = E.ring.px * S * (0.55 + 0.9 * I);
      g.strokeStyle = css(mix(ringCol, white, 0.4), E.ring.alpha * showRing * (0.4 + 0.6 * I));
      g.beginPath();
      g.arc(mx, my, rd + g.lineWidth * 0.5, a0, a1);
      g.stroke();
    }
    // a faint light bleeding a little over the dark disc's edge
    const bl = g.createRadialGradient(mx, my, rd * 0.86, mx, my, rd);
    bl.addColorStop(0, css(ringCol, 0));
    bl.addColorStop(1, css(ringCol, E.ring.bleed * showRing));
    g.fillStyle = bl;
    g.beginPath();
    g.arc(mx, my, rd, 0, TAU);
    g.fill();
  }

  // 4 · the diamond: one bead of brilliance where the sun is last to be covered
  {
    const bA = smoothstep(0.55, 1, k) * fadeIn;
    const bx = mx + Math.cos(beadAng) * (rd + 0.4 * S), by = my + Math.sin(beadAng) * (rd + 0.4 * S);
    glow(g, bx, by, rd * E.bead.r * 2.2, mix(hot, ringCol, 0.4), E.bead.alpha * 0.35 * bA, 3);
    glow(g, bx, by, rd * E.bead.r * 0.7, white, E.bead.alpha * bA, 2.4);
  }

  g.restore();
}
