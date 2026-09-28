import type { Compose, Knob } from './types.ts';
export const threadsParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [] as Knob[],
  compose: { blend: 'screen', alpha: 1, parallax: 0.55 } as Compose,
};
