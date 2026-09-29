# Halocline

> *Five hundred and twelve seeds from the Glass Sea.*

A generative-art drop in one folder: the **art** (an original, seed-deterministic generator), the **website** (a gallery-grade
showcase with a working simulator of the drop), and the **playbook** (a 60-day launch checklist).

Each piece starts as a dim, half-formed **seed**. It grows for four tides (28 days = 201,600 blocks) on the block clock, its
layers of coloured glass settling one over another. At the reveal block the sky opens and the seed **blooms** — toward the
horizon (Dawn, Dusk, Zenith or Nadir) its keeper turned it to, with rare traits drawn from a sealed sky that no one can steer.

| | |
|---|---|
| `LAUNCH.md` | the playbook: T-30 → T+30, mint-day runbook, fair reveal, marketing calendar, launch thread, owner-only steps |
| `docs/DESIGN.md` | the world and myth, the mechanic, the art system, the site's design system — the source of truth |
| `docs/AUDIT.md` | generated: 1,000-seed trait and pixel audits (rarity, weak-output gates) |
| `src/art/` | the generator. `params.ts` is **PARAMS**, every tunable in one object |
| `src/site/` | the website (Vite + TypeScript, no UI kit) |
| `scripts/` | lab renderer, audits, gallery curation, screenshot harness, provenance, canonical renders |

## Run it

Needs **Node 20.19+ or 22.12+**. Clone somewhere *outside* `Desktop`, `Documents` and `Downloads` — macOS privacy protection can
block a background dev server from reading files there (that is the `EPERM: operation not permitted` error).

```bash
git clone https://github.com/MalikaiiM/blend-1.git
cd blend-1
git checkout claude/cool-wozniak-xddskz      # the branch this was built on
npm install
npm run dev                                   # opens your browser on the address it chose
```

`npm run dev` **never takes a port that something else is already using.** It starts looking at 5173, skips any port another program
answers on (including forgotten dev servers from other projects — the usual cause of "Internal Server Error" pages that are not this
site), opens the browser on the one it picked, and prints the address. Use that address, not a bookmarked `localhost:5173`.
The art lab lives next to the site at `<that address>/lab.html` (seed box, block scrubber, layer solo).

```bash
npm run build          # type-check + production build into dist/
npm run preview        # serve the build — also on a free port (starts at 4173)
npm test               # mechanic vectors, clock, provenance
npm run dev:raw        # plain `vite`, if you want to manage the port yourself
```

## The art in one paragraph

A piece is a pure function `f(seed, block, horizon, sky)`. The **seed** is 64 hex characters; every random draw comes from a
named stream derived from it (`src/art/rng.ts`), so the same seed always gives the same image. **Time** enters only through
the block (`src/art/clock.ts`). Six depth layers — *Abyss, Sheets, Threads, Lumen (+ Inclusion), Veil* — differ in scale, value,
blur and saturation, and are finished with a **grain** layer; they stack like light through glass. See
[docs/DESIGN.md](docs/DESIGN.md) §4.

* **Body traits** (palette, sheets, interface, growth, glass, grain, dust) come from the seed and are visible from block 0.
* **Bloom traits** (form, petals, rings, light, inclusion) come from `keccak256(seed, horizon, sky)` and stay sealed until the reveal.
* Every render reports its traits with their odds: `deriveTraits(seed, { horizon, sky })`.

## The mechanic in one paragraph

The holder's one action is **the Turn**: face your seed toward a horizon before the Still Hour (one hour before the reveal).
It is free, repeatable, inheritable, and the rare traits are blind to it. `src/art/mechanic.ts` is the reference model of the
contract logic and `tests/mechanic.test.ts` pins its vectors. The website's simulator runs on that same code.

## Tooling

| command | what it does |
|---|---|
| `node scripts/lab.mjs shot --seed foo --stage bloomed --horizon dawn --out a.png` | render any state to a PNG (also `layers`, `sheet`, `strip`, `info`) |
| `npm run audit:traits` | 20,000-seed statistics: odds vs realised, horizon independence, trait independence, rarity tiers |
| `npm run audit:pixels` | render 1,000 seeds in headless Chromium, measure them, fail the weak ones |
| `npm run test:determinism` | same seed → byte-identical image across browser sessions; draft ≈ full composition |
| `node scripts/pick-gallery.ts` | curate the 24 gallery pieces from the audit |
| `node scripts/shoot.mjs --out screenshots/x` | screenshot every section at phone and desktop sizes |
| `HALOCLINE_MASTER=… npm run provenance` | generate the 512 seeds from a secret you hold, and the provenance hash |
| `npm run render:canonical -- --seeds seeds.json` | final PNGs + metadata for the collection |

## What this repo does not do

It contains **no wallet code, no keys, no contract deployment and no mainnet anything**. The Mint button is disabled and the site never
asks for a wallet. Everything that signs a transaction, spends money or posts publicly is listed for you, and only you, at the end of
`LAUNCH.md`.
