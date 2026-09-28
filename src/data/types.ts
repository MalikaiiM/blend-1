export interface PieceEntry {
  /** token-style number shown as "No. 0037" (illustrative — the gallery is a rehearsal set) */
  no: number;
  seed: string;
  /** the horizon this piece was turned toward */
  horizon: 0 | 1 | 2 | 3;
  /** the (rehearsal) sky used for its bloom */
  sky: string;
}
