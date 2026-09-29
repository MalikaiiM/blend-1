// THE INCLUSION — a rare flaw in the glass, or a gift. Drawn only after the sky has opened, and only when the
// sealed bloom traits say so; every kind grows in with tl.bloom and is complete (and still) at bloom = 1.

import type { LayerFn } from './types.ts';
import { bloomOpen } from './inclusion.util.ts';
import { drawEclipse } from './inclusion.eclipse.ts';
import { drawSeam } from './inclusion.seam.ts';
import { drawTwin } from './inclusion.twin.ts';
import { drawHalo } from './inclusion.halo.ts';
import { drawComet } from './inclusion.comet.ts';
import { drawVeil } from './inclusion.veil.ts';
import { drawSpectrum } from './inclusion.spectrum.ts';

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  const P = c.P.layers.inclusion;
  const out = { id: 'inclusion' as const, canvas: cv, ...P.compose };
  // sealed until the sky opens: do not even read the trait before that
  if (!c.traits.revealed || c.tl.bloom <= 0.0005) return out;
  const kind = c.traits.bloom.inclusion;
  if (kind === 'none') return out;
  const g = cv.getContext('2d')!;
  const k = bloomOpen(c);
  out.blend = P.blend[kind] ?? P.compose.blend;
  switch (kind) {
    case 'eclipse': drawEclipse(c, g, k); break;
    case 'seam': drawSeam(c, g, k); break;
    case 'twin': drawTwin(c, g, k); break;
    case 'halo': drawHalo(c, g, k); break;
    case 'comet': drawComet(c, g, k); break;
    case 'veil': drawVeil(c, g, k); break;
    case 'spectrum': {
      // two canvases: a hue field composed with 'color' (under), and the light on top. The field is all soft gradients,
      // so it is drawn at a quarter of the resolution and scaled up by the compositor.
      const fw = Math.max(2, Math.round(c.w / 4)), fh = Math.max(2, Math.round(c.h / 4));
      const field = c.makeCanvas(fw, fh);
      const fg = field.getContext('2d')!;
      fg.scale(fw / c.w, fh / c.h);
      drawSpectrum(c, g, fg, k);
      out.blend = P.blend.spectrum ?? 'screen';
      return [{ id: 'inclusion', canvas: field, blend: 'color', alpha: 1, parallax: P.compose.parallax }, out];
    }
    default: break;
  }
  return out;
};
