// "How it's made" — static data for the explainer: the depth ladder (DESIGN.md §4.1), prose, helpers.
import { PARAMS } from '../../art/index.ts';

export type RowId = 'abyss' | 'strata' | 'threads' | 'lumen' | 'inclusion' | 'veil' | 'texture';

/** Bottom → top, exactly the order the generator composites them. */
export const ROW_ORDER: readonly RowId[] = ['abyss', 'strata', 'threads', 'lumen', 'inclusion', 'veil', 'texture'];

/** LayerOut.id → the row (plane) it belongs to. The three texture overlays share one plane: the grain. */
export const ROW_OF: Record<string, RowId> = {
  abyss: 'abyss', strata: 'strata', threads: 'threads', lumen: 'lumen', inclusion: 'inclusion', veil: 'veil',
  grain: 'texture', vignette: 'texture', grade: 'texture',
};

export interface Bars { scale: number; value: number; blur: number; sat: number }
export interface Ranges { scale: string; value: string; blur: string; sat: string }
export interface RowDef { id: RowId; bars: Bars | null; ranges: Ranges }

/**
 * The depth ladder. Bars are 0..1 and read "more to the right": bigger features, brighter, blurrier, more saturated.
 * Numbers are transcribed from the table in docs/DESIGN.md §4.1; the words say the same thing in plain terms.
 */
export const ROWS: RowDef[] = [
  { id: 'abyss', bars: { scale: 0.86, value: 0.1, blur: 1, sat: 0.45 },
    ranges: { scale: 'Features 40–100 % of the frame', value: 'Darkest · L 0.06–0.22', blur: 'Extreme · no edges at all', sat: '35–55 % of the palette’s chroma' } },
  { id: 'strata', bars: { scale: 0.46, value: 0.27, blur: 0.72, sat: 0.7 },
    ranges: { scale: 'Bands 8–35 % of the height', value: 'Dark to mid · L 0.12–0.42', blur: 'Heavy body · hairline seams stay crisp', sat: '60–80 %' } },
  { id: 'threads', bars: { scale: 0.06, value: 0.58, blur: 0.4, sat: 0.93 },
    ranges: { scale: 'Filaments 0.5–8 px wide, reaching 20–70 % of the frame', value: 'Mid to bright · L 0.35–0.8', blur: 'A 6–14 px glow round a crisp core', sat: '85–100 %' } },
  { id: 'lumen', bars: { scale: 0.62, value: 0.97, blur: 0.22, sat: 1 },
    ranges: { scale: 'Petals 15–60 % of the frame', value: 'Brightest · core above 0.95', blur: 'Crisp petal edges · broad halation', sat: '100 %' } },
  { id: 'inclusion', bars: { scale: 0.5, value: 0.85, blur: 0.2, sat: 0.9 },
    ranges: { scale: 'Set by its kind: a seam, a twin, a curtain, a ring', value: 'Bright, close to the lamp', blur: 'Crisp edges · soft corona', sat: 'High' } },
  { id: 'veil', bars: { scale: 0.2, value: 0.86, blur: 0.5, sat: 0.85 },
    ranges: { scale: 'Bokeh 40–160 px · dust 1–4 px', value: 'Bright points', blur: 'Two kinds: very soft, and sharp', sat: 'High' } },
  { id: 'texture', bars: null,
    ranges: { scale: '1 px grain · hairline scratches', value: 'A breath of vignette', blur: '—', sat: 'A gentle grade' } },
];

export const BAR_LABELS: { key: keyof Bars; label: string; long: string }[] = [
  { key: 'scale', label: 'Scale', long: 'scale' },
  { key: 'value', label: 'Value', long: 'value' },
  { key: 'blur', label: 'Blur', long: 'blur' },
  { key: 'sat', label: 'Sat.', long: 'saturation' },
];

export const loreOf = (id: RowId) => PARAMS.lore.layers[id]!;

export const COPY = {
  eyebrow: '02 — How it’s made',
  h2: 'Light, laid down <em>in layers</em>',
  lede: 'Pull a piece apart and see what it is made of: dark water, sheets of glass, the light that runs through them, and the dust in front.',
  prose: [
    'Every image is a small stack of glass and light. At the bottom is the Abyss, dark water blurred until it has no edges. Over it lie the Sheets, which absorb and bend whatever is beneath them, and where two sheets meet a thin bright line settles: the halocline. The Threads and the Lumen are the only layers that give light; the Veil is foreground optics, dust and soft discs of bokeh; and the Grain is the medium itself, the tooth of the glass.',
    'None of it is drawn by hand, and none of it is left to chance. One 256-bit seed feeds a handful of named streams, one for each sheet, each thread, each mote, so changing one never disturbs another. Time enters only as the block: the same seed, a little later, is the same piece further along. Same seed, same image.',
  ],
};

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
export const roman = (n: number) => ROMAN[n] ?? String(n);

export const fmtNum = (v: number, step: number) => {
  const dp = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return v.toFixed(dp);
};
