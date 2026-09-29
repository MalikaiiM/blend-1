# HALOCLINE — design bible

> *Five hundred and twelve seeds from the Glass Sea.*
> Each one starts dim and half-formed, grows for four tides on the block clock, and on the reveal date blooms
> into its final form — turned toward a horizon by the hand that kept it.

This is the source of truth for the art, the site, the mechanic and the launch. If code and this document
disagree, fix whichever is wrong and keep them in step. Numbers in prose come from `src/art/params.ts`.

---

## 1. The world and its myth

**The Glass Sea.** Before there were days there was only a black, patient water that kept every light that
ever fell into it. Light does not drown there. It *settles* — sheet on sheet, each a different age and a
different colour, laid down so exactly that they never mix. The shimmer where two sheets meet is called a
**halocline**.

**The tidekeepers.** The people of the shore learned to lift one sheet out of the deep: a **seed** — cold, dim,
half-formed, heavy as a pane of window. A seed cannot bloom alone. It keeps time by the **Tide**, the shore's
slow clock: one beat every twelve seconds (a *block*), a day every 7,200 beats, a great swell every seven days.
It needs **four tides** to wake its four depths: the **Deep**, the **Sheets**, the **Threads**, the **Lamp**.

**The turning.** On the last nights the keeper turns the seed toward a **horizon** — **Dawn**, **Dusk**,
**Zenith** or **Nadir** — and that is all the keeper does. A seed cannot see the future, but it can feel which
way it is facing. When the fourth tide breaks, the *sky opens* (a value no one can know beforehand) and the whole
night of gathered light comes through the seed — coloured by everything it passed through, shaped by the
direction it was held, and by the sky.

**Why they grow:** because a sheet of settled light is still slowly settling.
**Why the keeper matters:** because a seed only knows one thing about the future — which way its keeper faced it.
*No two keepers turn a seed alike. That is why no two blooms are.*

### Vocabulary (use these words, consistently)

| Word | Meaning |
|---|---|
| **seed** | a piece before the reveal (dim, half-formed, growing) |
| **bloom** | a piece after the reveal (final form) |
| **keeper** | the wallet holding a seed; never "owner" or "holder" in copy |
| **the Tide / a tide** | the clock / one week (50,400 blocks); four tides = 28 days |
| **block** | one beat of the Tide (12 s) |
| **horizon** | Dawn · Dusk · Zenith · Nadir — the one thing a keeper chooses |
| **turn** | the action: face your seed toward a horizon |
| **drift** | a seed that was never turned faces its *native* horizon |
| **Still Hour** | the final 300 blocks (≈1 h) before the reveal; turning is closed |
| **the sky / sealed sky** | the unknowable reveal entropy |
| **the sheets** | the stacked glass layers (haloclines) |

---

## 2. The drop (numbers live in `PARAMS.drop` / `PARAMS.clock`)

* **Edition:** 512 seeds. Price shown as a placeholder (0.05 ETH). Mint button on the site is disabled.
* **Mint opens** Thu 12 Nov 2026 17:00 UTC → block 0 of the piece clock. (Placeholder dates; change in one place.)
* **Growth:** 4 tides × 7 days = 28 days = **201,600 blocks**. Reveal = **Thu 10 Dec 2026 17:00 UTC**.
* **Still Hour:** turning closes at block 201,300 — exactly one hour (300 blocks × 12 s) before the reveal.
* **Bloom:** from the reveal block the bloom opens over 7,200 blocks (one day). At block 208,800 the piece is final and never changes again.
* All seeds share one clock (block 0 = the block the mint opened). A seed minted late in the mint window is simply already a few hours along.

### Growth on the clock (what the viewer sees)

| Tide | Days | What wakes |
|---|---|---|
| — | block 0 | **Seed**: dim (30 % value), half-desaturated (42 % chroma), a faint ember bud, the abyss barely there |
| I · The Deep | 0–7 | abyss deepens into colour; first sheets settle from the bottom |
| II · The Sheets | 7–14 | the halocline completes; first threads reach out |
| III · The Threads | 14–21 | threads lengthen; veil dust and bokeh drift in; colour deepens |
| IV · The Lamp | 21–28 | the bud swells, taut and bright |
| Still Hour | last hour | the seeds hold still |
| Reveal | day 28 | the sky opens; the bud unfolds into its sealed form over one day |

Two slow cycles keep the world alive while it grows and vanish at the reveal (so the final image is frozen):
a **daily pulse** (±4.5 % brightness, `tl.pulse`) and a **drift** of noise fields (`tl.drift`, in days).

---

## 3. The mechanic — *the Turn*

The reference implementation is `src/art/mechanic.ts` (pure, tiny, tested by `tests/mechanic.test.ts`). A Solidity
contract only needs to store `turn[tokenId]` and reproduce three hashes:

```
nativeHorizon = uint8(keccak256(abi.encodePacked(seed, "native"))[0]) % 4
sky           = keccak256(abi.encodePacked(artistSalt, blockhash(REVEAL_BLOCK), uint256(tokenId)))
bloomSeed     = keccak256(abi.encodePacked(seed, uint8(horizon), sky))
```

**Rules (plain English — the site prints these from `rulesInPlainEnglish()`):**

1. **One action.** Turn your seed toward Dawn, Dusk, Zenith or Nadir, any time before the Still Hour.
2. **Free and equal.** Gas only. No fee, no payment, no allow-list, no bonus for owning more.
3. **The last turn counts.** Turn as often as you like. If the seed is sold, the new keeper inherits the choice and may change it.
4. **Doing nothing is a choice.** An unturned seed drifts to its native horizon (uniform over four; from its seed). Never penalised, never favoured.
5. **The Still Hour.** Turning closes 300 blocks before the reveal. Nothing anyone learns can be acted on.
6. **The sealed sky.** `sky` mixes the artist's *pre-committed* salt, the reveal block's hash, and the token id. The artist commits `keccak256(salt)` on-chain before mint; a validator cannot know the salt; the artist cannot know the blockhash.
7. **Rarity is blind to your choice.** The horizon decides *composition and light colour*. The rare traits (form, petals, rings, light class, inclusion) come from `bloomSeed`, i.e. seed + horizon + sky. Every horizon has exactly the same odds of every trait (verified by the audit).
8. **The bloom.** From the reveal block the bloom opens over one day; after that the piece is final.

**Why this is fair.** The action is symmetric (four equal options), free, repeatable, open to everyone until the same block, inheritable
by buyers, and cannot be exploited by rarity-hunting because the rarity roll happens *after* the choice window closes with entropy neither
side controls. The artist's power is limited to what was committed before mint.

**Feedback vs. surprise.** Turning is *felt* immediately: the seed leans, its threads grow from the new anchor, its haze shifts toward
the horizon's tint. What stays sealed is the bloom's form, petal count, rings, light class and any inclusion.
The simulator "rehearses" the reveal with a fake sky (labelled so) — the real bloom differs.

---

## 4. The art system

A piece is a **pure function** `f(seed, block, horizon, sky) → image`:

* `seed` — 64 hex chars (256 bits). Everything derives from it via named RNG streams (`c.rng('label')`, `c.noise('label')`).
* `block` — blocks since mint opened; drives growth (`tl.t`), the daily pulse, drift and the bloom.
* `horizon` — the keeper's last turn or `null` (→ native drift).
* `sky` — the sealed sky (or `null` before reveal; a deterministic self-sky is used if the block is past reveal and none is given).

Same inputs → same image (pixel-exact per browser/engine; composition identical everywhere).

### 4.1 Layers (bottom → top) — the physical model is **light through stacked glass in a dark sea**

Each layer is a module `src/art/layers/<id>.ts` exporting `render(c: LayerCtx) → LayerOut | LayerOut[]`, with its data in
`<id>.params.ts` (plain JSON-serialisable data only; also holds `compose` (blend/alpha/parallax), `knobs`).

| # | Layer | Scale | Value | Blur | Saturation | Parallax |
|---|---|---|---|---|---|---|
| 1 | **abyss** — The Abyss | whole frame; features 40–100 % of the frame | darkest (OKLab L ≈ 0.06–0.22) | extreme: no edges at all | lowest (35–55 % of the palette's chroma) | 0.12 |
| 2 | **strata** — The Sheets | bands 8–35 % of frame height | dark–mid (L ≈ 0.12–0.42) | heavy body, but hairline interface lines stay crisp | medium (60–80 %) | 0.30 |
| 3 | **threads** — The Threads | filaments 0.5–8 px wide, reaching 20–70 % of the frame | mid–bright (L ≈ 0.35–0.8) | glow pass 6–14 px + a crisp core | high (85–100 %) | 0.55 |
| 4 | **lumen** — The Lumen (+ **inclusion**) | petals 15–60 % of the frame | brightest (core ≥ 0.95) | crisp petal edges + broad halation | highest (100 %) | 0.85 / 0.9 |
| 5 | **veil** — The Veil | bokeh 40–160 px (very soft) + dust 1–4 px (sharp) | bright points | bimodal | high | 1.5 |
| + | **texture** — The Grain | 1 px grain, hairline scratches, vignette, gentle grade | – | – | – | 0 |

The depth ladder must be *legible*: cover everything but one layer and the remaining one should clearly differ from its neighbours in
scale, value, blur and saturation. Squint test: abyss → sheets → threads → lamp should read as receding to advancing.

**Material:** glass and light. Sheets *absorb and bend* (multiply / offset-refract what is below, with bright thin interface lines where sheets
meet — the halocline shimmer). Threads and lumen *emit* (screen/additive). Veil is *foreground optics* (bokeh, dust). Grain is the
*medium* (film/tooth). Avoid vector-flat looks: gradients, soft falloffs, overlapping translucency, tiny irregularities.

**Palette use:** six roles (`void deep mid glass light spark`). `c.pal` is already toned for the current moment (dim/desaturated early,
full late; daily pulse). Use `c.pal.*` for drawing; use `c.full.*` only if you need the final colours regardless of growth.
`light` is reserved for the bloom's hottest parts and bright dust; `spark` is a *rare accent* (motes, seam, a single thread family) — never a wash.
Spectral palettes (`c.full.spectral`) use `c.pal.walk(t)` to travel around the hue wheel instead of holding one family.

**Horizon:** `c.lay` gives `cx, cy` (bloom anchor), `axis`/`ax,ay` (direction it opens), `spread` (fan angle), `radial` (Nadir), `R` (full-bloom radius).
Every layer should *lean* toward the horizon: haze concentrated near the anchor, threads born there, sheets tilting toward/away, dust streaming along the axis.
Layers must work on any canvas aspect (4:5 gallery, 1:1, 16:9 hero, 9:16 phone) using `c.w, c.h, c.S, c.lay.*`.

**Growth:** each layer scales itself by `c.grow('<window>')` (0→1) plus `c.tl` (tide, drift…). At `block = 0` the piece is a *dim, half-formed seed* — atmosphere and a faint ember bud, still
beautiful and recognisably *this* seed. At the reveal block the bud is taut and bright (`c.lay.bud ≈ 1`, `c.tl.bloom = 0`), then `c.tl.bloom` 0→1 unfolds it.

**Sealed bloom rule (important):** while `!c.traits.revealed` the sealed traits (`traits.bloom.*`) are *provisional placeholders* — never let them show. At `tl.bloom = 0` every piece's bud is the same generic closed teardrop of `bloomLight`; the
actual form/petals/rings/light/inclusion fade and unfold in with `tl.bloom` (use `smoothstep`s on it). Body traits (`traits.body.*`) are visible from block 0.

**Determinism rules:** no `Math.random`, `Date`, `performance.now`, or any hidden state in what you draw. Randomness only through `c.rng(label)` / `c.noise(label)` (independent named streams — give each of your sub-systems its own label). Time only through `c.tl`
(`t`, `drift`, `pulse`, `dayPhase`, `bloom`). In `draft` quality, scale *counts* with `c.q` but consume the stream identically (generate all N, draw the first ⌈N·q⌉) so composition matches full quality.
Never read `c.traits.bloom.*` unless `c.traits.revealed`.

**Performance budget:** full render at 1000×1250 ≲ 900 ms total in headless Chromium (CPU raster) — each layer ≲ 200 ms; draft at 480×600 ≲ 200 ms total. Prefer: draw big soft things on a **small canvas and upscale** (free blur); pixel loops only on
small buffers; ImageData only when unavoidable. No per-pixel JS loops over the full-size canvas except texture (once).

### 4.2 Traits (odds in `PARAMS.traits`; the audit reports realised shares)

| Group | Trait | Values |
|---|---|---|
| Body (from `seed`, visible from block 0) | Palette | 14 palettes; *Aurora Prism* (spectral) & *Blackglass* (near-mono + one hot accent) are rare |
| | Sheets | 3–7 glass sheets |
| | Interface | Level · Leaning · Fan · Folded (how the sheets lie) |
| | Growth | Silk · Root · Coral · Reed · Storm (thread family) |
| | Glass | Clear · Stained · Frosted · Prismatic (how sheets bend/tint light) |
| | Grain | Fine · Silken · Coarse |
| | Dust | Sparse · Drifting · Snowfall · Starfall |
| Bloom (sealed; from `bloomSeed`) | Form | Lance · Teardrop · Shard · Ribbon · Coronet |
| | Petals | 5 6 7 8 9 10 12 13 (21 rare) |
| | Rings | 2–5 |
| | Light | Lamp · Radiant · Blazing · Nova |
| | Inclusion | None (~74 %) · Kintsugi Seam · Twin Bloom · Eclipse · Aurora Veil · Halo Rings · Comet · Full Spectrum (mythic, <1 %) |
| Keeper | Horizon | Dawn · Dusk · Zenith · Nadir (+ "drifted") |

**Inclusion visuals** (drawn by `inclusion.ts`, on top of the lumen):
* **Kintsugi Seam** — a jagged fracture of molten gold crossing the whole piece, passing through the bloom; sheets subtly offset either side of it.
* **Twin Bloom** — a second, smaller bloom (different rotation) on the far side of the frame, with a thin thread of light joining the two.
* **Eclipse** — a dark disc occluding the bloom's core with a razor corona ring; the petals still glow around it.
* **Aurora Veil** — slow chromatic curtains of light hanging through the whole frame, in front of the sheets.
* **Halo Rings** — a stack of thin concentric luminous rings (some dashed/broken, some with beads) around the anchor.
* **Comet** — one bright streak with a long fading tail crossing the frame diagonally, ahead of the veil.
* **Full Spectrum** — (mythic) the bloom's petals and sheet interfaces walk the entire spectrum; a prism-split edge glow.

Titles: `"<palette word> <form noun>"` after reveal, `"<palette word> Seed"` before.

---

## 5. Website (Vite + TypeScript, no UI kit)

Single page, sections in this order, each with an anchor: **Hero · Story · How it's made · The mechanic · Gallery · Reveal timeline · Mint**.

### Design system
* **Restrained and premium; the art is the hero.** Near-black background (`--void #05060b`), warm off-white ink (`--ink #ece7dc`), muted secondary (`--mute #8f8a7e`), hairlines at ~10 % white. Colour only from the art's palettes: ember `#ff8a50`, verdigris `#6fd4b4`, cobalt `#86aeff`, rose `#ff9fc4`, saffron `#ffcf55`, orchid `#cf88ff`, glacier `#8fe3ff`.
  A section may pick *one* accent, taken from the palette of the render beside it.
* **Two typefaces only:** **Instrument Serif** (display, story prose, big numerals; italics for the mythic voice) and **DM Mono** (labels, data, controls; small caps feel, tracking +0.08em). Self-hosted via `@fontsource`, latin subset, `font-display: swap`.
* **Type scale** (fluid): display 56–160 px serif; H2 40–72; body serif 20–24 with 1.5 line height and ≤ 62 ch measure; mono labels 11–13 px, uppercase, tracked.
* **Space:** 8 px grid; generous — sections breathe (`clamp(96px, 14vw, 200px)` vertical). 16 px side gutter on phone, up to 1440 max content width, art may bleed full width.
* **Motion:** slow, subtle, purposeful. Reveal-on-scroll (opacity + 12 px translate, 900 ms `cubic-bezier(.2,.7,.2,1)`), hero crossfade between seeds, a soft parallax on the hero, exploded-layer easing. **No motion when `prefers-reduced-motion: reduce`** — no parallax loop, no autoplay, instant transitions.
* **Chrome:** no cards-with-shadows, no gradients-as-decoration, no emoji, no icon library. Hairline borders, small mono captions, generous whitespace. Buttons are quiet outlined pills; disabled Mint button is honest about being disabled.
* **Accessibility:** semantic landmarks, real buttons/labels, keyboard focus rings (accent), sufficient contrast, `aria-live` for the simulator's state, canvases get `role="img"` + `aria-label`.
* **Performance:** minimal JS, no framework; lazy-render sections with `IntersectionObserver`; render draft-quality first then full; cache rendered gallery bitmaps; cap DPR; a CSS gradient tinted by the palette shows before the first render lands; fonts preloaded.

### Sections
1. **Hero** — full-viewport live render (parallax + slow breath). Click / tap → a new random seed (crossfade, ~1.4 s). Tiny caption: seed short-hash, palette, horizon. Title *Halocline*, one line: the tagline. A "scroll" cue.
2. **Story** — 5 short passages with a sticky stage that shows a render changing with the passage (Glass Sea → the seed → the four tides → the turning → the bloom). Uses layer subsets / block positions of one hand-picked seed.
3. **How it's made** — the layers pull apart in 3D (CSS perspective, real per-layer canvases), each labelled with its role and lore line; sliders (from `PARAMS.layers.*.knobs`, growth, bloom, separation), a seed box (paste any 64-hex or text) + randomise, hover to isolate a layer.
4. **The mechanic** — the simulator: timeline scrubber over blocks 0 → bloomed with named marks; the Turn control (4 horizons); a piece that reacts; play button; state readout (block, day, tide, phase, blocks to reveal); "rehearse the sky" button; after the reveal, "the four horizons of this seed" comparison. Below it, the rules in plain English (`rulesInPlainEnglish()`).
5. **Gallery** — 24 curated seeds, filter by trait (Palette, Horizon, Inclusion, Light, Form…), grid → detail view (large render, traits with odds, seed, growth strip, prev/next, download PNG).
6. **Reveal timeline** — the 28 days as a clean vertical/horizontal timeline with dates, tide names, and a small render at each milestone.
7. **Mint** — edition, price (placeholder), dates, disabled button, honest note ("This page never asks you to connect a wallet").

---

## 6. Repository map

```
src/art/           the generator (pure TS; no site code)
  params.ts        PARAMS — every setting
  rng.ts color.ts noise.ts math.ts   deterministic toolkit
  clock.ts         block → Timeline
  mechanic.ts      reference model of the on-chain rules (+ tests)
  traits.ts        seed (+horizon, sky) → traits, odds, tier, title
  geometry.ts      where the bloom is
  render.ts        layers → Piece → composite
  layers/          abyss strata threads lumen inclusion veil texture (+ .params.ts each)
src/lab.ts lab.html   dev harness (window.__lab)
src/site/          the website
scripts/           lab.mjs (render PNGs) · audit-traits.ts · audit-pixels.mjs · shoot.mjs
docs/              DESIGN.md (this) · AUDIT.md (generated)
LAUNCH.md          the playbook
```

## 7. Working conventions

* `npm run dev` serves everything on the first free port from 5173 (it never takes one already in use; the address it chose is printed and recorded in `.dev-url`, which the scripts read). `node scripts/lab.mjs` renders PNGs (see its header).
* Look at your own output. Every layer/section change gets a screenshot, a critique, and a fix. Reuse `scripts/lab.mjs` (art) and `scripts/shoot.mjs` (site).
* Never touch git; the art director commits.
* Keep `PARAMS` JSON-serialisable (`structuredClone`d for reset). Put magic numbers in your layer's params file.
* Prose voice: quiet, exact, a little mythic; no hype words, no exclamation marks, no "revolutionary", no emoji.
