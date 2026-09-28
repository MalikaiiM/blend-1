// THE GRAIN — the medium. Sub-pixel tooth that makes light look as if it passed through something.
//
// Three full-canvas overlays, pinned to the frame (parallax 0), drawn over everything else:
//   grain     overlay     film grain (Fine · Silken · Coarse) that dithers the dark, faint glass tooth, hairline scratches
//   vignette  multiply    a lopsided fall-off in the palette's own shade, leaning away from the light
//   grade     soft-light  shadows → deep, highlights → bloomLight, a faint lift in the toe; Blackglass stays near-neutral
//
// All three read one low-res map of the luminance below (c.below()), so the grain is even from abyss to lamp and the grade
// tints what is really there. Growth: heavier grain, cooler and flatter grade, a deeper vignette at the seed → settled at t=1.
// Nothing here moves with time; it is all static once the seed, the traits and the growth are fixed.
import type { LayerFn } from './types.ts';
import { lumaMap } from './texture.util.ts';
import { renderGrain } from './texture.grain.ts';
import { renderVignette } from './texture.vignette.ts';
import { renderGrade } from './texture.grade.ts';

export const render: LayerFn = (c) => {
  const T = c.P.layers.texture;
  const map = lumaMap(c);
  return [
    { id: 'grain', canvas: renderGrain(c, map), ...T.grain.compose },
    { id: 'vignette', canvas: renderVignette(c), ...T.vignette.compose },
    { id: 'grade', canvas: renderGrade(c, map), ...T.grade.compose },
  ];
};
