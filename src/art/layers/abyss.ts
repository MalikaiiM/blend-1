// STUB — replaced by the abyss agent. Deepest, largest, darkest, blurriest.
import type { LayerFn } from './types.ts';
import { css } from '../color.ts';

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, c.h);
  gr.addColorStop(0, css(c.pal.deep));
  gr.addColorStop(1, css(c.pal.void));
  g.fillStyle = gr;
  g.fillRect(0, 0, c.w, c.h);
  return { id: 'abyss', canvas: cv, ...c.P.layers.abyss.compose };
};
