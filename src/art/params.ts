// ─────────────────────────────────────────────────────────────────────────────
//  HALOCLINE · PARAMS
//  Every tunable in the generator lives in this one object. Layer-specific
//  numbers are colocated in ./layers/*.params.ts and re-exported under
//  PARAMS.layers so there is still exactly one thing to read and tweak.
// ─────────────────────────────────────────────────────────────────────────────

import { abyssParams } from './layers/abyss.params.ts';
import { strataParams } from './layers/strata.params.ts';
import { threadsParams } from './layers/threads.params.ts';
import { lumenParams } from './layers/lumen.params.ts';
import { inclusionParams } from './layers/inclusion.params.ts';
import { veilParams } from './layers/veil.params.ts';
import { textureParams } from './layers/texture.params.ts';

export type PaletteRole = 'void' | 'deep' | 'mid' | 'glass' | 'light' | 'spark';

export interface PaletteDef {
  id: string;
  name: string;
  /** relative odds of a seed drawing this palette */
  weight: number;
  /** six roles, dark → bright, as sRGB hex */
  roles: Record<PaletteRole, string>;
  /** aurora-style palettes rotate hue across the piece instead of holding one family */
  spectral?: boolean;
  /** title words: adjectives that suit the palette */
  words: string[];
}

export interface HorizonDef {
  id: 'dawn' | 'dusk' | 'zenith' | 'nadir';
  name: string;
  /** where the bloom is rooted, as fractions of canvas width/height */
  anchor: [number, number];
  /** direction the bloom opens toward, degrees (canvas coords: 0 → right, 90 → down, −90 → up) */
  axisDeg: number;
  /** angular width of the fan, degrees (360 = full radial) */
  spreadDeg: number;
  /** light tint blended into the bloom's `light` and the haze around it */
  tint: string;
  tintAmount: number;
  line: string;
}

const P = {
  meta: {
    title: 'Halocline',
    tagline: 'Five hundred and twelve seeds from the Glass Sea',
    edition: 512,
    version: '1.0.0',
  },

  /** The drop, on paper. Dates are placeholders — shift them in one place. */
  drop: {
    mintOpenISO: '2026-11-12T17:00:00Z',
    priceEth: '0.05',
    maxPerWallet: 3,
    mintWindowHours: 24,
  },

  /** The block clock. One block = one beat of the tide. */
  clock: {
    blockSeconds: 12,
    blocksPerDay: 7200,
    tideDays: 7,
    tides: 4,
    /** turning closes this many blocks before the reveal — "the seeds hold still" */
    stillHourBlocks: 300,
    /** after the reveal block the bloom keeps opening for this many blocks */
    bloomBlocks: 7200,
    /** daily breathing of the whole piece while it grows (fraction of brightness) */
    pulseAmp: 0.045,
  },

  /** Canonical canvas + quality knobs. */
  canvas: {
    aspect: 4 / 5,
    /** internal design height; pixel widths in layers are authored against this */
    designHeight: 1000,
    draftFactor: 0.4,
  },

  /**
   * How the piece wakes up over the four tides. All windows are in growth
   * time t ∈ [0,1] (0 = the block the mint opens, 1 = the reveal block).
   */
  growth: {
    windows: {
      abyss: [0.0, 0.22],
      strata: [0.04, 0.42],
      threads: [0.16, 0.74],
      bud: [0.0, 0.92],
      veil: [0.3, 0.9],
    } as Record<string, [number, number]>,
    /** global value multiplier at t=0 (rises to 1) — the seed starts dim */
    dimAt0: 0.3,
    /** global chroma multiplier at t=0 (rises to 1) — and half-desaturated */
    satAt0: 0.42,
    /** fraction of the fully-grown bud size the seed has at t=0 */
    budAt0: 0.16,
  },

  horizons: [
    {
      id: 'dawn', name: 'Dawn', anchor: [0.5, 0.8], axisDeg: -90, spreadDeg: 210,
      tint: '#ffb56b', tintAmount: 0.42,
      line: 'Light climbs out of the water. The bloom rises like a sun.',
    },
    {
      id: 'dusk', name: 'Dusk', anchor: [0.82, 0.52], axisDeg: 180, spreadDeg: 200,
      tint: '#ff6b88', tintAmount: 0.45,
      line: 'Light leans and lingers. The bloom trails across the glass.',
    },
    {
      id: 'zenith', name: 'Zenith', anchor: [0.5, 0.15], axisDeg: 90, spreadDeg: 200,
      tint: '#b9e6ff', tintAmount: 0.5,
      line: 'Light falls from above. The bloom pours down in shafts.',
    },
    {
      id: 'nadir', name: 'Nadir', anchor: [0.5, 0.56], axisDeg: -90, spreadDeg: 360,
      tint: '#72ffc8', tintAmount: 0.4,
      line: 'Light wakes from within. The bloom opens in every direction.',
    },
  ] satisfies HorizonDef[],

  palettes: [
    { id: 'verdigris', name: 'Verdigris Night', weight: 1.15, words: ['Verdigris', 'Tarnished', 'Mossbright', 'Patina', 'Kelp'],
      roles: { void: '#04100f', deep: '#0a3a3a', mid: '#1c7d70', glass: '#6fd4b4', light: '#f6efc4', spark: '#e58a4a' } },
    { id: 'ember', name: 'Ember Reef', weight: 1.1, words: ['Ember', 'Cinder', 'Smoldering', 'Garnet', 'Ashen'],
      roles: { void: '#14050a', deep: '#4a0e1e', mid: '#b5301f', glass: '#ff8a50', light: '#ffe2a0', spark: '#43dcd0' } },
    { id: 'cobalt', name: 'Cobalt Vesper', weight: 1.2, words: ['Vesper', 'Cobalt', 'Deepwater', 'Lapis', 'Indigo'],
      roles: { void: '#050614', deep: '#101c66', mid: '#2b4fd0', glass: '#86aeff', light: '#ffd6bf', spark: '#ff6f96' } },
    { id: 'rose', name: 'Rose Quartz Dusk', weight: 1.0, words: ['Quartz', 'Petal', 'Blush', 'Dusk', 'Rosewater'],
      roles: { void: '#10050e', deep: '#45123f', mid: '#ad3f7f', glass: '#ff9fc4', light: '#fff0e0', spark: '#6ff0cf' } },
    { id: 'saffron', name: 'Saffron Tide', weight: 0.9, words: ['Saffron', 'Amber', 'Gilded', 'Honeyed', 'Sunlit'],
      roles: { void: '#0f0a03', deep: '#392807', mid: '#a8720f', glass: '#ffcf55', light: '#fff4c8', spark: '#5a6cf0' } },
    { id: 'glacier', name: 'Glacier Wick', weight: 0.95, words: ['Glacial', 'Rime', 'Frostlit', 'Crystal', 'Polar'],
      roles: { void: '#03090f', deep: '#0a3050', mid: '#2882b0', glass: '#8fe3ff', light: '#f2fdff', spark: '#ffb055' } },
    { id: 'orchid', name: 'Orchid Static', weight: 0.85, words: ['Orchid', 'Violet', 'Static', 'Amethyst', 'Nightbloom'],
      roles: { void: '#09051a', deep: '#2a0e66', mid: '#7830d8', glass: '#cf88ff', light: '#fff0fc', spark: '#2ef0c0' } },
    { id: 'moss', name: 'Moss Cathedral', weight: 0.8, words: ['Cathedral', 'Fernlit', 'Emerald', 'Canopy', 'Greenglass'],
      roles: { void: '#050b04', deep: '#11341a', mid: '#3c8a2e', glass: '#b0e666', light: '#fff6be', spark: '#ff7658' } },
    { id: 'oxide', name: 'Oxide Sun', weight: 0.85, words: ['Oxide', 'Rust', 'Copper', 'Kiln', 'Terracotta'],
      roles: { void: '#0d0704', deep: '#3c1a0e', mid: '#a04a26', glass: '#f2a45e', light: '#ffe8c2', spark: '#18b3b0' } },
    { id: 'wisteria', name: 'Ink Wisteria', weight: 0.9, words: ['Wisteria', 'Inkwell', 'Twilight', 'Hush', 'Bluebell'],
      roles: { void: '#06060e', deep: '#1a1a48', mid: '#494ea0', glass: '#a5aeff', light: '#eef0ff', spark: '#ffcc66' } },
    { id: 'anemone', name: 'Anemone Drift', weight: 0.55, words: ['Anemone', 'Coral', 'Tidepool', 'Reef', 'Sunfish'],
      roles: { void: '#060a12', deep: '#0f2f4a', mid: '#d4536a', glass: '#ff9a8a', light: '#fff1e4', spark: '#3fe0d5' } },
    { id: 'sulphur', name: 'Sulphur Lamp', weight: 0.5, words: ['Sulphur', 'Acid', 'Lime', 'Citrine', 'Gaslit'],
      roles: { void: '#080a02', deep: '#2d3a06', mid: '#8fae12', glass: '#e6f56a', light: '#ffffe0', spark: '#9a4dff' } },
    { id: 'aurora', name: 'Aurora Prism', weight: 0.16, spectral: true, words: ['Aurora', 'Prismatic', 'Spectral', 'Opaline', 'Borealis'],
      roles: { void: '#050710', deep: '#12224d', mid: '#3a7bd5', glass: '#8fffe0', light: '#ffffff', spark: '#ff5fd2' } },
    { id: 'blackglass', name: 'Blackglass', weight: 0.3, words: ['Obsidian', 'Blackglass', 'Slate', 'Nocturne', 'Silvered'],
      roles: { void: '#030304', deep: '#14161c', mid: '#4a4f5c', glass: '#b8bfd0', light: '#ffffff', spark: '#ff5a3c' } },
  ] satisfies PaletteDef[],

  /** Trait odds. Weights are relative; the audit script reports the realised shares. */
  traits: {
    // — body: fixed by the seed, visible from the first block —
    sheets: [{ v: 3, w: 22 }, { v: 4, w: 34 }, { v: 5, w: 26 }, { v: 6, w: 13 }, { v: 7, w: 5 }],
    interface: [
      { v: 'level', w: 38 }, { v: 'leaning', w: 30 }, { v: 'fan', w: 19 }, { v: 'folded', w: 13 },
    ],
    growth: [
      { v: 'silk', w: 30 }, { v: 'root', w: 25 }, { v: 'coral', w: 18 }, { v: 'reed', w: 19 }, { v: 'storm', w: 8 },
    ],
    glass: [
      { v: 'clear', w: 30 }, { v: 'stained', w: 32 }, { v: 'frosted', w: 24 }, { v: 'prismatic', w: 14 },
    ],
    grain: [{ v: 'fine', w: 45 }, { v: 'silken', w: 35 }, { v: 'coarse', w: 20 }],
    dust: [
      { v: 'sparse', w: 30 }, { v: 'drifting', w: 42 }, { v: 'snowfall', w: 22 }, { v: 'starfall', w: 6 },
    ],
    // — bloom: sealed until the sky opens (bloomSeed = keccak(seed, horizon, sky)) —
    form: [
      { v: 'lance', w: 30 }, { v: 'teardrop', w: 28 }, { v: 'shard', w: 20 }, { v: 'ribbon', w: 16 }, { v: 'coronet', w: 6 },
    ],
    petals: [
      { v: 5, w: 14 }, { v: 6, w: 15 }, { v: 7, w: 13 }, { v: 8, w: 20 }, { v: 9, w: 11 },
      { v: 10, w: 8 }, { v: 12, w: 9 }, { v: 13, w: 8 }, { v: 21, w: 2 },
    ],
    rings: [{ v: 2, w: 34 }, { v: 3, w: 41 }, { v: 4, w: 19 }, { v: 5, w: 6 }],
    light: [{ v: 'lamp', w: 40 }, { v: 'radiant', w: 36 }, { v: 'blazing', w: 19 }, { v: 'nova', w: 5 }],
    inclusion: [
      { v: 'none', w: 73.7 },
      { v: 'seam', w: 5.0 },
      { v: 'twin', w: 5.5 },
      { v: 'eclipse', w: 4.0 },
      { v: 'veil', w: 3.2 },
      { v: 'halo', w: 3.6 },
      { v: 'comet', w: 4.2 },
      { v: 'spectrum', w: 0.8 },
    ],
  },

  /** Display names for trait values. */
  names: {
    interface: { level: 'Level', leaning: 'Leaning', fan: 'Fan', folded: 'Folded' },
    growth: { silk: 'Silk', root: 'Root', coral: 'Coral', reed: 'Reed', storm: 'Storm' },
    glass: { clear: 'Clear', stained: 'Stained', frosted: 'Frosted', prismatic: 'Prismatic' },
    grain: { fine: 'Fine', silken: 'Silken', coarse: 'Coarse' },
    dust: { sparse: 'Sparse', drifting: 'Drifting', snowfall: 'Snowfall', starfall: 'Starfall' },
    form: { lance: 'Lance', teardrop: 'Teardrop', shard: 'Shard', ribbon: 'Ribbon', coronet: 'Coronet' },
    light: { lamp: 'Lamp', radiant: 'Radiant', blazing: 'Blazing', nova: 'Nova' },
    inclusion: {
      none: 'None', seam: 'Kintsugi Seam', twin: 'Twin Bloom', eclipse: 'Eclipse',
      veil: 'Aurora Veil', halo: 'Halo Rings', comet: 'Comet', spectrum: 'Full Spectrum',
    },
    nouns: {
      lance: ['Spear', 'Reed', 'Vane', 'Needle', 'Blade'],
      teardrop: ['Drop', 'Pearl', 'Lantern', 'Ember', 'Bead'],
      shard: ['Prism', 'Facet', 'Splinter', 'Cleave', 'Glint'],
      ribbon: ['Tide', 'Veil', 'Current', 'Sash', 'Wake'],
      coronet: ['Coronet', 'Thorn', 'Diadem', 'Crest', 'Spire'],
    } as Record<string, string[]>,
  },

  /** Rarity tiers by information score (Σ −ln share); cutoffs tuned by the audit. */
  rarity: {
    tierCutoffs: { uncommon: 17.8, rare: 19.6, epic: 21.2, mythic: 22.6 },
    /** per-trait tier by share of the edition */
    shareTiers: { uncommon: 0.25, rare: 0.1, epic: 0.04, mythic: 0.01 },
  },

  /**
   * What "weak" means. The pixel audit (npm run audit:pixels) renders each seed small and fails any
   * that fall outside these bounds; tune the generator until 1,000 seeds pass.
   */
  quality: {
    meanLum: [0.08, 0.5],
    lumStd: [0.08, 0.4],
    colorfulness: [0.06, 0.6],
    litCoverage: [0.03, 0.7],
    /** the bloom core must stand clear of the average frame */
    bloomContrast: [0.08, 1],
    /** mean |ΔL| per pixel — too low is flat/blurry, too high is noise */
    edgeEnergy: [0.003, 0.09],
    darkClipMax: 0.6,
    whiteClipMax: 0.2,
    /** distinct hues carrying ≥ 6 % of the chromatic pixels (12 bins) — Blackglass may be 1 */
    hueBinsMin: 1,
    /** two pieces closer than this (RGB distance of 16×20 thumbnails, 0..1 scale ×√(960)) count as near-duplicates */
    nearDuplicate: 0.9,
  },

  /** Voice and names shared by the art, the explainer and the story. */
  lore: {
    layers: {
      abyss: { name: 'The Abyss', line: 'Dark water that remembers every light that ever fell into it. Vast, far, out of focus.' },
      strata: { name: 'The Sheets', line: 'Sheets of old light, laid down in order and never mixing. Each one bends what lies beneath it.' },
      threads: { name: 'The Threads', line: 'What the seed sends out to feel for the surface. They lengthen a little every tide.' },
      lumen: { name: 'The Lumen', line: 'The lamp itself. Shut like a bud for four tides, then opened toward a horizon.' },
      inclusion: { name: 'The Inclusion', line: 'A rare flaw in the glass — or a gift. About one seed in four carries one.' },
      veil: { name: 'The Veil', line: 'Close, loose and unfocused: the dust the light carries with it as it rises.' },
      texture: { name: 'The Grain', line: 'Sub-pixel tooth, hairline scratches, a breath of vignette. It is what makes light look as if it passed through something.' },
    } as Record<string, { name: string; line: string }>,
    tides: [
      { n: 1, name: 'The Deep', line: 'The abyss darkens into colour and the first sheet settles.' },
      { n: 2, name: 'The Sheets', line: 'The halocline stacks itself, one glass over another.' },
      { n: 3, name: 'The Threads', line: 'Filaments reach out from the seed; dust begins to drift.' },
      { n: 4, name: 'The Lamp', line: 'The bud swells, taut and bright, waiting for the sky.' },
    ],
  },

  layers: {
    abyss: abyssParams,
    strata: strataParams,
    threads: threadsParams,
    lumen: lumenParams,
    inclusion: inclusionParams,
    veil: veilParams,
    texture: textureParams,
  },
};

export const PARAMS = P;
export type Params = typeof P;
