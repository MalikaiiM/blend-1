// The 24 curated pieces. PROVISIONAL until scripts/pick-gallery.ts writes the real selection.
import { rehearsalSky, seedFromText } from '../art/index.ts';
import type { PieceEntry } from './types.ts';

export type GalleryEntry = PieceEntry;

export const GALLERY: GalleryEntry[] = Array.from({ length: 24 }, (_, i) => ({
  no: 7 + i * 21,
  seed: seedFromText(`halocline-gallery-${i}`),
  horizon: (i % 4) as 0 | 1 | 2 | 3,
  sky: rehearsalSky(i + 1),
}));
