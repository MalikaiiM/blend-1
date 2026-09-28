// STUB — replaced by the threads agent. Flow-field filaments that grow with the tides.
import type { LayerFn } from './types.ts';
import { css } from '../color.ts';

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  const r = c.rng('threads');
  g.strokeStyle = css(c.pal.glass, 0.3);
  g.lineWidth = 1.5 * c.S;
  const n = Math.round(60 * c.q);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2);
    const len = c.lay.R * r.range(0.4, 1.1) * c.grow('threads');
    g.beginPath();
    g.moveTo(c.lay.cx, c.lay.cy);
    g.lineTo(c.lay.cx + Math.cos(a) * len, c.lay.cy + Math.sin(a) * len);
    g.stroke();
  }
  return { id: 'threads', canvas: cv, ...c.P.layers.threads.compose };
};
