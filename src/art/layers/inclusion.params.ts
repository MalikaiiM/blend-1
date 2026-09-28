import type { Compose, Knob } from './types.ts';
export const inclusionParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [] as Knob[],
  compose: { blend: 'source-over', alpha: 1, parallax: 0.9 } as Compose,
};
