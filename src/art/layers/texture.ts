// STUB — replaced by the veil/texture agent. Grain, vignette and grade overlays.
import type { LayerFn } from './types.ts';
import { hash2 } from '../math.ts';

export const render: LayerFn = (c) => {
  const T = c.P.layers.texture;
  const grain = c.makeCanvas();
  const g = grain.getContext('2d')!;
  const id = g.createImageData(c.w, c.h);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const v = 128 + (hash2(x, y, 7) - 0.5) * 120;
    const o = (y * c.w + x) * 4;
    id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255;
  }
  g.putImageData(id, 0, 0);

  const vig = c.makeCanvas();
  const v = vig.getContext('2d')!;
  const gr = v.createRadialGradient(c.w / 2, c.h / 2, c.lay.unit * 0.3, c.w / 2, c.h / 2, Math.hypot(c.w, c.h) / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, `rgba(${255 * (1 - T.vignette.strength)},${255 * (1 - T.vignette.strength)},${255 * (1 - T.vignette.strength)},1)`);
  v.fillStyle = gr;
  v.fillRect(0, 0, c.w, c.h);
  return [
    { id: 'grain', canvas: grain, ...T.grain.compose },
    { id: 'vignette', canvas: vig, ...T.vignette.compose },
  ];
};
