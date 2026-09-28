// Hand-picked pieces used by the hero and the story. PROVISIONAL until curated.
import { rehearsalSky, seedFromText } from '../art/index.ts';

export interface Featured { seed: string; horizon: 0 | 1 | 2 | 3; sky: string }

const mk = (name: string, horizon: 0 | 1 | 2 | 3, n: number): Featured => ({ seed: seedFromText(name), horizon, sky: rehearsalSky(n) });

/** The hero opens on the first; every click draws a fresh random seed. */
export const HERO: Featured[] = [
  mk('halocline-hero-0', 3, 101), mk('halocline-hero-1', 0, 102), mk('halocline-hero-2', 1, 103), mk('halocline-hero-3', 2, 104),
];
/** The piece the story follows from the Glass Sea to the bloom. */
export const STORY: Featured = mk('halocline-story-0', 0, 201);
/** The piece the explainer and simulator start with. */
export const DEMO: Featured = mk('halocline-demo-0', 1, 301);
