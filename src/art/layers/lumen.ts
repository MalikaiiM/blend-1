// STUB — replaced by the lumen agent. The bloom: glass petals around a hot core.
import type { LayerFn } from './types.ts';
import { css } from '../color.ts';

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  const { cx, cy, R } = c.lay;
  const r = R * 0.5 * (0.3 + 0.7 * Math.max(c.lay.bud, c.tl.bloom));
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, css(c.pal.bloomLight, 0.95));
  gr.addColorStop(1, css(c.pal.bloomLight, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, c.w, c.h);
  return { id: 'lumen', canvas: cv, ...c.P.layers.lumen.compose };
};
