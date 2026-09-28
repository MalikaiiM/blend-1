// STUB — replaced by the strata agent. The stacked glass sheets (haloclines).
import type { LayerFn } from './types.ts';
import { css } from '../color.ts';

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  const n = c.traits.body.sheets;
  for (let i = 0; i < n; i++) {
    g.fillStyle = css(c.pal.mid, 0.16 * c.grow('strata'));
    g.fillRect(0, (c.h * (i + 0.5)) / n, c.w, c.h / n);
  }
  return { id: 'strata', canvas: cv, ...c.P.layers.strata.compose };
};
