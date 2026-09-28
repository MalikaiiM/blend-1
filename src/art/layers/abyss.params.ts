import type { Compose, Knob } from './types.ts';
export const abyssParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [] as Knob[],
  compose: { blend: 'source-over', alpha: 1, parallax: 0.12 } as Compose,
};
