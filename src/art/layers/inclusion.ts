// STUB — replaced by the inclusions agent. Rare features (seam, twin, eclipse, veil, halo, comet, spectrum).
import type { LayerFn } from './types.ts';

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  return { id: 'inclusion', canvas: cv, ...c.P.layers.inclusion.compose };
};
