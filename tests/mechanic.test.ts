import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bloomSeed, effectiveHorizon, isTurnOpen, mintToken, nativeHorizon, skyOf, turn, MechanicError,
  TURN_CLOSE_BLOCK, REVEAL_BLOCK, BLOOM_END_BLOCK, GROWTH_BLOCKS, timeline, rulesInPlainEnglish, commitmentOf,
} from '../src/art/index.ts';
import { seedFromText, keccakHex } from '../src/art/rng.ts';

const SEED = seedFromText('halocline-vector-1');
const SALT = seedFromText('artist-salt-vector');
const HASH = seedFromText('blockhash-vector');

test('clock constants', () => {
  assert.equal(GROWTH_BLOCKS, 4 * 7 * 7200);
  assert.equal(REVEAL_BLOCK, 201_600);
  assert.equal(TURN_CLOSE_BLOCK, 201_300);
  assert.equal(BLOOM_END_BLOCK, 208_800);
});

test('timeline phases', () => {
  assert.equal(timeline(0).phase, 'seed');
  assert.equal(timeline(1).phase, 'growing');
  assert.equal(timeline(TURN_CLOSE_BLOCK - 1).phase, 'growing');
  assert.equal(timeline(TURN_CLOSE_BLOCK).phase, 'still');
  assert.equal(timeline(REVEAL_BLOCK).phase, 'opening');
  assert.equal(timeline(BLOOM_END_BLOCK).phase, 'bloomed');
  assert.equal(timeline(REVEAL_BLOCK).revealed, true);
  assert.equal(timeline(REVEAL_BLOCK - 1).revealed, false);
  assert.equal(timeline(1e9).bloom, 1);
  // drift freezes at the reveal so the final image never moves
  assert.equal(timeline(REVEAL_BLOCK).drift, timeline(REVEAL_BLOCK + 5000).drift);
});

test('turning: open until the Still Hour, last turn wins, drift is uniform', () => {
  let tok = mintToken(7, SEED);
  assert.equal(effectiveHorizon(tok).turned, false);
  tok = turn(tok, 2, 100);
  tok = turn(tok, 1, 5000);
  assert.deepEqual(effectiveHorizon(tok), { horizon: 1, turned: true });
  assert.equal(tok.turns, 2);
  assert.ok(isTurnOpen(TURN_CLOSE_BLOCK - 1));
  assert.ok(!isTurnOpen(TURN_CLOSE_BLOCK));
  assert.throws(() => turn(tok, 0, TURN_CLOSE_BLOCK), (e: unknown) => e instanceof MechanicError && e.code === 'closed');
  assert.throws(() => turn(tok, 4, 10), (e: unknown) => e instanceof MechanicError && e.code === 'invalid');
  // native horizon roughly uniform over 2,000 seeds
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 2000; i++) counts[nativeHorizon(seedFromText('n' + i))]!++;
  for (const c of counts) assert.ok(c > 400 && c < 600, `native horizon skew: ${counts}`);
});

test('pinned hash vectors (a contract must reproduce these bit for bit)', () => {
  assert.equal(nativeHorizon(SEED), 0 | (parseInt(keccakHex(SEED, 'native').slice(0, 2), 16) % 4));
  const sky = skyOf(SALT, HASH, 7);
  assert.match(sky, /^[0-9a-f]{64}$/);
  assert.equal(sky, skyOf(SALT, HASH, 7));
  assert.notEqual(sky, skyOf(SALT, HASH, 8));
  const b0 = bloomSeed(SEED, 0, sky), b1 = bloomSeed(SEED, 1, sky);
  assert.notEqual(b0, b1);
  assert.equal(commitmentOf(SALT), keccakHex(SALT));
  // printed for the record: run `npm test` with VECTORS=1 to see them
  if (process.env.VECTORS) console.log({ SEED, SALT, HASH, native: nativeHorizon(SEED), sky, bloom0: b0, commit: commitmentOf(SALT) });
});

test('rules read numbers from PARAMS', () => {
  const rules = rulesInPlainEnglish();
  assert.ok(rules.length >= 6);
  assert.ok(rules.some((r) => r.body.includes('201,600')));
});

test('provenance + blind assignment', async () => {
  const { provenanceHash, seedForToken, startOffsetOf } = await import('../src/art/mechanic.ts');
  const seeds = Array.from({ length: 512 }, (_, i) => seedFromText('p' + i));
  const h = provenanceHash(seeds);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, provenanceHash(seeds));
  assert.notEqual(h, provenanceHash([...seeds.slice(1), seeds[0]!])); // order matters
  const off = startOffsetOf(HASH, 512);
  assert.ok(off >= 0 && off < 512);
  assert.equal(seedForToken(seeds, off, 0), seeds[off]);
  assert.equal(seedForToken(seeds, off, 511), seeds[(511 + off) % 512]);
  // every seed is assigned exactly once
  const set = new Set(Array.from({ length: 512 }, (_, id) => seedForToken(seeds, off, id)));
  assert.equal(set.size, 512);
});

test('pinned vectors — a Solidity port must reproduce these bit for bit', async () => {
  const { provenanceHash, seedForToken, startOffsetOf, nativeHorizon, skyOf, bloomSeed, commitmentOf } = await import('../src/art/mechanic.ts');
  // keccak-256 (not SHA3-256): the empty-string vector everyone knows
  assert.equal(keccakHex(new Uint8Array(0) as any), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  const SEED = '45e40c795fecc25c32d9663e5f445a28db75858bd17f086b6f32bb7de7f03c9a';
  const SALT = '71a37a36ac4076f32aa7b4492186198029cee6514878d033ee362ddef6d03b1d';
  const BH = 'b6db806c7bf11117c048fca5fce39e8f22caa9aabffbcca34a7c1c1bfcf9c2ff';
  assert.equal(SEED, seedFromText('halocline-vector-1'));
  assert.equal(nativeHorizon(SEED), 0);
  assert.equal(commitmentOf(SALT), '726a6e39d8663e05752461810471a2e260e1423e0751097d7747e050b50eed9c');
  const sky = skyOf(SALT, BH, 7);
  assert.equal(sky, '6672a0b277d3af29f7f2b5567cf8672e4ba6591ae9af4056271da63306a512c5');
  assert.equal(bloomSeed(SEED, 0, sky), '65be6f360c1d394498c66ecb59312344be42ee3dc6b895ac922a87e1827b3ac5');
  assert.equal(bloomSeed(SEED, 3, sky), 'bfbbf18b1f801e42f4e4ac8eba52569fec492fc99210982bc90199b93e3ffe48');
  // startOffset = uint256(keccak256(blockhash ‖ "offset")) % 512  (keccak = c766…4599 → low 9 bits 0x199)
  assert.equal(keccakHex(BH, 'offset'), 'c76619314dc0eaaf8109aec5464b3885ca54032d098abdf04394e96f979e4599');
  assert.equal(startOffsetOf(BH, 512), 409);
  const seeds = Array.from({ length: 512 }, (_, i) => seedFromText('p' + i));
  assert.equal(provenanceHash(seeds), 'fb2a9e0e09c82f30410de938327ce1b2a68f2f0941c1cc2260eee1eacb69b3ef');
  assert.equal(seeds[0], 'fe1703dbe8a9115ed486af41105cac12e260e614269d85a2a0effad6af6dbdc6');
  assert.equal(seedForToken(seeds, 409, 0), seeds[409]);
  assert.equal(seedForToken(seeds, 409, 103), seeds[0]); // (103 + 409) % 512 = 0
  assert.equal(seedForToken(seeds, 0, 511), seeds[511]);
  assert.equal(seedForToken(seeds, 1, 511), seeds[0]);
});
