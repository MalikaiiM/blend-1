// Gallery data: the curated pieces, resolved into what the UI needs (traits, facets, placeholder tints).
// Nothing here depends on which seeds are curated — everything is derived at runtime.

import { PARAMS, STAGES, deriveTraits, type PieceState, type StageName, type Traits } from '../../art/index.ts';
import { GALLERY } from '../../data/gallery.ts';

export type FacetKey = 'palette' | 'horizon' | 'inclusion' | 'light' | 'form';
export interface Facet { key: FacetKey; label: string; order: string[] }

/** The filter groups, in display order. `order` is the canonical order of every value the art can produce. */
export const FACETS: Facet[] = [
  { key: 'palette', label: 'Palette', order: PARAMS.palettes.map((p) => p.name) },
  { key: 'horizon', label: 'Horizon', order: PARAMS.horizons.map((h) => h.name) },
  { key: 'inclusion', label: 'Inclusion', order: Object.values(PARAMS.names.inclusion) },
  { key: 'light', label: 'Light', order: Object.values(PARAMS.names.light) },
  { key: 'form', label: 'Form', order: Object.values(PARAMS.names.form) },
];

export interface Item {
  idx: number;
  no: number;
  /** '0037' */
  code: string;
  /** 'No. 0037' */
  label: string;
  seed: string;
  horizon: 0 | 1 | 2 | 3;
  sky: string;
  traits: Traits;
  title: string;
  paletteName: string;
  horizonName: string;
  /** accessible name of the artwork */
  alt: string;
  facets: Record<FacetKey, string>;
  /** the piece's own palette, for the placeholder tint (CSS custom properties) */
  vars: Record<string, string>;
}

export type Sel = Record<FacetKey, Set<string>>;
export const emptySel = (): Sel => ({ palette: new Set(), horizon: new Set(), inclusion: new Set(), light: new Set(), form: new Set() });
export const selSize = (s: Sel) => FACETS.reduce((n, f) => n + s[f.key].size, 0);

/** Within a group values are OR-ed; across groups they are AND-ed. `except` leaves one group out (for faceted counts). */
export function matches(it: Item, sel: Sel, except?: FacetKey): boolean {
  for (const f of FACETS) {
    if (f.key === except) continue;
    const s = sel[f.key];
    if (s.size && !s.has(it.facets[f.key])) return false;
  }
  return true;
}

export const codeOf = (no: number) => String(no).padStart(4, '0');

export function buildItems(): Item[] {
  return GALLERY.map((e, idx) => {
    const traits = deriveTraits(e.seed, { horizon: e.horizon, sky: e.sky });
    const roles = traits.colors.def.roles;
    const hz = PARAMS.horizons[e.horizon]!;
    const code = codeOf(e.no);
    return {
      idx, no: e.no, code, label: `No. ${code}`,
      seed: e.seed, horizon: e.horizon, sky: e.sky, traits,
      title: traits.title,
      paletteName: traits.colors.def.name,
      horizonName: hz.name,
      alt: `${traits.title}, No. ${code}: ${traits.colors.def.name}, turned toward ${hz.name}`,
      facets: {
        palette: traits.colors.def.name,
        horizon: hz.name,
        inclusion: PARAMS.names.inclusion[traits.bloom.inclusion],
        light: PARAMS.names.light[traits.bloom.light],
        form: PARAMS.names.form[traits.bloom.form],
      },
      vars: {
        '--pal-void': roles.void, '--pal-deep': roles.deep, '--pal-mid': roles.mid, '--pal-glass': roles.glass,
        '--ax': `${Math.round(hz.anchor[0] * 100)}%`, '--ay': `${Math.round(hz.anchor[1] * 100)}%`,
      },
    };
  });
}

export function applyVars(node: HTMLElement, vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) node.style.setProperty(k, v);
}

/** The state of a piece at a named moment on the clock. */
export const stateAt = (it: Item, block: number): PieceState => ({ block, horizon: it.horizon, sky: it.sky });

/** The seven stills of the growth strip. */
export interface Stage { name: StageName; label: string; long: string }
export const STRIP: Stage[] = [
  { name: 'seed', label: 'Seed', long: 'The seed, block 0' },
  { name: 'tide2', label: 'Tide II', long: 'Midway through the second tide' },
  { name: 'tide4', label: 'Tide IV', long: 'Midway through the fourth tide' },
  { name: 'still', label: 'Still Hour', long: 'The Still Hour, turning closed' },
  { name: 'reveal', label: 'Reveal', long: 'The reveal block, the bud taut' },
  { name: 'opening', label: 'Opening', long: 'The bloom, half open' },
  { name: 'bloomed', label: 'Bloomed', long: 'Bloomed, final' },
];
export const BLOOMED = STRIP.length - 1;
export const blockOf = (s: Stage): number => STAGES[s.name];

/** '26%' · '0.8%' */
export function pct(share: number): string {
  if (!Number.isFinite(share)) return '—';
  const p = share * 100;
  return (p < 10 ? p.toFixed(1) : String(Math.round(p))) + '%';
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
