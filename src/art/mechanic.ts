// The reference model of the on-chain rules. It is pure and tiny on purpose:
// a contract author can port it line for line, and the tests pin its vectors.
//
//   nativeHorizon = uint8(keccak256(seed, "native")[0]) % 4
//   sky           = keccak256(artistSalt, blockhash(REVEAL), uint256(tokenId))
//   bloomSeed     = keccak256(seed, uint8(horizon), sky)
//
// (all packed like abi.encodePacked; seed/salt/sky/blockhash are bytes32.)

import { PARAMS } from './params.ts';
import { keccakHex, u8, u256 } from './rng.ts';
import { TURN_CLOSE_BLOCK, REVEAL_BLOCK } from './clock.ts';

export type Horizon = 0 | 1 | 2 | 3;
export const HORIZON_COUNT = 4;
export const HORIZON_IDS = PARAMS.horizons.map((h) => h.id);
export const HORIZON_NAMES = PARAMS.horizons.map((h) => h.name);

export class MechanicError extends Error {
  code: 'closed' | 'invalid';
  constructor(code: 'closed' | 'invalid', message: string) {
    super(message);
    this.code = code;
  }
}

export interface TokenState {
  id: number;
  seed: string;
  /** the keeper's latest turn; null = never turned */
  turn: Horizon | null;
  turnBlock: number | null;
  /** how many times the seed has been turned (informational — only the last counts) */
  turns: number;
}

export const mintToken = (id: number, seed: string): TokenState => ({ id, seed, turn: null, turnBlock: null, turns: 0 });

/** The horizon a seed drifts to if nobody ever turns it. Uniform over the four. */
export function nativeHorizon(seed: string): Horizon {
  return (parseInt(keccakHex(seed, 'native').slice(0, 2), 16) % HORIZON_COUNT) as Horizon;
}

export const isTurnOpen = (block: number) => block < TURN_CLOSE_BLOCK;

/**
 * THE action. Free (gas only), repeatable, open to every keeper on the same
 * terms until the Still Hour. Only the last turn before it closes counts.
 */
export function turn(tok: TokenState, horizon: number, block: number): TokenState {
  if (!Number.isInteger(horizon) || horizon < 0 || horizon >= HORIZON_COUNT)
    throw new MechanicError('invalid', 'A seed can face Dawn, Dusk, Zenith or Nadir — nothing else.');
  if (!isTurnOpen(block)) throw new MechanicError('closed', 'The Still Hour has begun. The seeds hold still.');
  return { ...tok, turn: horizon as Horizon, turnBlock: block, turns: tok.turns + 1 };
}

export function effectiveHorizon(tok: TokenState): { horizon: Horizon; turned: boolean } {
  return tok.turn === null ? { horizon: nativeHorizon(tok.seed), turned: false } : { horizon: tok.turn, turned: true };
}

/** The sealed sky: unknowable until the reveal block, and not steerable by either side. */
export function skyOf(artistSalt: string, blockhashAtReveal: string, tokenId: number): string {
  return keccakHex(artistSalt, blockhashAtReveal, u256(tokenId));
}

export function bloomSeed(seed: string, horizon: number, sky: string): string {
  return keccakHex(seed, u8(horizon), sky);
}

/** What the website uses to *rehearse* a reveal — clearly not the real sky. */
export function rehearsalSky(n: number): string {
  return keccakHex('halocline-rehearsal', u256(n));
}

/** A deterministic sky for a standalone seed (gallery, hero) so it always has a bloom. */
export function selfSky(seed: string): string {
  return keccakHex(seed, 'self-sky');
}

export function commitmentOf(artistSalt: string): string {
  return keccakHex(artistSalt);
}

/**
 * Provenance: keccak256 of the packed 512 seeds in order (bytes32 each). Committed before mint.
 *   seedForToken(seeds, startOffset, tokenId) = seeds[(tokenId + startOffset) % seeds.length]
 * startOffset is fixed once, after mint-out, from a future blockhash — so ids are minted blind.
 */
export function provenanceHash(seeds: string[]): string {
  return keccakHex(...seeds);
}
export function seedForToken(seeds: string[], startOffset: number, tokenId: number): string {
  return seeds[(tokenId + startOffset) % seeds.length]!;
}
/** startOffset = uint256(keccak256(abi.encodePacked(blockhash(offsetBlock), "offset"))) % edition */
export function startOffsetOf(blockhash: string, edition: number): number {
  return Number(BigInt('0x' + keccakHex(blockhash, 'offset')) % BigInt(edition));
}

export const REVEAL = REVEAL_BLOCK;
export const TURN_CLOSE = TURN_CLOSE_BLOCK;

/** The rules, in plain English, with every number read from PARAMS so prose can't drift from code. */
export function rulesInPlainEnglish() {
  const c = PARAMS.clock;
  const days = c.tides * c.tideDays;
  const still = c.stillHourBlocks;
  const stillH = Math.round((still * c.blockSeconds) / 360) / 10;
  return [
    {
      title: 'One action',
      body: `Between the mint and the last hour before the reveal, a keeper may turn their seed toward one of four horizons — Dawn, Dusk, Zenith or Nadir. That is the only thing a keeper does.`,
    },
    {
      title: 'Free and equal',
      body: `Turning costs gas and nothing else. No fee, no payment, no allow-list, no bonus for owning more. Every seed gets the same four choices on the same terms.`,
    },
    {
      title: 'The last turn counts',
      body: `You may turn again as often as you like. Only the last turn before the Still Hour is kept. If you sell, the next keeper inherits the choice — and may change it.`,
    },
    {
      title: 'Doing nothing is a choice too',
      body: `A seed that is never turned drifts to its native horizon, fixed by its own seed and evenly spread across all four. Drifted seeds are never penalised and never favoured.`,
    },
    {
      title: 'The Still Hour',
      body: `${still.toLocaleString('en-US')} blocks (about ${stillH} hour) before the reveal, turning closes. Nobody can react to anything, because the sky is not yet known.`,
    },
    {
      title: 'The sealed sky',
      body: `At block ${(days * c.blocksPerDay).toLocaleString('en-US')} — day ${days} — the sky opens: a value mixed from the artist's pre-committed salt, the hash of the reveal block, and the token id. Neither the artist nor a validator can steer it alone.`,
    },
    {
      title: 'Rarity is blind to your choice',
      body: `Your horizon sets the light and the composition. The rare traits — the form, the petal count, any inclusion — are drawn from the seed, your horizon and the sealed sky together. Every horizon has exactly the same odds of every trait.`,
    },
    {
      title: 'The bloom',
      body: `From the reveal block the bloom opens over ${c.bloomBlocks.toLocaleString('en-US')} blocks (one day). After that, the piece never changes again.`,
    },
  ];
}
