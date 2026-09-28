// Public API of the generator.
export { PARAMS, type Params, type PaletteDef, type HorizonDef } from './params.ts';
export * from './clock.ts';
export * from './mechanic.ts';
export { deriveTraits, tierOfShare, tierOfScore, paletteById, type Traits, type TraitEntry, type Tier, type ResolvedPalette } from './traits.ts';
export { renderPiece, renderPieceAsync, composite, paint, resolvePiece, makeCanvas, LAYER_ORDER, type Piece, type Motion, type RenderOpts } from './render.ts';
export type { PieceState, LayerId, LayerOut } from './layers/types.ts';
export { randomSeed, normalizeSeed, isSeed, seedFromText, keccakHex } from './rng.ts';
export { setParam, getParam, resetParams, defaultParam } from './paramsTools.ts';
export { layout, type Layout } from './geometry.ts';
