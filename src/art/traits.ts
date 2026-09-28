// Traits: what a piece *is*, derived deterministically and reported with odds.
//
//   body traits   ← the seed alone. Visible from the first block.
//   bloom traits  ← bloomSeed = keccak(seed, horizon, sky). Sealed until the sky opens.
//   horizon       ← the keeper's last turn (or the seed's native drift).

import { PARAMS, type PaletteDef, type PaletteRole } from './params.ts';
import { adjust, hex, mix, oklchToRgb, type RGB } from './color.ts';
import { clamp, lerp } from './math.ts';
import { seedCtx, streamOf, type Rng } from './rng.ts';
import { bloomSeed, effectiveHorizon, nativeHorizon, mintToken, type Horizon } from './mechanic.ts';

export type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';
type W<T> = { v: T; w: number }[];

export type InterfaceKind = 'level' | 'leaning' | 'fan' | 'folded';
export type GrowthKind = 'silk' | 'root' | 'coral' | 'reed' | 'storm';
export type GlassKind = 'clear' | 'stained' | 'frosted' | 'prismatic';
export type GrainKind = 'fine' | 'silken' | 'coarse';
export type DustKind = 'sparse' | 'drifting' | 'snowfall' | 'starfall';
export type FormKind = 'lance' | 'teardrop' | 'shard' | 'ribbon' | 'coronet';
export type LightKind = 'lamp' | 'radiant' | 'blazing' | 'nova';
export type InclusionKind = 'none' | 'seam' | 'twin' | 'eclipse' | 'veil' | 'halo' | 'comet' | 'spectrum';

export interface ResolvedPalette {
  def: PaletteDef;
  id: string;
  spectral: boolean;
  /** the six roles for this seed (lightly jittered from the palette's canon) */
  c: Record<PaletteRole, RGB>;
  /** the bloom's light: palette `light` tinted toward the horizon's colour */
  bloomLight: RGB;
  /** a softer version of the tint for haze around the anchor */
  haze: RGB;
  /** hue-walk for spectral palettes: t∈[0,1] → a saturated colour around the wheel (others: mid→glass) */
  walk(t: number): RGB;
}

export interface TraitEntry {
  key: string;
  label: string;
  value: string;
  /** 0..1 share of the edition holding this value (NaN when sealed) */
  share: number;
  tier: Tier;
  group: 'body' | 'bloom' | 'keeper';
  sealed: boolean;
}

export interface Traits {
  seed: string;
  /** null until the sky is known */
  bloomSeed: string | null;
  revealed: boolean;
  horizon: { index: Horizon; id: string; name: string; turned: boolean };
  body: {
    palette: string;
    sheets: number;
    interface: InterfaceKind;
    growth: GrowthKind;
    glass: GlassKind;
    grain: GrainKind;
    dust: DustKind;
  };
  /** while sealed these are provisional (used only to draw the closed bud) */
  bloom: {
    form: FormKind;
    petals: number;
    rings: number;
    light: LightKind;
    inclusion: InclusionKind;
  };
  colors: ResolvedPalette;
  list: TraitEntry[];
  /** Σ −ln(share) over the known traits */
  score: number;
  tier: Tier | null;
  title: string;
}

const T = PARAMS.traits;
const N = PARAMS.names;

function shareIn<V>(table: W<V>, v: V): number {
  let tot = 0, hit = 0;
  for (const e of table) { tot += e.w; if (e.v === v) hit += e.w; }
  return hit / tot;
}
export function tierOfShare(s: number): Tier {
  const t = PARAMS.rarity.shareTiers;
  return s < t.mythic ? 'mythic' : s < t.epic ? 'epic' : s < t.rare ? 'rare' : s < t.uncommon ? 'uncommon' : 'common';
}
export function tierOfScore(score: number): Tier {
  const c = PARAMS.rarity.tierCutoffs;
  return score >= c.mythic ? 'mythic' : score >= c.epic ? 'epic' : score >= c.rare ? 'rare' : score >= c.uncommon ? 'uncommon' : 'common';
}

const paletteTable: W<string> = PARAMS.palettes.map((p) => ({ v: p.id, w: p.weight }));
export const paletteById = (id: string): PaletteDef => PARAMS.palettes.find((p) => p.id === id)!;

function resolvePalette(def: PaletteDef, rng: Rng, horizon: Horizon): ResolvedPalette {
  const hue = rng.range(-7, 7);
  const chroma = rng.range(0.93, 1.08);
  const lift = rng.range(-0.012, 0.012);
  const c = {} as Record<PaletteRole, RGB>;
  for (const role of Object.keys(def.roles) as PaletteRole[]) {
    const base = hex(def.roles[role]);
    const soft = role === 'light' ? 0.35 : 1; // keep the hot light close to canon
    c[role] = adjust(base, { dh: hue * soft, c: lerp(1, chroma, soft), dl: lift * soft });
  }
  const hz = PARAMS.horizons[horizon]!;
  const tint = hex(hz.tint);
  const bloomLight = mix(c.light, tint, hz.tintAmount);
  const haze = mix(c.glass, tint, hz.tintAmount * 0.8);
  const spectral = !!def.spectral;
  const h0 = rng.range(0, 360);
  const walk = (t: number): RGB => {
    if (spectral) return oklchToRgb(0.78, 0.15, (h0 + clamp(t) * 330) % 360);
    return mix(c.mid, c.glass, clamp(t));
  };
  return { def, id: def.id, spectral, c, bloomLight, haze, walk };
}

export interface DeriveOpts {
  /** the keeper's latest turn; null/undefined = drifted to the seed's native horizon */
  horizon?: Horizon | null;
  /** the sealed sky; null/undefined = not yet known */
  sky?: string | null;
}

export function deriveTraits(seed: string, opts: DeriveOpts = {}): Traits {
  const ctx = seedCtx(seed);
  const eff = effectiveHorizon({ ...mintToken(0, seed), turn: opts.horizon ?? null });
  const hz = PARAMS.horizons[eff.horizon]!;

  // ── body: seed only ──────────────────────────────────────────────
  const rb = ctx.stream('body');
  const paletteId = rb.weighted(paletteTable);
  const body = {
    palette: paletteId,
    sheets: rb.weighted(T.sheets),
    interface: rb.weighted(T.interface) as InterfaceKind,
    growth: rb.weighted(T.growth) as GrowthKind,
    glass: rb.weighted(T.glass) as GlassKind,
    grain: rb.weighted(T.grain) as GrainKind,
    dust: rb.weighted(T.dust) as DustKind,
  };
  const def = paletteById(paletteId);
  const colors = resolvePalette(def, ctx.stream('palette-jitter'), eff.horizon);

  // ── bloom: bloomSeed = keccak(seed, horizon, sky) ────────────────
  const revealed = !!opts.sky;
  const bSeed = revealed ? bloomSeed(seed, eff.horizon, opts.sky!) : null;
  const rl = bSeed ? streamOf(bSeed, 'bloom') : ctx.stream('provisional-bloom');
  const bloom = {
    form: rl.weighted(T.form) as FormKind,
    petals: rl.weighted(T.petals),
    rings: rl.weighted(T.rings),
    light: rl.weighted(T.light) as LightKind,
    inclusion: rl.weighted(T.inclusion) as InclusionKind,
  };

  // ── report ───────────────────────────────────────────────────────
  const list: TraitEntry[] = [];
  let score = 0;
  const add = <V>(
    key: string, label: string, table: W<V>, v: V, display: string,
    group: TraitEntry['group'], sealed = false,
  ) => {
    const share = sealed ? NaN : shareIn(table, v);
    if (!sealed) score += -Math.log(share);
    list.push({ key, label, value: sealed ? 'Sealed' : display, share, tier: sealed ? 'common' : tierOfShare(share), group, sealed });
  };
  add('palette', 'Palette', paletteTable, paletteId, def.name, 'body');
  add('sheets', 'Sheets', T.sheets, body.sheets, String(body.sheets), 'body');
  add('interface', 'Interface', T.interface, body.interface, N.interface[body.interface], 'body');
  add('growth', 'Growth', T.growth, body.growth, N.growth[body.growth], 'body');
  add('glass', 'Glass', T.glass, body.glass, N.glass[body.glass], 'body');
  add('grain', 'Grain', T.grain, body.grain, N.grain[body.grain], 'body');
  add('dust', 'Dust', T.dust, body.dust, N.dust[body.dust], 'body');
  const sealed = !revealed;
  add('form', 'Form', T.form, bloom.form, N.form[bloom.form], 'bloom', sealed);
  add('petals', 'Petals', T.petals, bloom.petals, String(bloom.petals), 'bloom', sealed);
  add('rings', 'Rings', T.rings, bloom.rings, String(bloom.rings), 'bloom', sealed);
  add('light', 'Light', T.light, bloom.light, N.light[bloom.light], 'bloom', sealed);
  add('inclusion', 'Inclusion', T.inclusion, bloom.inclusion, N.inclusion[bloom.inclusion], 'bloom', sealed);
  list.push({
    key: 'horizon', label: 'Horizon', value: hz.name + (eff.turned ? '' : ' (drifted)'),
    share: eff.turned ? 0.25 : 0.25, tier: 'common', group: 'keeper', sealed: false,
  });

  // ── a title ──────────────────────────────────────────────────────
  const rt = ctx.stream('title');
  const word = rt.pick(def.words);
  const title = revealed ? `${word} ${rt.pick(N.nouns[bloom.form]!)}` : `${word} Seed`;

  return {
    seed, bloomSeed: bSeed, revealed,
    horizon: { index: eff.horizon, id: hz.id, name: hz.name, turned: eff.turned },
    body, bloom, colors, list, score,
    tier: revealed ? tierOfScore(score) : null,
    title,
  };
}

export { nativeHorizon };
