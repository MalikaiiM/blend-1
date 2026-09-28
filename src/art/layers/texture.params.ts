import type { Compose, Knob } from './types.ts';
export const textureParams = {
  knobs: [] as Knob[],
  grain: { compose: { blend: 'overlay', alpha: 0.35, parallax: 0 } as Compose, amount: 1 },
  vignette: { compose: { blend: 'multiply', alpha: 1, parallax: 0 } as Compose, strength: 0.6 },
  grade: { compose: { blend: 'soft-light', alpha: 0.3, parallax: 0 } as Compose },
};
