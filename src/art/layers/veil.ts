// STUB — replaced by the veil agent. Foreground bokeh, dust motes, sparks.
import type { LayerFn } from './types.ts';
import { css } from '../color.ts';

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  const r = c.rng('veil');
  const n = Math.round(120 * c.q * c.grow('veil'));
  for (let i = 0; i < n; i++) {
    g.fillStyle = css(c.pal.light, r.range(0.1, 0.6));
    g.fillRect(r.range(0, c.w), r.range(0, c.h), 2 * c.S, 2 * c.S);
  }
  return { id: 'veil', canvas: cv, ...c.P.layers.veil.compose };
};
