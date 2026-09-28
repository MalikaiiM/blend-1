// Generate the 512 seeds from a master secret held OUTSIDE the repo, and compute the provenance hash.
//
//   HALOCLINE_MASTER="<long random secret>" npm run provenance -- [--count 512] [--out provenance-out]
//   npm run provenance -- --verify provenance-out/seeds.json <provenanceHash>
//
// seed_i = keccak256(master ‖ "halocline-seed" ‖ uint256(i))
// provenanceHash = keccak256(seed_0 ‖ … ‖ seed_{n-1})    ← publish this BEFORE the mint opens
// The master secret never leaves your machine; publish seeds.json only AFTER mint-out and the start offset are fixed.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { keccakHex, u256 } from '../src/art/rng.ts';
import { provenanceHash } from '../src/art/mechanic.ts';
import { deriveTraits } from '../src/art/traits.ts';

const argv = process.argv.slice(2);
const flag = (k: string) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };

if (argv[0] === '--verify') {
  const seeds: string[] = JSON.parse(readFileSync(argv[1]!, 'utf8')).seeds;
  const h = provenanceHash(seeds);
  const want = argv[2]!.toLowerCase().replace(/^0x/, '');
  console.log(h === want ? `OK  ${seeds.length} seeds hash to ${h}` : `MISMATCH\n  computed ${h}\n  expected ${want}`);
  process.exit(h === want ? 0 : 1);
}

const master = process.env.HALOCLINE_MASTER;
if (!master || master.length < 32) {
  console.error('Set HALOCLINE_MASTER to a long random secret (≥ 32 chars), kept outside this repo. e.g.  export HALOCLINE_MASTER="$(openssl rand -hex 32)"');
  process.exit(1);
}
const count = Number(flag('count') ?? 512);
const outDir = flag('out') ?? 'provenance-out';

const seeds = Array.from({ length: count }, (_, i) => keccakHex(master, 'halocline-seed', u256(i)));
if (new Set(seeds).size !== count) throw new Error('duplicate seeds — impossible unless the master is broken');
const hash = provenanceHash(seeds);

// A quick look at what these 512 contain (body traits only — the bloom is sealed until the sky).
const tally: Record<string, Record<string, number>> = {};
for (const s of seeds) {
  const t = deriveTraits(s);
  for (const e of t.list.filter((x) => x.group === 'body')) (tally[e.label] ??= {})[e.value] = (tally[e.label]![e.value] ?? 0) + 1;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'seeds.json'), JSON.stringify({ edition: count, provenanceHash: hash, seeds }, null, 1));
writeFileSync(join(outDir, 'provenance.txt'), `edition ${count}\nprovenanceHash 0x${hash}\n`);
console.log(`wrote ${outDir}/seeds.json and provenance.txt`);
console.log(`\nprovenanceHash = 0x${hash}\n`);
console.log('Body-trait tally across the edition:');
for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(10)} ${Object.entries(v).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(' · ')}`);
console.log('\nNext: npm run audit:pixels -- --seeds ' + join(outDir, 'seeds.json') + '   (every seed must pass the quality gates)');
console.log('Do NOT commit provenance-out/ or the master secret. Publish seeds.json only after mint-out and setStartOffset.');
