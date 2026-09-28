# HALOCLINE — Launch Playbook
*Five hundred and twelve seeds from the Glass Sea. A checklist from 30 days before the mint to 30 days after.*

Prepared 28 Sep 2026 from `docs/DESIGN.md`, `src/art/params.ts`, `src/art/mechanic.ts`, `src/art/clock.ts` and `tests/mechanic.test.ts`; revised after two independent reviews. Where this file and the code disagree, the code wins: fix this file. A few code changes this plan relies on are not in the repo yet; they are listed as repo tasks in §2.1.

## Contents
- [0. Snapshot](#0-snapshot) — numbers, dates, gates, tags
- [1. How the fair reveal works](#1-how-the-fair-reveal-works) — six commitments, failure modes
- [2. Timeline, T-30 → T+30](#2-timeline-t-30--t30) — twelve phases, each a checklist
- [3. Contract & testnet test plan](#3-contract--testnet-test-plan) — surface, invariants, test matrix
- [4. Mint-day runbook](#4-mint-day-runbook) — hour by hour, T-6h to T+24h
- [5. Marketing calendar](#5-marketing-calendar) — week by week, assets, claims rules
- [6. Launch thread](#6-launch-thread) — 12 posts, announcement, alt text
- [7. Risk register](#7-risk-register)
- [8. Appendix](#8-appendix) — A glossary · B commands · C links and assets
- [9. FINAL LIST — Only you can do these](#9-final-list--only-you-can-do-these) — the last list in this file

---

## 0. Snapshot
### 0.1 Tags and ground rules
| Tag | Meaning |
|---|---|
| **[YOU]** | Owner-only. Signs a transaction, spends money or posts publicly. The assistant that wrote this file never does these. All of them are collected in §9. |
| **[REPO]** | The repo already does it, or it is a command to run. |
| **[GATE]** | Must be true to continue. Numbered G1 to G11. |
| **[TEAM]** | Added tag. Delegable work that signs, spends and posts nothing on mainnet or under the project's public handles (contract dev, designer, reviewer, moderator). It may be you. It may hold a throwaway testnet key, and may deploy the site only on your written go. Anything tagged [TEAM] that would sign, spend or post is [YOU]; if you delegate it, write the delegation in the log. |

- **Dates are placeholders.** Every date is T0 plus an offset. To move the drop, change T0 (`PARAMS.drop.mintOpenISO`) and shift every date together. Never move one gate alone.
- **Slip rule.** If a [GATE] fails, move the whole schedule. Do not skip a gate to hold a date.
- **Times are UTC**, 17:00 unless stated. Local-time table in §0.5.
- **Chain.** This design is written for Ethereum mainnet L1 only: 12-second blocks, a 256-block `blockhash` window, L1 finality. Any other chain or L2 needs a fresh randomness design (a VRF or drand) and a new review. Before choosing a chain, write down its current `block.number`, `blockhash` and `prevrandao` behaviour, block time, finality and sequencer trust from its own docs (part of G1). Run the S1 boundary test on its testnet with real block times.
- **Block numbers are the truth; dates are estimates.** Slots can be missed but never shortened, so real times run later than nominal: roughly 0.5 to 3+ hours over 28 days. Quote block numbers in every announcement.
- **Secrets.** The master secret and the artist salt never enter the repo. They stay off cloud sync (Drive, iCloud, Dropbox, OneDrive), chat, email, notes apps, photos, screenshots and clipboard managers.
- **Nothing has been signed, sent, paid or posted.** This repo deploys no contract and holds no key, seed phrase or address. Every command in Appendix B exists today; confirm at T-30 that each still runs.

### 0.2 Key numbers
| Item | Value | Source |
|---|---|---|
| Edition | 512 seeds | `PARAMS.meta.edition` |
| Price / cap per wallet / mint window | 0.05 ETH · 3 · 24 h = 7,200 blocks (all placeholders) | `PARAMS.drop` |
| Max gross at placeholder price | 25.6 ETH (512 × 0.05); at least 171 wallets to sell out at cap 3 | derived |
| Block · day · tide | 12 s · 7,200 blocks · 7 days = 50,400 blocks | `PARAMS.clock` |
| Growth to reveal | 4 tides = 28 days = **201,600 blocks** | `clock.ts` |
| Turning closes (the Still Hour) | block **201,300**, 300 blocks (1 h) before the reveal | `TURN_CLOSE_BLOCK` |
| Reveal block | block **201,600** | `REVEAL_BLOCK` |
| Bloom | opens over 7,200 blocks; final at block **208,800** | `BLOOM_END_BLOCK` |
| `blockhash()` window | 256 blocks = 3,072 s = 51.2 min | EVM rule |
| Salt reveal deadline (proposed) | `saltDeadline = max(reveal + 600, sky recorded + 300)` blocks | §1.4 F3 |
| Offset anchor (proposed) | close block + 10 blocks (about 2 min) | §1.4 F5 |
| Native drift check | 512 seeds: expect 128 per horizon, sd 9.8; alarm outside 99 to 157 | binomial |
| Block 0 | the block the mint opens (the first successful mint after `unpause()` stamps `openBlock`) | §3.1 |

All block numbers above are counted from `openBlock`.

### 0.3 Key dates (placeholders, nominal 12-second blocks)
| Milestone | Date | Block | Note |
|---|---|---|---|
| T-30 | Tue 13 Oct 2026 | — | phase 1 starts; spec begins |
| T-28 | Thu 15 Oct | — | first note (text only) |
| T-21 | Thu 22 Oct | — | code freeze; review starts; site public |
| T-14 | Thu 29 Oct | — | commit provenance and code hash |
| T-10 | Mon 2 Nov | — | Turn explainer |
| T-7 | Thu 5 Nov | — | commit salt hash; announce |
| T-3 · T-2 · T-1 | Mon 9 · Tue 10 · Wed 11 Nov | — | how-to-mint, Q&A, freeze |
| **T0 MINT** | **Thu 12 Nov, 17:00** | 0 | mint opens (`unpause()`) |
| T+1 | Fri 13 Nov, 17:00 | 7,200 | mint window ends; offset set; seeds published within 30 min of it |
| T+2 · T+3 | Sat 14 · Sun 15 Nov | — | first looks; Turn walkthrough |
| T+7 | Thu 19 Nov | 50,400 | tide I ends |
| T+14 | Thu 26 Nov | 100,800 | tide II ends |
| T+21 | Thu 3 Dec | 151,200 | tide III ends |
| T+27 | Wed 9 Dec | 194,400 | last full day of turning |
| **T+28 REVEAL** | **Thu 10 Dec**, turning closes about 16:00 | 201,300 · **201,600** | the sky opens at 17:00 |
| T+29 | Fri 11 Dec, 17:00 | 208,800 | bloom complete; final |
| T+30 | Sat 12 Dec | — | retrospective |

### 0.4 Go/no-go gates at a glance
| Gate | By | Passes when |
|---|---|---|
| **G1** | Wed 21 Oct (T-22) | Art frozen and tagged; `npm test`, audits green; repo tasks done (§2.1); chain note written; spec approved (T-27); secrets stored; site preview passes |
| **G2** | Wed 28 Oct (T-15) | Signed spec implemented; every §3 test passes; review has no open High or Medium finding |
| **G3** | Wed 28 Oct (T-15) | Testnet rehearsal #1 completed, every function exercised, including the missed-window and missed-deadline paths |
| **G4** | Thu 29 Oct (T-14) | Production contract deployed and source-verified; provenance and code hashes on chain and recomputed by two people |
| **G5** | Wed 4 Nov (T-8) | Rehearsal #2 (a dress rehearsal of the final bytecode) passed; pipeline dry run inside its time budget; docs usability-tested |
| **G6** | Thu 5 Nov (T-7) | Salt commitment on chain, matches two independent computations; restore drill done; details match the contract |
| **G7** | Wed 11 Nov (T-1) | Read-back table matches; roles staffed; written GO |
| **G8** | Thu 12 Nov, 16:00 | Final live GO (§4.1) |
| **G9** | Fri 13 Nov (T+1) | Offset set from the anchor blockhash; seeds published; two outsiders reproduce hash and token-to-seed map |
| **G10** | Thu 10 Dec, 17:00 to 19:00 | Sky recorded in window; salt revealed by deadline; matches commitment; sky independently re-derived |
| **G11** | Fri 11 to Sat 12 Dec | 512 finals match recomputed traits; pinned in two places; then `freeze()` |

### 0.5 Local time
| UTC | London | New York | Los Angeles | Berlin | Tokyo | Sydney |
|---|---|---|---|---|---|---|
| Thu 12 Nov 17:00 (mint) | 17:00 | 12:00 | 09:00 | 18:00 | 02:00 Fri | 04:00 Fri |
| Thu 10 Dec 16:00 (Still Hour) | 16:00 | 11:00 | 08:00 | 17:00 | 01:00 Fri | 03:00 Fri |
| Thu 10 Dec 17:00 (reveal) | 17:00 | 12:00 | 09:00 | 18:00 | 02:00 Fri | 04:00 Fri |

Check your own zone on the day; do not trust this table across a clock change.

---

## 1. How the fair reveal works
### 1.1 The promise
A keeper chooses a direction. After the mint opens, the artist chooses one thing only: whether to reveal the salt (F3). Nobody can see a bloom before the sky opens. Steering the sky needs both the salt and control of the reveal block (F3, F4); the artist holds the first and does not seek the second.

### 1.2 The six commitments, in order
| # | What is committed | When | Who can verify, and how |
|---|---|---|---|
| 1 | **Provenance hash** of all 512 seeds, fixed order, fixed encoding; plus a **code hash**: the SHA-256 of `git archive art-v1.0.0`, with the commit, the `package-lock.json` hash and the Node, Playwright and Chromium versions published beside it. The list stays sealed. | T-14, Thu 29 Oct, `setProvenance(seedsHash, codeHash)` | Anyone reads both hashes on the explorer. From publication anyone recomputes the first from `seeds.json` and the second from the tagged source. A mismatch is provable. Any change after the tag is a new tag with a public diff; the verify page is pinned to the tagged commit. |
| 2 | **Salt commitment** `keccak256(artistSalt)`; the salt is 32 random bytes. | T-7, Thu 5 Nov, `commitSalt` | Anyone reads `saltCommitment()`. At the reveal, `keccak256(salt)` must equal it. |
| 3 | **Blind sequential mint.** Ids issue in order. Seed of id *i* = `seeds[(i + startOffset) mod 512]`, with `startOffset = uint256(keccak256(abi.encodePacked(blockhash(anchor), "offset"))) % 512` and `anchor = closeBlock + 10`, set only after the mint closes. | T0 to T+1 | Read `startOffset()` and its anchor block from the event; recompute it from that block's hash as in §4.5. Nobody could know the offset while the mint was open. |
| 4 | **Seeds published.** The full list, with the mapping rule, the moment the offset lands. | T+1, within 30 minutes of `setStartOffset` | Recompute commitment 1 from the file. Check `seeds[(id + offset) mod 512]` for any token. Derive body traits with this repo. If the contract has `publishSeeds`, anyone can put the list on chain, and it must hash to commitment 1. |
| 5 | **The Turn window.** Free, equal, repeatable; last turn before block 201,300 counts; unturned seeds drift to `uint8(keccak256(seed,"native")[0]) % 4`. | T0 to T+28 about 16:00 | `turnOf(id)` and `TurnSet` events. A snapshot of all 512 turns is posted when the Still Hour begins. Drift is computable from the published seeds. |
| 6 | **The sealed sky.** `sky = keccak256(artistSalt, blockhash(REVEAL_BLOCK), uint256(tokenId))`; `bloomSeed = keccak256(seed, uint8(horizon), sky)`. | T+28, Thu 10 Dec, 17:00 | `skyBlockHash` equals the explorer's hash of the reveal block; salt matches commitment 2; anyone recomputes every sky, bloom seed and bloom trait. |

### 1.3 What is secret, and until when
| Secret | Exists from | Stays secret until | Why |
|---|---|---|---|
| Master secret | T-30 to T-22 (generated) | Your call after T+30 (§2.12) | Anyone holding it can regenerate the list. A leak would only spoil the art and the story. |
| `seeds.json` | T-14 | Seeds published, at once when the offset lands | Sniping is blind anyway (the offset). Whoever holds the file after the offset is an insider (F9). |
| Artist salt | T-30 to T-22 (generated) | `revealSalt`, sent only after `recordSky` is safe | Keeps builders from steering the blockhash; gives nobody a look-ahead. |
| Start offset | close block + 10 | It does not exist before the mint closes | Nobody can pick a token id to land a seed. |
| Every bloom | reveal block | Nobody, including the artist, can preview one | The sky needs the salt and a hash that does not yet exist. |

### 1.4 Failure modes and the chosen mitigation
Each entry: what fails, the fix, and the residual said plainly.

**F1 · The 256-block hash window**
- *Failure:* `blockhash(n)` returns zero once 256 blocks have passed (about 51 min). A sky recorded late is lost.
- *Fix:* `recordSky()` is permissionless: any address, from reveal block + 1 to + 256; it stores the hash once. Three independent callers are armed (owner, a partner, a public call-out). Alarms on the head (§2.11). Decide by T-27 whether to read older hashes from the EIP-2935 history contract (about 8,191 blocks, about 27 h; §9.1).
- *Residual:* a chain stall longer than the window is covered by F2.

**F2 · The window is missed**
- *Failure:* nobody called in time (offline, congestion, stalled chain). Block numbers cannot be "missed"; the recording can.
- *Fix:* after the window, `recordSky()` records `blockhash(block.number - 1)` and sets `late = true`. The salt is still required. The owner address is excluded from calling it (a soft guard, not a security boundary). The event states it was late.
- *Residual:* after the window, someone who knows the salt (the artist) could time the call to grind. Watchers call at the first block. If used, we publish it as such.

**F3 · Salt withholding (a 1-bit grind)**
- *Failure:* the artist knows the salt, so once the hash is known the artist can compute every outcome, and could refuse to reveal if disliking it.
- *Fix:* `revealSalt(salt)` is permissionless to anyone holding the salt (a sealed backup exists). `saltDeadline = max(reveal + 600, skyRecordedBlock + 300)`, so a sky recorded late still leaves time. After it, `finalizeWithoutSalt()` (which needs a recorded sky) sets a fixed zero-salt fallback sky. Public commitment: reveal within 100 blocks of the `recordSky` block. Optional, decided in the spec: a forfeitable bond posted with `commitSalt`, returned on `revealSalt`, burned on the fallback, its size stated.
- *Residual:* the 1 bit (reveal versus fallback) remains and is disclosed. Delay is visible on chain.

**F4 · Builder and validator influence**
- *Failure:* whoever builds or proposes the reveal block controls its `extraData` and transaction order, and so its hash.
- *Fix:* without the salt no hash is better than another. The salt is not broadcast until `recordSky` is mined and safe. The artist and team run no validators, do not build blocks and pay no builder or proposer. The builder and fee recipient of the reveal block are recorded in the sky post. The proposer is known only about one epoch (about 6.4 min) ahead.
- *Residual:* a salt-holder who also builds, or pays the builder or proposer of, the reveal block could grind its hash at roughly the cost of one block auction (check current bid sizes), against 25.6 ETH gross plus rarity value. We do not, and cannot prove a negative; the builder and fee recipient are public. Removing it needs an outside entropy source (§9.1).

**F5 · Start-offset timing**
- *Failure:* set too early, snipers learn the map. The anchor hash is unreadable after 256 blocks. Last minters try to move it.
- *Fix:* `setStartOffset()` reverts before the mint has closed and at or before the anchor block (its own hash reads zero). The anchor is close block + 10, a fixed block number, so nobody picks a moment. Window and late path mirror F1 and F2. The seed list is secret, so a last-block minter cannot use it.
- *Residual:* the late path has the same soft grind as F2.

**F6 · Metadata and code freezing**
- *Failure:* frozen too early locks in a wrong pointer; too late leaves room to swap art or code.
- *Fix:* before the reveal, `tokenURI` is a function of block number and stage. `setStageURIs` is owner-only, emits ERC-4906 and reverts after `freeze(manifestHash)`. `freeze` works only at `block >= openBlock + 208,800`, after every final image is checked against recomputed traits, at the first block after G11 passes. It records the manifest hash and is irreversible. The code hash is committed in commitment 1. Pins in two places.
- *Residual:* between T+28 and `freeze()` (about a day) the owner can still point metadata elsewhere. The chain state and the rules stay the truth.

**F7 · Front-running of turns**
- *Failure:* none by design.
- *Fix:* a turn changes only the caller's own token. No other token depends on it. The rarity roll uses the sky, unknown until block 201,600, so a turn carries no information to front-run. Reordering near the boundary is harmless: a block below 201,300 counts.
- *Residual:* a turn mined at or after 201,300 reverts and costs gas. The UI stops offering the Turn 25 blocks early.

**F8 · Reorgs**
- *Failure:* the reveal block could be replaced after `recordSky` lands.
- *Fix:* `revealSalt` waits until the `safe` head has passed the `recordSky` block (about 32 to 64 blocks). Renders and the "sky is open" post wait for finality (about 13 min on L1). The contract's state is authoritative; all outputs are re-derived from it.
- *Residual:* a reorg beyond the safe head would change the sky. Extremely rare, and re-derivable.

**F9 · Insider information**
- *Failure:* whoever holds the salt sees all outcomes minutes before the public. Whoever holds `seeds.json` sees every token's seed and body traits once the offset is set, while tokens trade freely.
- *Fix:* publish the seeds the moment the offset lands (commitment 4). Reveal within 100 blocks of `recordSky`. No trading by anyone who holds the list or the salt (team, verifier, contract dev, reviewers, backup holder, witness) from T0 until the seeds are public plus 24 h, and again from the Still Hour until the finals are posted. Their wallets are listed at T0. `revealSalt` goes through a private-orderflow RPC with a public fallback after 3 blocks.
- *Residual:* trust in a promise; the on-chain record makes a breach checkable. A short first-block window for searchers exists, and we say so.

**F10 · Seed cherry-picking**
- *Failure:* the artist picks which seeds exist.
- *Fix:* the list is hashed before the mint; the offset is drawn after it. Regenerating before the commit is allowed; count the attempts and say so. No rerolls after.
- *Residual:* the artist curated the 512 pool before committing.

### 1.5 What we say publicly about residual trust
- The 1-bit salt choice and the late paths (F2, F3), the builder residual (F4) and the metadata window before `freeze()` (F6) are disclosed on the verify page, in thread post 9 and in the announcement, and are visible on chain.
- Traits are exactly reproducible. Pixels are reproducible with the pinned Chromium; other browsers may differ slightly.
- The per-wallet cap is per address, not a bot defence. The owner can point metadata until `freeze()` but cannot change price, supply, clock, seeds, offset, turns or sky.

---

## 2. Timeline, T-30 → T+30
Phases: 2.1 T-30…T-22 · 2.2 T-21…T-15 · 2.3 T-14 · 2.4 T-14…T-8 · 2.5 T-7 · 2.6 T-6…T-2 · 2.7 T-1 · 2.8 T0 · 2.9 T+1…T+7 · 2.10 T+7…T+27 · 2.11 T+27…T+28 · 2.12 T+29…T+30.

### 2.1 T-30…T-22 · Readiness, spec and build (Tue 13 Oct → Wed 21 Oct)
**Days 1–2 · Decide and book**
- [ ] **[YOU]** Choose the chain by the §0.1 rule (Ethereum mainnet L1 unless you accept a new randomness design and a new review). Write down its `blockhash`, `prevrandao` and finality facts.
- [ ] **[YOU]** Decide the independent review and book the slot now. Lead time is the schedule risk.

| Option | Effort | Fits when | Then say publicly |
|---|---|---|---|
| A. Paid audit, fixes rechecked | Weeks; may not fit inside 30 days, so expect to slip | Proceeds at risk are meaningful, or you want the strongest signal | Report link, scope, unresolved findings |
| B. Two independent reviewers plus a public review week | 1 to 2 weeks | Small contract, lean budget. Suggested minimum | Reviewers (with consent), scope, fixes |
| C. Self-review only | None | Not recommended with up to 25.6 ETH in the contract | "Unaudited", on the mint page and in every post |

- [ ] **[YOU]** Name the roles: Captain (you), Watcher, Comms, Contract dev, Art/pipeline lead, Second verifier, Backup key-holder, and a named witness for the reveal.
- [ ] **[YOU]** Decide open mint versus allowlist by T-27. Default here: open public mint, no allowlist. An allowlist changes `mint` and the spec.
- [ ] **[YOU]** Set up the newsletter account and a sign-up page (the T-28 note links it).
- [ ] **[YOU]** Fill in the money table below.

**Money you will spend** (fill in before G1; each line has a matching step in §9.2)
| Item | Paid | Estimate |
|---|---|---|
| Domain, lookalike domains, hosting, email | T-30…T-22 | |
| Review or audit (deposit, then balance) | T-30, T-14 | |
| Counsel and legal entity | T-30…T-22 | |
| Hardware wallets and security keys, each with a spare | T-30…T-22 | |
| Multisig creation and every owner transaction in §9.2, each at 5× the gas estimate | T-15…T+30 | |
| Pinning (two providers) and RPC plans | T-14 | |
| Newsletter and moderation tools | T-30 | |
| Testnet ETH (faucet) | T-21 | 0 |
| **Total** | | |

**Days 1–4 · Spec** (written T-30 to T-27; code freeze T-21)
- [ ] **[TEAM]** Write a two-page spec from §3. Pin: id base (0 or 1); how `openBlock` is stamped; deploy paused and `unpause()` as go-live; the `guardian`; exact-price mint; fallback rules (F2, F3) and `saltDeadline`; price immutable; royalty cap; withdraw rule; `setStageURIs` and `freeze(manifestHash)`; pause scope; whether `commitSalt` is once-only or re-settable until the mint opens; `publishSeeds` yes or no; EIP-2935 yes or no.
- [ ] **[YOU]** Approve the spec by T-27. A decision, not a transaction.
- [ ] **[REPO]** `VECTORS=1 npm test` prints the pinned vectors (`SEED`, `SALT`, `HASH`, `native`, `sky`, `bloom0`, `commit`; after repo task 3 also `startOffsetOf`, `provenanceHash` and `seedForToken`). Copy them into the contract tests.
- [ ] **[TEAM]** Generate 64 more vectors (16 seeds × 4 horizons) from `src/art/index.ts`: `nativeHorizon`, `skyOf`, `bloomSeed`, `commitmentOf`.
- [ ] **[TEAM]** Implement T-27 to T-21 on well-reviewed libraries (for example OpenZeppelin). No proxy, no upgrade path, no owner setter for price, supply, clock, seeds or sky. Unit, fuzz and invariant tests per §3; static analysis (for example Slither or Aderyn) clean or triaged in writing.

**Days 3–8 · Repo tasks** (not in the repo on 28 Sep; each is a G1 condition)
1. **[TEAM]** Hash-argument validation: `skyOf`, `commitmentOf`, `provenanceHash` and `startOffsetOf` throw unless every hash argument is exactly 64 lowercase hex. Today `keccakHex` hashes anything else as UTF-8 without a warning, so a pasted `0x` hash gives a wrong sky silently.
2. **[TEAM]** `render:canonical`: add `--final` (requires validated `--salt`, `--blockhash` and `--offset`; refuses `rehearsal`; writes `skySource`, the blockhash and the salt commitment into each JSON) and `--stills-only` (writes only `<id>-seed|tide1..4|still.png` and a JSON with body traits only; never `<id>.png`, `<id>.json`, `-reveal` or `-opening`).
3. **[TEAM]** In `tests/mechanic.test.ts`, hard-code the literal expected hex for `native`, `sky`, `bloom0`, `commit`, `startOffsetOf(HASH, 512)`, `provenanceHash` of the 512 test seeds and `seedForToken` at offsets 0, 1 and 511, each first cross-checked with `cast keccak` on the concatenated bytes. Print them under `VECTORS=1`.
4. **[TEAM]** A G1 test: stills up to `still`, rendered under two different skies, are byte-identical with equal `attributes` (the sealed-bloom rule in `docs/DESIGN.md`).
5. **[TEAM]** Reword the "The sealed sky" rule in `rulesInPlainEnglish()` to end: "No one can steer it alone; the artist's one remaining choice is whether to reveal the salt, and if not, a public fallback applies." The site's rules card and asset A7 read from it.
6. **[TEAM]** Pin `playwright` to an exact version in `package.json`; use `npm ci` everywhere.

**Days 2–4 · Secrets**
- [ ] **[YOU]** Prepare the offline machine: `npm ci` from a tagged clone, then disconnect. Run with shell history off (`set +o history`). Read secrets from stdin, never as an argument.
- [ ] **[YOU]** On that machine, generate the master secret and the artist salt: 32 random bytes each, as 64 lowercase hex.
- [ ] **[YOU]** Store each on paper or steel in two places, plus one encrypted offline drive. No photo, no cloud, no notes app.
- [ ] **[YOU]** Compute `keccak256(salt)` with two tools: `commitmentOf` and `cast keccak` (Appendix B, both read the salt from stdin). Results must match. Keep only the commitment on any online machine.
- [ ] **[TEAM]** Name a second person who knows where the backups live and can reveal the salt if you cannot.

**Days 3–8 · Art frozen**
- [ ] **[REPO]** `npm test`: clock constants, phases, turn rules and pinned vectors pass.
- [ ] **[REPO]** `npm run audit:traits`: 1,000-seed audit; rare traits rare; every horizon has equal odds of every trait.
- [ ] **[REPO]** `npm run audit:pixels`: no weak output against every bound in `PARAMS.quality`. The numbers live there and in `docs/AUDIT.md`, not here.
- [ ] **[TEAM]** Read `docs/AUDIT.md` end to end. Any failing row: fix, rerun both audits, restart this gate.
- [ ] **[TEAM]** Tag `art-v1.0.0` (matches `PARAMS.meta.version`). Record the commit hash, the SHA-256 of `git archive art-v1.0.0`, the lockfile hash, and the Node, Playwright and Chromium versions (the code hash, commitment 1). After the tag: bug fixes only, each a new tag with a public diff; nothing after T0.
- [ ] **[TEAM]** Confirm `npm run provenance` and `npm run render:canonical` run on a test secret (`render:canonical` needs `npm run dev` running).

**Days 6–9 · Site on a private preview**
- [ ] **[REPO]** `npm run build` (typecheck plus Vite build) is clean; `npm run preview` serves on port 4173.
- [ ] **[TEAM]** Test on a phone and a desktop: all seven sections, hero click, simulator scrub and turn, gallery filters and 24 detail views, reduced-motion, keyboard focus, load speed.
- [ ] **[TEAM]** Confirm no wallet code: `grep -rn "window.ethereum\|walletconnect\|eth_requestAccounts" src dist` returns nothing. The Mint button stays disabled with its honest note.
- [ ] **[TEAM]** Add to the gallery: "Gallery seeds are examples of the system, not tokens of the edition."
- [ ] **[TEAM]** Before the first public deploy, replace the mint date, price, cap and window shown by the Mint and Timeline sections (the values live in `PARAMS.drop`) with "announced 5 Nov". Keep block numbers and the rules; they do not depend on price. At T-7 set the real values and run the §2.6 comparison.
- [ ] **[YOU]** Pay for domain and hosting; deploy behind a password or unlisted URL.

**Days 3–9 · Legal, tax, terms** (placeholders; not legal advice)
- [ ] **[YOU]** Choose counsel and a legal entity (§9.1).
- [ ] **[TEAM]** Draft placeholders: Terms of Mint, Privacy, Keeper licence, risk disclosure. Questions for counsel: entity, jurisdictions and sanctions screening, consumer and marketing rules, tax on primary sales, royalties and gas, licence terms, refunds.
- [ ] **[TEAM]** Start a ledger: every transaction hash with its date and fiat value.

**Days 3–9 · Comms accounts**
- [ ] **[YOU]** Secure the handles (X, Discord, newsletter, domain email) with hardware-key 2FA; recovery codes offline; publishing accounts separate from wallet identities.
- [ ] **[YOU]** Lock the domain (registrar lock, 2FA, DNSSEC if offered). Optionally register obvious lookalike domains.
- [ ] **[TEAM]** Discord: verification, no links from new members, moderator brief, scam-warning pin, no support staff who ever ask for a phrase or key.
- [ ] **[YOU]** Buy hardware wallets and security keys, each with a spare.

- [ ] **[GATE G1]** Art frozen and tagged; audits green; repo tasks done; chain note written; preview passes; roles named; secrets stored and backed up.

### 2.2 T-21…T-15 · Review and testnet (Thu 22 Oct → Wed 28 Oct)
- [ ] **[YOU]** Make the site public (values already swapped for "announced 5 Nov", §2.1).
- [ ] **[TEAM]** Code freeze at T-21. The independent review runs T-21 to T-15 (option chosen in §2.1). If the reviewer cannot finish before T-14, slip the schedule. Do not deploy unreviewed code.
- [ ] **[YOU]** Create the multisig on mainnet (signers on hardware wallets) and the `guardian` key (one hardware wallet, `pause()` only). Try both on the testnet first.
- [ ] **[TEAM]** Testnet clock profile (testnet only): mint window 100 blocks; growth 600 (150 per tide); Still Hour 25; bloom 150; salt deadline 300 (and the same +300 rule). The 256-block window and the 10-block offset delay are not compressed. For renders, map rehearsal blocks to art blocks per phase: growth ×336 (600 to 201,600), Still Hour ×12 (25 to 300), bloom ×48 (150 to 7,200); or drive the renders from the phase name.
- [ ] **[YOU]** Deploy rehearsal #1 on a public testnet with a throwaway key and faucet ETH; verify the source on the testnet explorer.
- [ ] **[TEAM]** Rehearsal #1: exercise every function once, plus both late paths (`recordSky` not called for 257 blocks; salt deadline missed). Log step, expected, actual, transaction link. Use a test master secret and a test salt, never the real ones.
- [ ] **[GATE G2]** Every §3 test passes; review has no open High or Medium finding.
- [ ] **[GATE G3]** Rehearsal #1 log is complete and clean, late paths included.

### 2.3 T-14 · Commit provenance (Thu 29 Oct)
- [ ] **[REPO]** Rerun `npm test` and both audits at tag `art-v1.0.0`. Tag unchanged.
- [ ] **[REPO]** Offline, with history off: `read -rs HALOCLINE_MASTER && export HALOCLINE_MASTER`, then `npm run provenance -- --out <VAULT>/prov` (`<VAULT>` is an encrypted offline volume), then `unset HALOCLINE_MASTER`. The script writes `seeds.json` and prints the provenance hash and a body-trait tally. It does not check quality gates.
- [ ] **[REPO]** Gate the seeds: `npm run audit:pixels -- --seeds <file>` must pass for every seed at all four horizons. The script gives seed *i* horizon *i mod 4*, so run it on a temporary copy in the vault with each seed repeated four times in a row, and ignore the near-duplicate row for that run.
- [ ] **[TEAM]** Check the output: 512 unique seeds, each 64 lowercase hex; none equals a gallery or hero seed; native horizons each within 99 to 157. If any gate fails, regenerate with a new master secret before committing and count the attempts. A new master secret needs new backups and a new restore check first.
- [ ] **[TEAM]** Write down the construction in one paragraph: what is hashed, in what order, with what encoding. Consider a Merkle root as well, so one seed can be proven alone.
- [ ] **[TEAM]** A second person recomputes the hash with `npm run provenance -- --verify <file> <hash>`, and again from the paragraph alone in another tool. Both must match.
- [ ] **[YOU]** Keep `seeds.json` off the repo and off cloud sync: encrypted, offline, two copies. `provenance-out/` is already git-ignored; still confirm nothing is staged.
- [ ] **[YOU]** From a fresh deployer address on a hardware wallet, deploy the production contract (deployed paused, `guardian` set). Start the two-step ownership transfer; the multisig calls `acceptOwnership()`. Verify the source on the explorer.
- [ ] **[YOU]** Call `setProvenance(<PROVENANCE_HASH>, <CODE_HASH>)` as a multisig transaction (book the signers' call), calldata built offline (§9.0). Read both back.
- [ ] **[TEAM]** Archive the hashes in four places: chain, site, a public post, a web-archive snapshot.
- [ ] **[GATE G4]** Contract deployed and verified; on-chain hashes equal the recomputed hashes.
- [ ] **[YOU]** Post commitment one (§5).

### 2.4 T-14…T-8 · Rehearsal #2 and pipelines (Thu 29 Oct → Wed 4 Nov)
- [ ] **[YOU]** Deploy rehearsal #2 on the testnet from the exact production commit, compiler and optimiser settings. It is a dress rehearsal of the final bytecode, with the same roles, calldata procedure, hardware wallet and multisig.
- [ ] **[TEAM]** Run the whole compressed reveal: mint (with a contract minter), `unpause`, close, offset, publish, turns, Still Hour boundary, `recordSky`, `revealSalt` (private route and fallback), freeze. Repeat the two late paths if the bytecode changed since rehearsal #1.
- [ ] **[TEAM]** Two people rehearse the reveal roles (§2.11), against the clock.
- [ ] **[REPO]** `npm run render:canonical` on test tokens (dev server running). Time one final (2400×3000) and one still; compute the time for 512. Budget: finals done and pinned before T+29, 17:00. Rehearse the independent sky gate (§2.11).
- [ ] **[TEAM]** Metadata dry run: JSON schema (name, description, image, animation_url, attributes), stage logic at every boundary (placeholder, seed, tides I to IV, Still, opening, final), trait counts, pinned images opening on two gateways.
- [ ] **[TEAM]** Wire the site read-only: block number, `openBlock`, commitments, `turnOf`, phase. No wallet code. Domain-restricted RPC key, never in the repo.
- [ ] **[TEAM]** Write the docs: How to mint, How to Turn (explorer Write tab, screenshots from testnet), How to verify, FAQ, Terms, status page. Decide the mint interface (§9.1).
- [ ] **[TEAM]** Usability test: a friend who has never seen the project mints and turns on the testnet using only the docs.
- [ ] **[GATE G5]** Rehearsal #2 passes end to end; pipeline within budget; docs work for a stranger.

### 2.5 T-7 · Commit the salt hash, announce (Thu 5 Nov)
- [ ] **[YOU]** Restore drill: recover the salt from the backup, offline; confirm `keccak256(salt)` matches your two tools. Put it back.
- [ ] **[YOU]** Call `commitSalt(<SALT_COMMITMENT>)` as a multisig transaction, calldata built offline (§9.0). Read it back.
- [ ] **[TEAM]** Verify the on-chain value equals the offline value.
- [ ] **[GATE G6]** Commitment on chain; details match the contract; drill done.
- [ ] **[YOU]** Publish the official-links page and the mint details: date and time in UTC with a converter, price, cap, window, contract address, how to mint, review status.
- [ ] **[YOU]** Post the launch thread, the newsletter and the Discord announcement (§6).

### 2.6 T-6…T-2 · Final gates (Fri 6 Nov → Tue 10 Nov)
- [ ] **[YOU]** Hardware-wallet drill on testnet: connect, read the address on the device screen, sign, confirm. Spare device and second signer ready. Include a multisig `unpause()` with signatures collected.
- [ ] **[TEAM]** Gas plan: measured gas for `mint` (1 to 3), `turn`, `recordSky`, `revealSalt`, `setStartOffset`; a funded owner wallet and a separate small keeper wallet, each with 5× the estimate; priority-fee plan; a second RPC provider.
- [ ] **[YOU]** Fund the owner and keeper wallets to the gas plan.
- [ ] **[TEAM]** Compare every number on the site with the deployed contract (price, cap, window, clock, addresses). If they differ, change the site, not the contract.
- [ ] **[TEAM]** Support pack: FAQ, scripted replies, scam warnings, moderator rota for T0 and T+28.
- [ ] **[YOU]** Schedule only the posts tied to a timestamp before the mint opens (T-4h to T-15m and "Tomorrow"). Every post tied to a block is sent by hand (§5.1). Scheduling is posting; read each again.
- [ ] **[TEAM]** 30-minute tabletop: wrong price, site down, explorer down, gas spike, RPC down, Discord raid, phishing clone.
- [ ] **[TEAM]** Prepare the media kit from gallery seeds only (A1 to A9), each captioned "example seed, not an edition token". No edition seed is public yet.
- [ ] **[TEAM]** Fill the how-to-mint guide with the real contract address and cross-check it letter by letter.

### 2.7 T-1 · Freeze (Wed 11 Nov)
- [ ] **[TEAM]** Freeze content and deploys, except emergencies.
- [ ] **[TEAM]** Read back the production contract with read-only calls and fill this table; every row must match:

| Read | Expected |
|---|---|
| owner · guardian | the multisig · the Captain's hardware wallet (`pause()` only) |
| `provenanceHash()` · `codeHash()` · `saltCommitment()` | equal to the published values; non-zero is a hard gate |
| price · cap per wallet · supply cap | announced values · 512 |
| mint window · growth · Still Hour · bloom | 7,200 · 201,600 · 300 · 7,200 blocks |
| salt deadline rule · offset delay | 600 (and sky recorded + 300) · 10 blocks |
| royalty receiver and bps | as decided |
| paused · frozen | true (deployed paused) · false |
| `openBlock` · `closeBlock` · `anchorBlock` · `mintEndBlock` · `startOffset` | unset |
| `skyRecorded` · `saltRevealed` · `late` · `totalPaid` · `minted` | false · false · false · 0 · 0 |

- [ ] **[TEAM]** Charge devices; a hotspot as backup network; print §4 and the read-back table.
- [ ] **[YOU]** Post "Tomorrow" with times in six zones.
- [ ] **[YOU]** Written GO in the log, with G1 to G6 marked.
- [ ] **[GATE G7]** Read-back matches; roles staffed; GO written.

### 2.8 T0 · MINT DAY (Thu 12 Nov)
Run §4. It is complete on its own.

### 2.9 T+1…T+7 · Offset, seeds, first tide (Fri 13 Nov → Thu 19 Nov)
- [ ] **[YOU]** If not already set, call `setStartOffset()` as soon as the anchor block plus one is mined (§4.5). Use two callers.
- [ ] **[TEAM]** Confirm `startOffset()`: keccak256 of the anchor hash followed by the bytes `6f6666736574` ("offset"), reduced mod 512 (§4.5). Not the blockhash mod 512.
- [ ] **[YOU]** Publish `seeds.json`, the construction paragraph and the mapping rule at `<SEEDS_URL>` at once; the file and verify page are pre-staged, target within 30 minutes of `setStartOffset`. If the contract has `publishSeeds`, call it too (anyone may).
- [ ] **[TEAM]** Two outsiders reproduce the provenance hash and three token-to-seed maps. Publish their confirmations only with their consent.
- [ ] **[GATE G9]** Offset set from the anchor; seeds published; independently reproduced.
- [ ] **[REPO]** Export `turns.json` from `TurnSet` events plus `turnOf`: `{ "<tokenId>": 0..3 }`, the last turn per token made below `openBlock + 201,300`; a missing id means drifted.
- [ ] **[REPO]** Render growth stills for every minted token with its current turn: the `--stills-only` command in Appendix B (dev server running).
- [ ] **[REPO]** Pre-pin check, part of the gate: the folder holds no `<id>.png`, `<id>.json`, `-reveal` or `-opening` file, and no Form, Petals, Rings, Light or Inclusion attribute appears in any JSON. Before block 201,600 pin only `-seed`, `-tide1..4` and `-still` PNGs; a bloomed image under a rehearsal sky would publish false traits under a real id, for good.
- [ ] **[YOU]** Pin the checked files. Then `setStageURIs(...)` and `refreshMetadata()` (§3.1).
- [ ] **[TEAM]** Update the site's Gallery note: edition seeds are now viewable; gallery examples remain examples. Deploy on your written go.
- [ ] **[YOU]** T+2 Sat 14 Nov: post a call for keepers to reply if they want their seed shown, then the first look at those who replied only (A10). T+3 Sun 15 Nov: Turn walkthrough and office hours.
- [ ] **[YOU]** T+7 Thu 19 Nov, when the head reaches 50,400: tide I ends. Render fresh stills with the current turns, run the pre-pin check, pin, `setStageURIs`, refresh, post "The Deep" with A2.

### 2.10 T+7…T+27 · Tides II and III (Thu 19 Nov → Wed 9 Dec)
Every Thursday the tide note, sent by hand when the head reaches the tide's end.

- [ ] **[YOU]** T+14 Thu 26 Nov (block 100,800): tide II ends. Stills, pre-pin check, pin, metadata, refresh, post "The Sheets" with the first Turn reminder.
- [ ] **[YOU]** T+21 Thu 3 Dec (block 151,200): tide III ends. Same routine, post "The Threads" and the second Turn reminder. Seven days to the Still Hour.
- [ ] **[TEAM]** T+21 and T+27: recompute every six-zone time from `openBlock` and the measured mean block time; update the site countdown.
- [ ] **[TEAM]** Weekly: read the contract back and diff it against the T-1 table; check uptime, RPC, domain, DNS and certificates; sweep for impersonators.
- [ ] **[YOU]** Weekly: answer questions on turning (or a named moderator with a written brief). The rule is the same for everyone; replies follow Rule P.
- [ ] **[REPO]** T+21: time the full 512-final render on the production machines with `rehearsal:N` skies into a scratch folder that is never pinned. Fix the plan if it exceeds the budget.
- [ ] **[YOU]** T+25 Mon 7 Dec: "Three days" post with A6.
- [ ] **[YOU]** Mid-period: one restore drill of the salt backup, offline.
- [ ] **[TEAM]** Mid-period: confirm the second person still has access to the backups.
- [ ] **[YOU]** Community: office hours and keeper notes with consent, by you or a named moderator. No price talk (§5, Rule P).

### 2.11 T+27…T+28 · REVEAL RUNBOOK (Wed 9 Dec → Thu 10 Dec)
**T+27 Wed 9 Dec (block about 194,400)**
- [ ] **[YOU]** "Turning closes tomorrow" with the block number and the time in six zones (an estimate; recomputed from the head).
- [ ] **[YOU]** Read the current turns and post the aggregate: how many turned to each horizon so far. No per-token hints.
- [ ] **[TEAM]** Simulate `recordSky()` with a call only. It must revert "too early". Never simulate `revealSalt` with the real salt; calldata reaches the RPC provider.
- [ ] **[YOU]** Fund the owner and keeper wallets.
- [ ] **[TEAM]** Check both RPCs; open two explorers; set alarms on the chain head, not the clock: head ≥ 201,000, 201,275, 201,300, 201,550 and 201,600.
- [ ] **[YOU]** Arrange the callers. A named third party (not the owner) for the late `recordSky()` and for `finalizeWithoutSalt()`. Post the public call-out asking watchers to call `recordSky()` in the window.
- [ ] **[YOU]** Bring the salt backup to the signing room, sealed. The witness has the second sealed copy. Nothing is typed anywhere yet.

**T+28 Thu 10 Dec.** Nominal times; the chain head decides, so trigger each row on the block.

| Head | Nominal UTC | Who | Step |
|---|---|---|---|
| — | 12:00 | Captain | Roles present; chain healthy; gas known |
| 201,000 | 15:00 | **[YOU]** | By hand: post "Turning closes in one hour" with the how-to |
| 201,275 | 15:55 | Site | Stops offering the Turn (25 blocks early). The contract stays the truth |
| 201,300 | 16:00 | Captain | Still Hour begins. With the head at or past 201,300 (or against the pending block) a `turn` simulation must revert "closed"; at head 201,299 it still passes, which is why the site stops earlier |
| 201,300 | 16:00 | **[YOU]** | Post the Still Hour line. Publish the snapshot of all 512 turns (from `TurnSet` events plus `turnOf`; never-turned plus turned equals minted). Trading stops for everyone on the F9 list |
| 201,550 | 16:50 | All | Read `skyRecorded=false`, `saltRevealed=false`; keeper bots armed |
| 201,600 | 17:00 | Watcher | Reveal block mined. Its hash is now fixed |
| 201,601 | 17:00:12 | **[YOU]** | `recordSky()` from Captain and two other callers, high priority fee |
| +30 s | — | Watcher | `skyBlockHash` equals the explorer's hash of block 201,600; `late = false`. Two independent sources. Note the block's builder and fee recipient |
| safe head past the `recordSky` block (about 32 to 64 blocks) | — | **[YOU]** | Only now `revealSalt(<SALT>)`, from the hardware wallet, through the private-orderflow RPC (public fallback after 3 blocks), within 100 blocks of the recorded sky |
| after finality (about 13 min) | — | Watcher | Independent sky gate: for all 512 ids the contract's `skyOf(id)` equals the pipeline's sky; for 3 ids also `cast keccak 0x<SALT><BLOCKHASH><id as 32 bytes>` |
| after finality | — | Team | Site flips to "The sky has opened" (before finality it reads "sky recorded, awaiting finality"). Spot-check 3 tokens: `node scripts/lab.mjs info --seed <SEED> --horizon <H> --sky <SKY> --stage bloomed` against the site |
| after finality | — | **[YOU]** | Post "The sky is open" with the transactions, the blockhash, the salt, and the reveal block's builder and fee recipient |
| after finality | — | **[REPO]** | Start `npm run render:canonical … --final` in parallel (Appendix B) |
| after finality | — | **[YOU]** | `refreshMetadata()` |
| → next day | — | Comms | **[YOU]** At most four bloom-watch posts; the site shows the bloom by the block clock |

- [ ] **[GATE G10]** Sky recorded on time (or fallback documented); salt matches the commitment; the sky re-derived independently.
- **Escalate at reveal + 200 blocks (about 17:40)** if `recordSky` is not confirmed: all callers, raise the fee, add a second RPC.
- **At reveal + 256 (about 17:51)** the window closes. Use the late path (F2), called by the named third party, not the owner. Post it in plain words.
- **From reveal + 601 (about 19:00)**, if no salt and the sky was recorded on time, anyone may call `finalizeWithoutSalt()`. If the sky was recorded late, the deadline is that block + 300. Post it in plain words.
- **The reveal cannot be paused.** `pause` only stops the mint.

```
16:00  The Still Hour has begun. Turning is closed. Every turn is final: <TURN_SNAPSHOT_URL>.
17:xx  The sky is recorded. The hash of block <REVEAL_BLOCK> is <SKY_BLOCKHASH> (tx <SKY_TX>). That block was built by <BUILDER>, fee recipient <FEE_RECIPIENT>. The salt follows.
17:xx  The salt is revealed: <SALT>. It hashes to <SALT_COMMITMENT>. One choice remained with the artist, to reveal the salt or let a fixed fallback stand. Compute any seed's sky: <VERIFY_URL>.
later  The bloom is at <PERCENT> percent. Each seed opens over one day on the block clock.
late   The sky was recorded at block <LATE_BLOCK>, after the 256-block window, by a third party using the documented fallback. Details: <VERIFY_URL>.
```

### 2.12 T+29…T+30 · Aftermath (Fri 11 Dec → Sat 12 Dec)
- [ ] **[REPO]** T+29 17:00 (block 208,800): bloom complete. Finish and QC all 512 finals: none blank, sizes right, hashes listed.
- [ ] **[TEAM]** Compare each final's traits with the trait list recomputed from `seed + horizon + sky`, taking each sky from the contract's `skyOf(id)`, not from the salt you fed the renderer. 512 of 512 must agree.
- [ ] **[YOU]** Pin all files with two providers (permanent storage optional). Record the manifest hash.
- [ ] **[GATE G11]** Checks pass; pins verified from two gateways.
- [ ] **[YOU]** `setStageURIs(...)` to the finals, then `freeze(<FINAL_MANIFEST_HASH>)` at the first block after G11 passes. Read `tokenURI` for five random ids and match their content ids.
- [ ] **[YOU]** Post the verification write-up: provenance → seeds → offset → turns → salt → blockhash → sky → traits. Show final trait counts next to the stated odds, without spin.
- [ ] **[TEAM]** Confirm `royaltyInfo` reads as decided. **[YOU]** Set up the marketplace collections and royalty settings (a signed login). Say that enforcement depends on the marketplace.
- [ ] **[YOU]** `withdraw` to the multisig, after `freeze()` (§9.1). Log the transaction for tax.
- [ ] **[YOU]** T+30 Sat 12 Dec: thanks post.
- [ ] **[TEAM]** Retrospective: what worked, what broke, real numbers only (mints, wallets, turned versus drifted).
- [ ] **[YOU]** Decide what to do with the master secret; the salt is public now. Retire the deployer address. Rotate keys.

---

## 3. Contract & testnet test plan
**No contract is written or deployed by this repo.** The reference model in `src/art/mechanic.ts` and `tests/mechanic.test.ts` gives the vectors to port. Signatures below are the expected surface; names may change but every behaviour must remain.

### 3.1 Expected surface
```
mint(uint256 quantity) payable              // msg.value == price × quantity exactly; no refund; reverts while paused
setProvenance(bytes32 seedsHash, bytes32 codeHash)   // owner, once, before the mint opens
commitSalt(bytes32 commitment)              // owner, before the mint opens (once-only, or re-settable until then: spec)
setStartOffset()                            // permissionless, after close + 10 blocks, once
publishSeeds(bytes32[512] seeds)            // permissionless, once, after setStartOffset; reverts unless the packed keccak equals seedsHash; emits the list
turn(uint256 tokenId, uint8 horizon)        // token owner or approved, before openBlock + 201,300
recordSky()                                 // permissionless, reveal + 1 .. + 256; late path after
revealSalt(bytes32 salt)                    // anyone holding the salt, after recordSky, by saltDeadline
finalizeWithoutSalt()                       // permissionless; needs a recorded sky and block.number > saltDeadline
tokenURI(uint256 tokenId) view returns (string)   // a function of stage and block, so view, not pure
setStageURIs(...)                           // owner; emits ERC-4906; reverts after freeze()
freeze(bytes32 manifestHash)                // owner, once, at block >= openBlock + 208,800; emits Frozen(manifestHash)
pause()                                     // guardian or owner; stops mint only
unpause()                                   // owner (multisig) only; the go-live call at T0
withdraw(address payable to)                // owner (multisig)
refreshMetadata()                           // permissionless, emits the ERC-4906 event only
// views: openBlock, closeBlock, anchorBlock, mintEndBlock, revealBlock, turnCloseBlock, turnOf, skyOf,
//        startOffset, provenanceHash, codeHash, saltCommitment, skyRecorded, skyBlockHash, saltRevealed,
//        revealedSalt, late, saltDeadline, totalPaid, minted, guardian, paused, phase, royaltyInfo (ERC-2981)
// events: Minted, TurnSet, ProvenanceSet, SaltCommitted, StartOffsetSet, SeedsPublished, SkyRecorded,
//         SaltRevealed, Frozen, MetadataUpdate (ERC-4906)
```

- **Fail-closed.** The contract deploys paused. The mint opens with the multisig's `unpause()` at T0, never before `MINT_START`. `mint` reverts unless `provenanceHash`, `codeHash` and `saltCommitment` are all non-zero. A missed step or a missing Captain then means no mint, not a wrong one.
- **Block 0.** `openBlock` is stamped by the first successful `mint` after `unpause()`, only after every check has passed; a zero-quantity call cannot stamp it.
- **Turn storage.** Store `horizon + 1` (0 means never turned) and return `turnOf(id)` as `(bool turned, uint8 horizon)`. A raw 0 is not Dawn: an untouched token must drift to its native horizon.
- Timing uses `block.number`, never timestamps (except `MINT_START`). Ids: one base (0 or 1) everywhere: contract, pipeline, verify page.
- The contract need not hold seeds. It stores the turn; drift and traits are computed off chain from the published seed. Optional: a Merkle-proof `revealSeed`. `publishSeeds` is about 16 KB of calldata, roughly 0.3 to 0.7M gas depending on the chain's calldata pricing; measure it.
- Bytes: `uint8` packs to 1 byte, `uint256` to 32, `"native"` to 6, `"offset"` to 6 (hex `6f6666736574`), `bytes32` raw. In the TS reference, any string that is not exactly 64 lowercase hex is hashed as UTF-8, so never pass `0x`-prefixed or uppercase values.
- Between T+28 and `freeze()` the owner can still move metadata pointers (F6): freeze at the first block after G11 passes.

### 3.2 Invariants
- **I1** Supply never exceeds 512, and distinct ids map to distinct seed indices.
- **I2** `turn[id]` is never-turned or a horizon 0 to 3, and changes only before `openBlock + 201,300`.
- **I3** Provenance, code hash, offset, sky hash and salt are each written at most once; the salt commitment is final once the mint opens. No owner function changes price, supply, clock, turns, offset, sky or salt. The only owner-mutable pointer is `setStageURIs`, until `freeze()`.
- **I4** `revealSalt` succeeds only if `keccak256(salt)` equals the commitment and a sky is recorded.
- **I5** `pause` never blocks turn (in window), `recordSky`, `revealSalt`, `finalizeWithoutSalt`, `setStartOffset` or transfers, and never moves the clock.
- **I6** `address(this).balance >= totalPaid - withdrawn`. Force-sent ETH (a self-destruct target, a fee recipient, a pre-funded address) can only raise the balance; a surplus is logged and is never a reason to pause.
- **I7** After `freeze()`, `tokenURI(id)` is constant for every id.
- **I8** `recordSky` and `setStartOffset` are O(1); no loop over tokens.
- **I9** `mint` reverts unless `provenanceHash`, `codeHash` and `saltCommitment` are non-zero, and both setters revert once `openBlock` is stamped.

### 3.3 Test matrix
| ID | Case | Method | Pass condition |
|---|---|---|---|
| M1 | Cap: 512th mints, 513th reverts; a batch that straddles the cap reverts | unit, fuzz | Supply ≤ 512 |
| M2 | Per-wallet cap: 3 pass, 4th reverts; sending a token away does not reset the count | unit, fuzz | Counter per address |
| M3 | Price: `msg.value == price × quantity` passes; under and over revert (no refund path); force-sent ETH never breaks the accounting | unit, fuzz | `totalPaid` = n × price; I6 |
| M4 | `mint(0)` reverts and does not stamp `openBlock` | unit | Reverts; unset |
| M5 | Window: before `MINT_START` reverts; `openBlock + 7,199` passes; `+ 7,200` reverts; `openBlock` stamped by the first mint only | unit | Boundaries exact |
| M6 | A quantity above the per-wallet cap in one transaction reverts | unit, fuzz | Reverts |
| M7 | Reentrancy from `onERC721Received` into `mint`, `turn`, `withdraw` | unit | Caps and state hold |
| M8 | Royalties: `royaltyInfo` value; bps cap; ERC-165 interfaces | unit | Matches spec |
| M9 | Pause: guardian or owner pauses; only the owner unpauses; mint stops; turn, `recordSky`, `revealSalt`, offset and transfers work; the window still runs in blocks | unit, invariant | I5 |
| M10 | Withdraw: owner only; full balance; no zero address; reentrancy; a force-sent surplus | unit | I6 |
| M11 | Fail-closed: deployed paused; `mint` reverts before `setProvenance`, before `commitSalt`, and while paused; passes once both are set and `unpause()` is called | unit | I9 |
| C1 | `setProvenance` and `commitSalt`: owner only, non-zero, once (or re-settable until the mint opens, per the spec); both revert after `openBlock` is stamped, even via ownership transfer | unit | Later call reverts |
| O1 | `setStartOffset` before close reverts; at the anchor block reverts (its own hash reads zero); at anchor + 1 passes; sold out early versus window end give the same `closeBlock` rule (the earlier of the two) | unit | Reverts; rule holds |
| O2 | Offset = `uint256(keccak256(abi.encodePacked(blockhash(anchor), "offset"))) % 512`; valid at anchor + 1 and + 256 | fuzz with blockhash mocks | Equals the `startOffsetOf` vectors |
| O3 | Late path after + 256 uses the latest hash and flags late; once; owner excluded | unit | Flag set |
| O4 | Permutation for offsets 0, 1, 255, 511 and fuzz; also for fewer than 512 minted | fuzz | I1 |
| P1 | `publishSeeds`: reverts before the offset, with a wrong list, or a second time; passes with the true list and emits it | unit | Hash equals commitment 1 |
| T1 | Boundary: turn at `openBlock + 201,299` passes; at `+ 201,300` reverts `closed` | unit, fuzz ±5 | Block-based |
| T2 | Last turn wins; one event per turn; transfer keeps the turn; new owner can re-turn, old owner cannot | unit | Storage = last |
| T3 | Only owner or approved may turn; not an unminted id; horizon above 3 reverts | unit | Reverts |
| T4 | A never-turned token reads unset; `turn(id, 0)` reads turned and Dawn and emits `TurnSet`; unset is not Dawn; never-turned plus turned equals minted | unit | Distinct states |
| T5 | Native drift matches `nativeHorizon` vectors; 100,000 random seeds within 3 sd; the real 512 within 99 to 157 each; unset tokens' native horizons sum to the drift counts | differential, fuzz | Informational for the real set |
| S1 | `recordSky` at reveal block reverts (own hash reads zero); at + 1 and + 256 passes; at + 257 goes to the late path | unit with `vm.roll` | Boundaries exact |
| S2 | `recordSky` once; hash equals `blockhash(reveal)`; non-zero | unit | Second call reverts |
| S3 | `revealSalt`: needs a recorded sky; wrong salt reverts; once; permissionless | unit | I4 |
| S4 | Deadline: passes at `saltDeadline`; reverts at + 1; `finalizeWithoutSalt` reverts before it and without a recorded sky, passes after; salt then refused | unit | Exact |
| S4b | Sky recorded on the late path at reveal + 599: deadline is reveal + 899, not + 600 | unit | Exact |
| S4c | Sky recorded on the late path at reveal + 900: deadline is reveal + 1,200 | unit | Exact |
| S5 | `skyOf(id)` equals `keccak256(salt, blockhash, uint256(id))` for ports of the pinned vectors; fallback uses the zero salt | differential | Bit for bit |
| S6 | No function lets anyone alter the recorded hash, salt, offset or turns | invariant | I3 |
| MD1 | `tokenURI` stage by block: placeholder, seed, tide boundaries 50,400 / 100,800 / 151,200 / 201,600, Still, opening, final | unit | Each boundary ±1 |
| MD2 | `freeze(manifestHash)`: only at `block >= openBlock + 208,800` and after the sky is final; irreversible; `setStageURIs` reverts after it; URIs immutable | unit, invariant | I7 |
| AC1 | Access control on every owner function, random callers; the guardian can only pause | fuzz | Only owner (I3) |
| AC2 | Two-step ownership; no self-destruct, delegatecall, upgrade or receive; gas snapshot; reveal-critical functions O(1) | static, unit, gas | I8 |
| D1 | Port every vector from `VECTORS=1 npm test` (including `startOffsetOf`, `provenanceHash` of the 512 test seeds and `seedForToken` at 0, 1, 511) and the 64 added | differential | Equal |
| D2 | Encoding widths per §3.1, including `"offset"` | differential | Equal |
| N1 | Testnet, rehearsal #1: full compressed run (§2.4); `recordSky` window missed; salt deadline missed. Rehearsal #2 repeats it on the final bytecode | testnet | Clean log; late and fallback paths work |
| N2 | Testnet: wrong price at deploy, then never unpause; explorer verify; metadata refresh in a viewer; the offline-calldata signing procedure on a hardware wallet | testnet | Runbook works; renders |

---

## 4. Mint-day runbook
**Thu 12 Nov 2026, T0 = 17:00 UTC.** A person reading only this section can run the day.

### 4.0 Setup
- **Roles.** Captain [YOU] (holds the `guardian` hardware wallet; alone may call PAUSE). Signers on call for the multisig's `unpause()`. Watcher (reads chain, keeps the log). Comms [YOU] for anything public. Support (Discord, email). One person may hold several.
- **Log.** Open a running log: time, block, action, result. Every row gets a block number.
- **Everything is read-only until 17:00** except posts and the multisig's `unpause()`. A No-Go means simply not unpausing.
- **Requires.** G1 to G7 passed (§0.4); §2.7 read-back table on paper; both RPCs; two explorers; the hardware wallet with a small balance; the keeper wallet.

### 4.1 Go/no-go
Two calls: T-3h (14:00) and the final at T-1h (16:00). **Any No means No-Go.**

| Check | How | Pass |
|---|---|---|
| Contract state | Read-back table (§2.7) | Every row matches |
| Address | Compare contract address in site, pinned post, guide, explorer | Identical, letter by letter |
| Closed, not started | `paused`, `openBlock` | true (deployed paused); unset |
| Multisig | Signers reachable; `unpause()` prepared, calldata decoded with a second tool | Ready |
| Site | Load on phone and desktop; Mint button disabled with its note | Up |
| RPC and explorer | Two providers answer; explorer shows recent blocks | Yes |
| Wallets | Captain and keeper hold gas | Yes |
| Comms | Scheduled posts read; moderators online | Yes |
| Team | Captain, Watcher, Comms present | Yes |

**No-Go:** do not sign `unpause()`. Post "postponed" with a new time; the whole schedule shifts (§0.1). A closed, unopened mint starts no clock. High gas alone is not a reason: the price is fixed and the window is 24 h.

### 4.2 Timetable
| UTC | Rel. | Who | Action | Pass |
|---|---|---|---|---|
| 11:00 | T-6h | Captain | Assemble; open log; read-back table | Matches |
| 12:00 | T-5h | Watcher | Explorer address page, event feed, RPC dashboards, balance and supply watches | Live |
| 13:00 | T-4h | Comms | **[YOU]** Pin the official-links and anti-phishing post; Discord slow mode; mods online | Pinned |
| 14:00 | T-3h | All | Freeze the site; **go/no-go #1** (10 min call) | GO |
| 15:00 | T-2h | Captain | Connect hardware wallet; read the address on the device; note base fee | Address matches |
| 16:00 | T-1h | All | **go/no-go #2, final (G8)**. **[YOU]** post: "The mint opens in one hour" | GO |
| 16:30 | T-30m | Captain | **[YOU]** Multisig `unpause()` prepared; signatures collected; nothing executed | Ready |
| 16:45 | T-15m | Comms | **[YOU]** post: "Fifteen minutes" | Posted |
| 16:55 | T-5m | Watcher | Note the last block; go quiet except in the log | Ready |
| **17:00** | **T0** | Captain, Watcher | **[YOU]** Execute `unpause()`. The first successful mint stamps `openBlock` (if it is yours, from a disclosed wallet at the announced price). Watcher records it, computes `revealBlock = openBlock + 201,600`, `turnCloseBlock = openBlock + 201,300`, `mintEndBlock = openBlock + 7,200`, `bloomEnd = openBlock + 208,800`, and compares with the contract views | Equal |
| 17:05 | T+5m | Watcher | Convert those four blocks to UTC from the `openBlock` timestamp and 12 s. Comms resets alarms and scheduled posts to match and posts `<OPEN_BLOCK>` and the block numbers | Times reset |
| 17:10 | T+10m | Watcher | Check the first 10 mints: quantity, price paid, owner. Simulate (call only, no send) a 4th mint from an address that holds 3; it must revert. Scan `Minted` events for any address above 3 | Correct |
| 17:15 | T+15m | Comms | **[YOU]** post: "The mint is open" | Posted |
| hourly | | Watcher | §4.3 dashboard; log the count and the balance | Normal |
| every 6 h | | Comms | **[YOU]** post minted count, facts only, by hand | Posted |
| on sell-out | | Captain | §4.5 | Close block recorded |
| Fri 17:00 | T+24h | Captain | Mint window ends at `openBlock + 7,200` (§4.5) | Closed |

### 4.3 What to watch
| Signal | Normal | Act when |
|---|---|---|
| Contract balance versus `totalPaid − withdrawn` | Balance is equal or higher | Balance LOWER: **PAUSE**. A surplus is force-sent ETH: log it, do not pause |
| Supply | ≤ 512 | Above 512: **PAUSE** |
| Failed mints | Some (gas, race at the cap) | Over 20 percent for 10 min: check price and gas; tell support |
| One address above the cap | Not possible | Investigate: contract minters or a bug; if a bug, **PAUSE** |
| Base fee | Any | Post a note only; no action |
| Site, RPC latency | Fast | Switch RPC; post a status line |
| Scam links, fake mint pages, impersonators | Some | Report, warn once, pin the real address |

### 4.4 Pause criteria
- **PAUSE (Captain, guardian key, at once) if:** the balance is below `totalPaid − withdrawn`; supply exceeds 512; the price paid differs from the announced price; a read-back value changes without a transaction you sent; a credible report of a bug or exploit; a legal order.
- **Do not pause for:** high gas, bots up to the cap, a slow start, criticism, or a surplus balance.
- **A pause stops the mint only.** Seeds already minted are safe; turning, offset and reveal still work. The clock keeps running because the window is in blocks; a pause does not extend it. Decide before T0 whether a shortened window stands (default: it stands, and the new effective end is announced by block).
- **Only the multisig can unpause.** Resuming is another signers' call.
- **Within 15 minutes post:** what happened (one fact), what is paused, next update time. No detail about a suspected exploit.

### 4.5 Situations
- **Sells out in minutes.** The mint closes on the last mint. Record `closeBlock`. Anchor = `closeBlock + 10`. Post "The edition is complete", no brag. Skip to the offset steps.
- **Does not sell out.** The mint ends at `openBlock + 7,200`, anchor = that block + 10. Unsold seeds are never minted later. State the policy (§9.1) before T0.
- **Offset steps.** At anchor + 1 mined: Captain sends `setStartOffset()`; a second caller too. Verify `startOffset()`: take the anchor block's hash `H` from two explorers and run `cast keccak 0x${H#0x}6f6666736574` (the hash followed by the bytes of "offset"). The offset is that result mod 512: `echo $((0x<last three hex digits> & 0x1ff))`. Do not take `H` mod 512; that is a different number. Log it. If the window (anchor + 256) closes, use the late path (F5).
- **Then, at once.** The seeds file and verify page were pre-staged before T0. **[YOU]** publish `seeds.json` (or anyone calls `publishSeeds`), target within 30 minutes of `setStartOffset`; post the offset line; two outsiders verify (§2.9). Everyone who holds the list stays out of the market (F9).
- **Bots and many wallets.** The cap is per address. Say so. Do not promise bot-proofing; no after-the-fact blacklists.
- **Wrong price found.** Before T0: do not unpause; redeploy if immutable, redo commitments, shift the schedule. After T0: **PAUSE**, announce, do not change the price silently. Sold seeds stand. Decide a remedy in writing; a refund is your decision, **[YOU]** only.
- **Suspected exploit.** Pause, stop posting details, call the reviewer, prepare a plain disclosure.
- **Site or explorer down.** Switch host or RPC; the contract is the truth; post the verified address.
- **Discord raid.** Lock links and new members; pin the official links.

### 4.6 Lines to paste (fill the tokens; no exclamation marks)
```
T-1h   The mint opens in one hour, at 17:00 UTC. Contract <CONTRACT_ADDRESS>. Official links only: <SITE_URL>. We will not message you first.
T-15m  Fifteen minutes. Check the contract address against the pinned post before you sign anything.
open   The mint is open. 512 seeds, <PRICE_ETH> ETH, up to <MAX_PER_WALLET> per wallet, for 24 hours. How to mint: <MINT_URL>.
count  Minted so far: <MINTED> of 512. The mint closes at block <MINT_END_BLOCK>.
pause  We paused the mint at <TIME> UTC. Reason: <ONE_FACT>. Seeds already minted are safe and the clock keeps running. Next update by <TIME> UTC.
resume The mint is open again (the multisig called unpause). What happened: <ONE_FACT>. What changed: <ONE_FACT>.
close  The mint is closed. <MINTED> seeds exist. The start offset will be drawn from block <ANCHOR_BLOCK>, which does not exist yet.
offset The start offset is set: <START_OFFSET>, from the hash of block <ANCHOR_BLOCK> (tx <OFFSET_TX>).
seeds  The seeds are published: <SEEDS_URL>. Recompute the provenance hash and compare it with <PROVENANCE_HASH>. How: <VERIFY_URL>.
```

### 4.7 Close of day
- [ ] **[TEAM]** Log complete: final supply, balance, `openBlock` and the four derived blocks written down; transaction hashes saved for tax.
- [ ] **[YOU]** Team wallets, any held seeds, and every person who holds the seed list or the salt, disclosed by address (F9). The offset steps are on the calendar with alarms.

---

## 5. Marketing calendar
### 5.1 Rules
- **Claims.** Say what the rules do. No fake metrics. No "guaranteed", "limited time", "don't miss". No hype promises. No comparison with other projects. Wherever the commitments are described, state the residual trust (F3, F4); never write "no one can steer it" without it.
- **Risk language, always near the mint details.** "These are art objects. Their value may fall to nothing. Nothing here is advice or a promise. Mint only what you would be glad to keep."
- **Rule P (price talk).** If asked about price, value, floor, ROI, "flip" or "will it pump": (1) do not predict, promise, compare or hint; (2) reply once: "We do not speak to price. What we can promise is written in the rules and checkable on chain."; (3) return to what the seeds do; (4) do not reply again.
- **Facts only.** Minted counts and block numbers. No celebration of speed or volume. No "sold out in N minutes".
- **Lint.** Search every draft for exclamation marks, emoji, "floor", "guarantee", "revolution", "moon", "gem", "alpha".
- **Paid or gifted promotion** must be disclosed. No giveaways without counsel.
- **Never** DM first. **Never** post an unverified address. Pin one official-links post. Consent is opt-in by reply to a public call, never by outreach.
- **Timing.** Only posts tied to a timestamp before the mint opens (T-4h to T-15m, "Tomorrow") may be scheduled. Every post tied to a block (tide ends, Turn reminders, the Still Hour, the reveal, the bloom) is sent by hand when the chain head reaches it.
- **Captions.** Every image of a gallery or hero seed says "example seed, not an edition token".
- **Preparation.** Drafts done 72 h before each post (48 h for the first, drafted in days 1–2); [YOU] reads every post again; posting is [YOU].

### 5.2 Assets the repo can produce
Use gallery or hero seeds until T+1. No edition seed is public before the offset.

| ID | Asset | How |
|---|---|---|
| A1 | Hero loop, 12 to 15 s | Screen capture of the site hero crossfading between 3 or 4 gallery seeds |
| A2 | Growth strip, one seed from Seed to Bloomed | `node scripts/lab.mjs strip --seed <GALLERY_SEED> --horizon 0 --out out/launch/A2-growth-strip.png` |
| A3 | The Turn explainer: one seed under all four horizons | `node scripts/lab.mjs shot --seed <GALLERY_SEED> --horizon dawn --stage bloomed --out …`, once per horizon (dawn, dusk, zenith, nadir); tile, or capture the simulator's comparison |
| A4 | Layers pulled apart | Site "How it's made" capture, or `node scripts/lab.mjs layers --seed <GALLERY_SEED> --stage bloomed --outdir out/launch/A4` |
| A5 | Gallery detail pages | Screenshots of the 24 detail views (site) |
| A6 | Timeline graphic | Screenshot of the Reveal timeline section, with dates |
| A7 | Rules card | Screenshot of the plain-English rules (`rulesInPlainEnglish()`) on the mechanic section |
| A8 | Commitment cards (four) | Designed by hand from §1.2; real hashes filled as they land; card 4 names the artist's one remaining choice |
| A9 | Simulator capture, 10 s | Screen recording of scrubbing time and turning |
| A10 | Edition growth stills | `npm run render:canonical … --stills-only` after T+1, for keepers who replied |
| A11 | Final blooms | `npm run render:canonical … --final` after T+29 |
| A12 | Mint card | Text card: edition, price, cap, window in UTC and six zones, contract, link |

`lab.mjs` and `render:canonical` both need `npm run dev` running. Fill the `out/launch/` folder locally; do not commit it.

### 5.3 Calendar (week by week; all posting is [YOU])
Rows from T+7 on are tied to blocks: send them by hand when the head reaches the block. Dates are estimates.

| Week | When (UTC 17:00) | Channel | Asset | Post | Tag |
|---|---|---|---|---|---|
| W-4 | T-30 Tue 13 Oct | none | none | Quiet build; no public post. Accounts secured (§2.1) | **[TEAM]** |
| W-4 | T-28 Thu 15 Oct | X, newsletter sign-up | none | A short text note on the Glass Sea; no art, no dates, no price | **[YOU]** |
| W-3 | T-21 Thu 22 Oct | X, site | A4 | How a seed is made; site is public | **[YOU]** |
| W-2 | T-14 Thu 29 Oct | X, newsletter | A8 | Commitment one: provenance and code hashes and the transaction | **[YOU]** |
| W-2 | T-10 Mon 2 Nov | X, Discord | A3, A9 | The Turn explained; the simulator (the site is already public) | **[YOU]** |
| W-1 | T-7 Thu 5 Nov | X thread, newsletter, Discord | A1 to A8, A12 | Launch thread (§6); commitment two | **[YOU]** |
| W-1 | T-3 Mon 9 Nov | X, Discord, site | A12 | How to mint; how to spot a fake; official links pinned | **[YOU]** |
| W0 | T-2 Tue 10 Nov | Discord | text | Live Q&A on the rules | **[YOU]** |
| W0 | T-1 Wed 11 Nov | X, newsletter | A12 | "Tomorrow", six time zones | **[YOU]** |
| W0 | T0 Thu 12 Nov | X (fixed lines: pin, T-1h, T-15m, open, close; plus 6-hourly counts; incident lines never capped) | A12, A6 | Mint-day lines (§4.6) | **[YOU]** |
| W0 | T+1 Fri 13 Nov | X, site | A8 | Offset set, seeds published, how to verify | **[YOU]** |
| W0 | T+2 Sat 14 Nov | X, Discord | A10 | A call for keepers to reply if they want their seed shown; first look at those who replied | **[YOU]** |
| W0 | T+3 Sun 15 Nov | Discord | A3 | Turn walkthrough; office hours | **[YOU]** |
| W+1 | T+7 Thu 19 Nov | X | A2, A10 | Tide I ends: The Deep | **[YOU]** |
| W+2 | T+14 Thu 26 Nov | X, newsletter | A10 | Tide II ends: The Sheets; Turn reminder 1 | **[YOU]** |
| W+3 | T+21 Thu 3 Dec | X, newsletter | A10, A7 | Tide III ends: The Threads; Turn reminder 2 | **[YOU]** |
| W+3 | T+25 Mon 7 Dec | X, Discord | A6 | Three days to the Still Hour | **[YOU]** |
| W+4 | T+27 Wed 9 Dec | X, Discord, newsletter | A7 | Turning closes tomorrow; block and time in six zones; the call-out for `recordSky()` watchers | **[YOU]** |
| W+4 | T+28 Thu 10 Dec | X (five fixed lines and up to four bloom-watch posts; late-path and fallback lines never capped) | A6 | Reveal-day lines (§2.11) | **[YOU]** |
| W+4 | T+29 Fri 11 Dec | X, newsletter, site | A11 | The blooms; verification write-up | **[YOU]** |
| W+4 | T+30 Sat 12 Dec | X, Discord | text | Thanks; a short retrospective | **[YOU]** |

---

## 6. Launch thread
Post at T-7, Thu 5 Nov, 17:00 UTC. Voice: quiet, exact, a little mythic. No exclamation marks, no emoji, no floor-price talk. Each post is 280 characters or fewer with tokens in place. Real values are longer than tokens (a hash is 66 characters, an address 42, and a link may count as 23), so recount after filling. Never invent a hash or an address.

### 6.1 The thread (12 posts)
```
1
Halocline is five hundred and twelve seeds from the Glass Sea. Each begins dim and half-formed, grows for four tides on the block clock, then blooms on a fixed day into its final form. The mint opens Thu 12 Nov 2026, 17:00 UTC. <SITE_URL>
[image: A1 hero loop, gallery seeds crossfading]

2
Each seed is light through stacked glass: an abyss, sheets of settled colour, threads, a lamp, a veil of dust, a little grain. On the site the layers pull apart, so you can see how the picture is made. Images here are example seeds, not edition tokens.
[image: A4 layers pulled apart, one gallery seed]

3
The clock is the chain. One block is twelve seconds. A tide is 50,400 blocks, seven days. Four tides pass between mint and reveal: the Deep, the Sheets, the Threads, the Lamp. The seed changes a little at every one.
[image: A2 growth strip, Seed to Bloomed]

4
A keeper does one thing: turn a seed toward Dawn, Dusk, Zenith or Nadir. It costs gas and nothing else. Turn as often as you like; the last turn counts, and a buyer inherits it. A seed never turned drifts to a horizon of its own.
[image: A3 the Turn explainer, four horizons of one seed]

5
The horizon shapes the composition and the colour of the light. It does not shape rarity. Every horizon has the same odds of every trait. Turning closes 300 blocks, about an hour, before the reveal. We call it the Still Hour.
[image: A7 rules card]

6
Commitment one, on chain before the mint: seeds <PROVENANCE_HASH>, code <CODE_HASH>. The 512 seeds stay sealed until the mint closes; then anyone can check them.
[image: A8 commitment card 1, provenance and code]

7
Commitment two. The artist's salt is committed by hash before the mint: <SALT_COMMITMENT>. The salt stays secret until the reveal block has passed, so no block builder can aim at it.
[image: A8 commitment card 2, salt]

8
Commitment three. The mint is blind. Ids run in order; the seed each id receives is shifted by an offset drawn from a blockhash that does not exist until the mint has closed. Nobody can pick a seed by picking an id.
[image: A8 commitment card 3, blind mint and offset]

9
Commitments four to six. Seeds are published once the offset is set. Turning closes in the Still Hour. The sky comes from the salt, the reveal block's hash and the token id. One artist choice remains: reveal the salt, or a fixed fallback stands. <VERIFY_URL>
[image: A8 commitment card 4, publish, turn, sky, and the one remaining choice]

10
The mint: 512 seeds, <PRICE_ETH> ETH each, up to <MAX_PER_WALLET> per wallet, open for 24 hours from Thu 12 Nov 17:00 UTC. Contract <CONTRACT_ADDRESS>. How to mint: <MINT_URL>. We will never message you first.
[image: A12 mint card]

11
The calendar, in blocks after the mint opens: 50,400, 100,800 and 151,200 end the tides. 201,300 closes turning. 201,600 opens the sky. 208,800 is final. Dates are estimates; block numbers decide.
[image: A6 timeline graphic]

12
These are art objects on a public chain. Their value can fall to nothing, and nothing here is advice or a promise. The contract is <REVIEW_STATUS>. Mint only what you would be glad to keep. Everything to check: <VERIFY_URL>
[image: A5 gallery detail page, one seed with traits; example seed, not an edition token]
```

### 6.2 Alt text
| Post | Asset | Alt text |
|---|---|---|
| 1 | A1 | Loop of a tall dark artwork: stacked translucent sheets of <PALETTE> light drift slowly and a single bud of light glows near the lower centre before the frame crossfades to another seed. |
| 2 | A4 | One Halocline seed pulled apart in depth, from a blurred dark abyss at the back to glass sheets, fine glowing threads, a bright lamp and drifting dust at the front. |
| 3 | A2 | Nine stills of one seed, left to right: a dim half-formed bud, deepening colour, settling sheets, reaching threads, a swelling lamp, and the open bloom. |
| 4 | A3 | Four versions of one seed side by side, turned to Dawn, Dusk, Zenith and Nadir: the same glass sheets, with the bloom rising, trailing, pouring down, or opening in every direction. |
| 5 | A7 | A dark card in pale serif text listing the rules of the Turn: one action, free and equal, the last turn counts, the Still Hour, the sealed sky. |
| 6 | A8 | A dark card headed Commitment one, showing the provenance hash and the code hash in monospace and a line saying the list of 512 seeds stays sealed until the mint closes. |
| 7 | A8 | A dark card headed Commitment two, showing the salt commitment hash and a line saying the salt stays secret until after the reveal block. |
| 8 | A8 | A dark card headed Commitment three: token ids in order, an offset drawn from a future blockhash, and seeds shifted by that offset. |
| 9 | A8 | A dark card headed Commitments four to six: seeds published, the Still Hour, the sky formed from salt, blockhash and token id, and a line naming the artist's one remaining choice. |
| 10 | A12 | A dark mint card listing edition size, price, wallet limit, the 24-hour window in UTC, and the contract address. |
| 11 | A6 | A horizontal timeline of 28 days marked with four tides, the Still Hour, the reveal and the day of blooming. |
| 12 | A5 | A large view of one gallery seed: glass sheets in deep <PALETTE> tones with a bright bloom, and its traits listed beneath. |

Check each alt text against the final image before posting.

### 6.3 Announcement for Discord and newsletter
```
Halocline opens Thu 12 Nov 2026, 17:00 UTC.

512 seeds from the Glass Sea. Each begins dim and half-formed and grows for four tides, twenty-eight days, on the block clock. At block 201,600 after the mint opens, the sky opens and every seed blooms over one day. In between, a keeper may turn a seed toward Dawn, Dusk, Zenith or Nadir. It is free, repeatable and closes one hour before the reveal.

The reveal is committed in the open: the seed list and the code by hash (<PROVENANCE_HASH>, <CODE_HASH>), the artist's salt by hash (<SALT_COMMITMENT>), and a blind offset drawn after the mint closes. One choice remains with the artist: to reveal the salt, or to let a fixed fallback stand. Both are visible on chain. Every step, and the residual risks, can be checked at <VERIFY_URL>.

Mint: <PRICE_ETH> ETH, up to <MAX_PER_WALLET> per wallet, 24 hours. Contract <CONTRACT_ADDRESS>. How to mint: <MINT_URL>. We will never message you first, and the site never asks you to connect a wallet.

These are art objects. Their value may fall to nothing. Mint only what you would be glad to keep.
```
Keep "the site never asks you to connect a wallet" only if the mint interface is the explorer Write tab; otherwise say where wallets connect.

---

## 7. Risk register
| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Contract bug loses funds or breaks the reveal | Low | High | Small surface, reviewed libraries, §3 tests, review option A or B, two rehearsals, deploy paused, pause (mint only), no upgrade path | Captain, Contract dev |
| 2 | Sky not recorded inside 256 blocks | Medium | High | Three callers, alarms on the head, high fee, documented late path; decide EIP-2935 history reads (§9.1) | Captain |
| 3 | Salt lost or leaked before the reveal | Low | High | Offline generation, no cloud, two paper or steel copies plus an encrypted drive, a second holder, restore drills, fallback deadline; real salt sent only after `recordSky` is safe. If leaked before the reveal: proceed, disclose at once, and publish the reveal block's builder and fee recipient (F4) | Captain |
| 4 | Salt withholding suspected | Low | Medium | Deadline, fallback, public reveal-within-100-blocks commitment, F3 text | Captain, Comms |
| 5 | Wrong price or parameter deployed | Low | High | Immutable values; production constants checked by unit tests at production values and by the T-1 read-back; rehearsals use the compressed profile | Captain |
| 6 | Phishing clones and fake mint pages | High | High | One pinned official-links post, address in one place, registrar lock, no DMs rule, moderator sweeps | Comms |
| 7 | Bots and many wallets | High | Medium | Say the cap is per address; open public mint; 24 h window with a fixed price; no bot-proof claim | Captain |
| 8 | Gas spike or congestion on the day | Medium | Medium | Fixed price, long window, exact-price mint, gas plan, second RPC | Watcher |
| 9 | Render or metadata pipeline fails on reveal day | Medium | Medium | Dry runs, timed budget, parallel machines, live viewer by chain state as fallback, finals due by T+29 | Art/pipeline lead |
| 10 | Metadata host or pins vanish | Low | High | Two pinning providers, optional permanent storage, freeze only after both gateways verified | Captain |
| 11 | A bloom looks weak or broken | Low | Medium | Audits across seeds, all four horizons and sample skies before launch (§2.3); no rerolls, said in advance | Art/pipeline lead |
| 12 | Owner key or account compromise | Low | High | Hardware wallet, fresh deployer, multisig owner, separate guardian, two-step ownership, hardware 2FA | Captain |
| 13 | Legal, tax or regulatory question | Medium | Medium | Counsel and entity chosen early, terms, jurisdiction checks, transaction ledger | Captain |
| 14 | Insiders trade on the seed list or the salt before the public sees it | Low | Medium | Publish the seeds at once, `publishSeeds`, a no-trade list with addresses, private-orderflow reveal (F9) | Captain, Comms |
| 15 | Scheduled posts or alarms drift from the chain (missed slots) | High | Medium | Schedule only pre-mint posts; alarms on the head; recompute times at T+21 and T+27 | Comms, Watcher |

---

## 8. Appendix
### A. Glossary
- **Glass Sea** — the black, patient water that keeps every light that ever fell into it.
- **Halocline** — the shimmer where two sheets of settled light meet.
- **Tidekeeper** — one of the shore people who lift a seed out of the deep.
- **Seed** — a piece before the reveal: dim, half-formed, growing.
- **Bloom** — a piece after the reveal, in its final form.
- **Keeper** — the wallet holding a seed. Never "owner" or "holder" in copy.
- **Block** — one beat of the Tide: 12 seconds.
- **Tide** — the clock, or one week (50,400 blocks). Four tides make 28 days.
- **The Deep, The Sheets, The Threads, The Lamp** — the four tides, in order.
- **Horizon** — Dawn, Dusk, Zenith or Nadir; the one thing a keeper chooses.
- **Turn** — face your seed toward a horizon. Free, repeatable, last turn counts.
- **Drift** — an unturned seed faces its native horizon.
- **Native horizon** — `uint8(keccak256(seed,"native")[0]) % 4`.
- **Still Hour** — the last 300 blocks before the reveal; turning is closed.
- **Sky (sealed sky)** — the reveal entropy: `keccak256(artistSalt, blockhash(REVEAL_BLOCK), tokenId)`.
- **Bloom seed** — `keccak256(seed, horizon, sky)`; the source of the sealed traits.
- **Salt** — the artist's secret, committed by hash before the mint.
- **Provenance hash** — the hash committing all 512 seeds before the mint. The **code hash** commits the software beside it.
- **Start offset** — the shift in seed assignment, drawn after the mint closes: `uint256(keccak256(blockhash(anchor) ‖ "offset")) % 512`.
- **Sheets, threads, lumen, veil, grain, abyss** — the art's layers, back to front.
- **Inclusion** — a rare flaw in the glass; about one seed in four carries one.

**Technical terms**
- **Multisig** — a wallet that needs M of N signers to act. **Guardian** — one key that may pause and do nothing else.
- **Blockhash** — the hash of a recent block; the EVM only remembers the last 256. **Mempool** — the public queue of unmined transactions; anything you send can be read there.
- **Calldata** — the bytes of a transaction that say which function to call and with what. **Priority fee** — the tip that gets a transaction in sooner.
- **Safe head / finality** — the chain's own markers for "very unlikely to be undone" (about 6 to 13 min) and "cannot be undone" (about 13 to 19 min).
- **RPC** — the server your tools use to read the chain and send transactions. **Explorer Write tab** — the block explorer's page for calling a contract from your wallet.
- **Testnet and faucet** — a practice chain, and a tap that gives free practice ETH.
- **Pin / IPFS** — pay a service to keep a file available by its content hash.
- **bps** — basis points: 100 bps is 1 percent. **ERC-2981** — the royalty-info standard. **ERC-4906** — the event that tells marketplaces to refresh metadata.
- **Fuzz and invariant tests** — tests fed random inputs, and tests that check a rule holds after any sequence of calls.
- **keccak256** — the hash function the EVM uses.

### B. Command cheat-sheet
```
npm ci
npm test                       # reference model, clock, turn rules, pinned vectors
VECTORS=1 npm test             # also prints SEED SALT HASH native sky bloom0 commit
npm run typecheck
npm run audit:traits           # 1,000-seed trait audit, writes docs/AUDIT.md
npm run audit:pixels           # pixel-quality audit, writes docs/AUDIT.md
npm run build                  # typecheck + production build
npm run preview                # serves the build on http://localhost:4173
npm run dev                    # serves on http://localhost:5173 (needed by lab.mjs and render:canonical)
npm run provenance             # 512 seeds from the master secret -> seeds.json + provenance hash
npm run render:canonical       # final 2400x3000 PNGs and growth stills, pinned Chromium
npm run shoot                  # site screenshots

node scripts/lab.mjs shot   --seed <SEED> --horizon dawn --stage bloomed --out out/a.png
node scripts/lab.mjs strip  --seed <SEED> --horizon 0 --out out/strip.png
node scripts/lab.mjs layers --seed <SEED> --stage bloomed --outdir out/layers
node scripts/lab.mjs info   --seed <SEED> --horizon <0-3> --sky <SKY> --stage bloomed
```

Secrets, offline, history off (T-14 and T-30 to T-22). The secret is read from the prompt, never typed as an argument:

```
read -rs HALOCLINE_MASTER && export HALOCLINE_MASTER
npm run provenance -- --out <VAULT>/prov               # <VAULT> = encrypted offline volume
unset HALOCLINE_MASTER
npm run provenance -- --verify <VAULT>/prov/seeds.json <PROVENANCE_HASH>

read -rs SALT && export SALT
npx tsx -e "import('./src/art/mechanic.ts').then(m => console.log(m.commitmentOf(process.env.SALT)))"
printf '0x%s' "$SALT" | cast keccak                     # second tool; must match; reads stdin on current Foundry, test it at T-30
unset SALT
```

Renders (dev server running; ‡ = flag added by a §2.1 repo task). `turns.json` is `{ "<tokenId>": 0..3 }`, the last turn per token below `openBlock + 201,300`; a missing id drifts.

```
# growth stills, T+1 onward: never writes <id>.png or <id>.json  ‡
npm run render:canonical -- --seeds <SEEDS_FILE> --offset <START_OFFSET> --turns turns.json --stills-only --out out/stills

# finals, only after the sky is safe. Both hashes without 0x.
HASH=$(cast block <REVEAL_BLOCK> --field hash --rpc-url <RPC_URL>)
npm run render:canonical -- --seeds <SEEDS_FILE> --offset <START_OFFSET> --turns turns.json \
  --salt <SALT> --blockhash "${HASH#0x}" --final --out out/final                      # --final ‡
```

Read-only checks with Foundry's `cast` (any keccak tool works). Function names follow §3.1; adjust to the final ABI.

```
cast call <CONTRACT_ADDRESS> "provenanceHash()(bytes32)" --rpc-url <RPC_URL>
cast call <CONTRACT_ADDRESS> "codeHash()(bytes32)"       --rpc-url <RPC_URL>
cast call <CONTRACT_ADDRESS> "saltCommitment()(bytes32)" --rpc-url <RPC_URL>
cast call <CONTRACT_ADDRESS> "startOffset()(uint256)"    --rpc-url <RPC_URL>
cast call <CONTRACT_ADDRESS> "skyOf(uint256)(bytes32)" <TOKEN_ID> --rpc-url <RPC_URL>   # strip 0x before a repo command
cast block <BLOCK_NUMBER> --field hash --rpc-url <RPC_URL>  # compare with skyBlockHash and the offset anchor
cast keccak 0x${ANCHOR_HASH#0x}6f6666736574                 # start offset = this mod 512 (§4.5)
cast keccak 0x<SALT><BLOCKHASH><TOKEN_ID as 32 bytes>       # a token's sky; after the reveal only
```

Gotchas:
- Seeds, skies, salts and blockhashes given to any repo command (`--seeds` contents, `--sky`, `--salt`, `--blockhash`) must be exactly 64 lowercase hex characters, **without `0x`** (use `${HASH#0x}`). Anything else is hashed as text, silently, until repo task 1 lands. `--offset` is a plain number.
- `render:canonical` with no `--salt` and `--blockhash` falls back to `rehearsal:<id>` skies and writes identically named files with no marker. Never run it for finals without `--final`.
- `--horizon` takes `dawn`, `dusk`, `zenith`, `nadir` or `0` to `3`. `--sky` takes 64 hex or `rehearsal:N`.
- Rehearsal skies are labelled; a rehearsal never shows a real bloom. Never pin a rehearsal render before block 201,600.

### C. Link and asset checklist
Fill each token once, then find-and-replace in every draft. Leave `<SALT>` empty until the reveal.

| Token | What | Filled | Value |
|---|---|---|---|
| `<SITE_URL>` `<VERIFY_URL>` `<MINT_URL>` | Site, verify page, how-to-mint page | T-21 to T-7 | |
| `<CONTRACT_ADDRESS>` `<CHAIN_NAME>` `<EXPLORER_URL>` | Production contract | T-14 | |
| `<PROVENANCE_HASH>` `<CODE_HASH>` `<PROVENANCE_TX>` | Commitment 1 | T-14 | |
| `<SALT_COMMITMENT>` `<SALT_COMMIT_TX>` | Commitment 2 | T-7 | |
| `<PRICE_ETH>` `<MAX_PER_WALLET>` | As decided (default 0.05, 3) | T-7 | |
| `<REVIEW_STATUS>` `<REVIEW_REPORT_URL>` | Audited, reviewed by name, or unaudited | T-7 | |
| `<OPEN_BLOCK>` `<REVEAL_BLOCK>` `<TURN_CLOSE_BLOCK>` `<MINT_END_BLOCK>` | Derived from `openBlock` | T0 | |
| `<MINTED>` `<ANCHOR_BLOCK>` `<START_OFFSET>` `<OFFSET_TX>` | Mint close and offset | T0 to T+1 | |
| `<SEEDS_URL>` `<SEEDS_FILE>` | Published `seeds.json` | T+1 | |
| `<TURN_SNAPSHOT_URL>` | Snapshot of 512 turns | T+28 | |
| `<SKY_BLOCKHASH>` `<SKY_TX>` `<LATE_BLOCK>` `<BUILDER>` `<FEE_RECIPIENT>` | Sky record and the reveal block's builder | T+28 | |
| `<SALT>` | Public only after `revealSalt`; never written down here first | T+28 | |
| `<FINAL_MANIFEST_HASH>` `<FREEZE_TX>` | Freeze | T+29 | |
| `<SUPPORT_EMAIL>` `<DISCORD_URL>` `<X_HANDLE>` `<NEWSLETTER_URL>` `<TERMS_URL>` `<PRIVACY_URL>` | Official links | T-7 | |
| `<GALLERY_SEED>` `<PALETTE>` `<TIME>` `<ONE_FACT>` `<PERCENT>` `<VAULT>` `<RPC_URL>` `<TOKEN_ID>` | Per-use fills | as used | |

Asset checklist: for each of A1 to A12 (§5.2) tick **made**, **reviewed**, **alt text checked**. A1 to A9 and A12 before T-7 (A8 is four cards); A10 after T+1 with consent; A11 after T+29.

---

## 9. FINAL LIST — Only you can do these
Anything that signs a transaction, spends money or posts publicly. The assistant that wrote this file did none of it and never will. A line tagged [TEAM] elsewhere that would sign, spend or post is a [YOU] line; if you delegate it, write the delegation in the log.

### 9.0 Standing rules
- **Never paste** a private key, seed phrase, master secret or salt into the repo, the site, a chat, a ticket, a doc, an email or an AI assistant. Nobody legitimate will ask.
- **Hardware wallet** for every mainnet signature. Read the address and the amount on the device screen.
- **Fresh deployer address**, used for this deploy only.
- **Multisig** for ownership and withdraw when funds are meaningful. Book the signers' call for each multisig transaction in the plan (`setProvenance`, `commitSalt`, `unpause`, `setStageURIs`, `freeze`, `withdraw`).
- Send a **small test transaction** before a large one.
- **Never sign blind.** A hardware wallet cannot show a `bytes32` argument of a custom contract, so for `setProvenance` and `commitSalt` build the calldata offline (`cast calldata`), decode it with a second tool, and compare it on the device (for a Safe, the `safeTxHash`). Rehearse the identical procedure on testnet. No message you did not start; no approval you do not understand.
- Treat every DM as hostile.
- Keep backups on paper or steel in two places, and tell a second person where they are.

### 9.1 Decisions only you can make
| Decision | Default here | Decide by |
|---|---|---|
| Chain (Ethereum mainnet L1 only unless you accept a new randomness design and review, §0.1) | L1, 12-second blocks | T-30 |
| Audit budget and option A, B or C | B at least | T-30 |
| The money table (§2.1) filled in | Every line has an estimate | T-30 |
| Allowlist or open mint | Open | T-27 |
| Approve the spec | Two pages from §3 | T-27 |
| Royalty percentage cap and receiver | Decide; capped in the contract | T-27 |
| Withdraw rule (when, to whom) | After `freeze()` at T+29, to the multisig | T-27 |
| Artist reserve | None. If any, mint it in the window from a disclosed wallet; never after the offset | T-27 |
| `commitSalt` once-only or re-settable until the mint opens | Once-only, calldata checked offline | T-27 |
| `publishSeeds` on chain (about 16 KB of calldata) | Yes | T-27 |
| Read older hashes through the EIP-2935 history contract (about 8,191 blocks, about 27 h) instead of the 256-block window | Decide after a testnet check that it is live on your chain; if not adopted, record why | T-27 |
| Mix an outside entropy source (a drand round or a VRF word) into the sky to remove F4's residual | No; disclose F4. Adopting changes `mechanic.ts` and every vector | T-27 |
| Forfeitable salt bond (F3) | None | T-27 |
| Price | 0.05 ETH (placeholder) | T-21 |
| Cap per wallet | 3 (placeholder) | T-21 |
| Legal entity and counsel | Decide | T-22 |
| Keeper licence terms | Decide | T-22 |
| Reveal roles, the witness and the backup salt-holder | Named | T-22 |
| Unsold policy | The edition is what sold; announced before T0 | T-14 |
| Mint interface (explorer Write tab, a separate reviewed page, or a launchpad) | Explorer Write tab | T-14 |
| Storage and pinning budget | Two pinning providers | T-14 |
| Shift the dates | Placeholders | any gate |

### 9.2 Steps by date
Every post in the §5.3 calendar is **[YOU]**. *Verify before each:* lint clean (§5.1), tokens filled, every link opened, every address matched to the explorer. *Not:* any claim you cannot show on chain.

**T-30…T-22 · Readiness**
- [ ] **[YOU]** Pay for domain (and any lookalike domains), hosting and email. *Verify:* you control the registrar login with a hardware key. *Not:* the wallet email, a shared card.
- [ ] **[YOU]** Buy hardware wallets and security keys, each with a spare. *Verify:* bought new and sealed, from the maker. *Not:* a reseller or a used device.
- [ ] **[YOU]** Pay counsel and form or pay for the legal entity. *Verify:* the scope covers §2.1 legal questions. *Not:* an open-ended retainer.
- [ ] **[YOU]** Deploy the private preview. *Verify:* password or unlisted; no wallet code (§2.1). *Not:* a public link.
- [ ] **[YOU]** Create the comms accounts, including the newsletter sign-up page, and secure them; lock the domain. *Verify:* hardware-key 2FA, recovery codes offline. *Not:* codes in a notes app.
- [ ] **[YOU]** Pay the review or audit deposit, and the balance on delivery. *Verify:* scope names the contract commit and this surface. *Not:* an open-ended scope.
- [ ] **[YOU]** Prepare the offline machine, then generate and store the master secret and salt. *Verify:* offline machine, history off, two copies, two hashes match. *Not:* any cloud, photo or chat.
- [ ] **[YOU]** T-28: post the text-only note. *Verify:* no art, no dates, no price. *Not:* a sign-up page that collects more than an email.

**T-21…T-15 · Testnet (no real money) and the multisig**
- [ ] **[YOU]** Make the site public. *Verify:* copy says "mint details on 5 Nov"; mint date, price, cap and window swapped out. *Not:* the mint address.
- [ ] **[YOU]** Fund the testnet key from a faucet. Deploy rehearsal contracts and send rehearsal transactions (you may hand the throwaway key to [TEAM]). *Verify:* a throwaway testnet key, a test master secret and a test salt. *Not:* the production key, secret or salt; never reuse the testnet key.
- [ ] **[YOU]** Create the multisig on mainnet and set the guardian key. *Verify:* each signer's address read from its own device; a small test transaction. *Not:* two signers on one device or one phone.

**T-14 · Commit provenance**
- [ ] **[YOU]** Keep `seeds.json` offline. *Verify:* encrypted, two copies, nothing staged in git. *Not:* a synced folder.
- [ ] **[YOU]** Deploy the production contract (paused, guardian set) and start the two-step ownership transfer. *Verify:* chain, compiler and optimiser, constructor arguments against the read-back table, fresh deployer, hardware wallet. *Not:* mainnet from a hot wallet or a browser profile with extensions.
- [ ] **[YOU]** From the multisig, `acceptOwnership()`. *Verify:* `owner()` reads the multisig. *Not:* an address you have not read from the device.
- [ ] **[YOU]** Verify the source on the explorer. *Verify:* the exact commit. *Not:* a "flattened" copy you cannot reproduce.
- [ ] **[YOU]** Send `setProvenance(<PROVENANCE_HASH>, <CODE_HASH>)` from the multisig. *Verify:* two people recomputed the same seeds hash; the code hash matches the tagged source; calldata decoded offline and compared on the device. *Not:* the hash of a file you have since regenerated.
- [ ] **[YOU]** Post commitment one. *Verify:* transaction link opens. *Not:* the seed list.

**T-14…T-8 · Rehearsal #2**
- [ ] **[YOU]** Deploy rehearsal #2 and send the rehearsal transactions. *Verify:* testnet selected in the wallet. *Not:* the real salt, even to "test".
- [ ] **[YOU]** Pay for pinning and RPC plans. *Verify:* keys are domain-restricted. *Not:* keys in the repo or the client bundle.

**T-7 · Commit the salt hash**
- [ ] **[YOU]** Restore drill of the salt backup, offline. *Verify:* `keccak256(salt)` matches your two tools. *Not:* leave the salt on any online machine.
- [ ] **[YOU]** Send `commitSalt(<SALT_COMMITMENT>)` from the multisig. *Verify:* the value equals your two offline computations, char for char; calldata decoded offline and compared on the device. *Not:* the salt itself. That would end the reveal's fairness.
- [ ] **[YOU]** Publish the official-links page and the mint details. *Verify:* every value matches the contract; G6 passed first. *Not:* a price or address you have not read on chain.
- [ ] **[YOU]** Post the launch thread, newsletter, Discord announcement. *Verify:* every token filled, every link opened, every address matched to the explorer, lint clean (§5.1), every post recounted at 280 or fewer. *Not:* an invented hash or address.

**T-6…T-1 · Final gates**
- [ ] **[YOU]** Hardware-wallet drill on testnet, including a multisig `unpause()`. *Verify:* the address on the device screen. *Not:* a mainnet network.
- [ ] **[YOU]** Fund the owner and keeper wallets. *Verify:* balances cover 5× the gas plan. *Not:* the deployer's whole treasury in the hot keeper wallet.
- [ ] **[YOU]** Schedule the pre-mint timestamp posts only. *Verify:* times in UTC; the channel is the right account. *Not:* any post tied to a block, and no auto-post you have not re-read.
- [ ] **[YOU]** Post "Tomorrow". *Verify:* six time zones correct. *Not:* a promise about outcomes.
- [ ] **[YOU]** Write GO in the log. *Verify:* G1 to G6 marked. *Not:* GO while any gate is open.

**T0 · Mint day**
- [ ] **[YOU]** T-4h: pin the official-links and anti-phishing post. *Verify:* one address, opened from the pin. *Not:* a second address anywhere.
- [ ] **[YOU]** Multisig `unpause()` at 17:00: prepared at 16:30, executed only after go/no-go #2. *Verify:* the criteria in §4.1 all pass. *Not:* before GO. A No-Go means never signing it.
- [ ] **[YOU]** Any mint by you or the team, including the first mint that stamps `openBlock`. *Verify:* a disclosed wallet, the announced price, before the offset. *Not:* a mint after the close.
- [ ] **[YOU]** `pause()` from the guardian key (only on §4.4 criteria), and the multisig `unpause()` to resume. *Verify:* the criterion is one of those listed. *Not:* pause for gas or criticism.
- [ ] **[YOU]** Posts: T-1h, T-15m, open, counts, pause/resume, close (§4.6). *Verify:* the numbers come from the chain, not memory. *Not:* speed or volume boasts.
- [ ] **[YOU]** Any refund or remedy for a wrong price. *Verify:* written decision, a published list. *Not:* quiet transfers.
- [ ] **[YOU]** Disclose team wallets and everyone who holds the seed list or the salt, by address. *Verify:* the list matches §4.7. *Not:* a name without an address.

**T+1…T+7 · Offset and seeds**
- [ ] **[YOU]** `setStartOffset()`. *Verify:* the anchor is closed + 10 and has been mined; an explorer confirms the hash. *Not:* before the mint has closed.
- [ ] **[YOU]** Publish `seeds.json` at once (and call `publishSeeds` if it exists). *Verify:* it recomputes to the on-chain hash. *Not:* an edited or reformatted file.
- [ ] **[YOU]** Pin the growth stills, then `setStageURIs(...)` and `refreshMetadata()`; repeat at each tide end. *Verify:* the pre-pin check passed (no `<id>.png`, no bloom attribute); stills match the turns at that block. *Not:* pointing at unpinned files, or pinning a bloomed render.
- [ ] **[YOU]** Post the T+2 call for keepers and the first look at those who replied, the T+3 walkthrough, and the tide post (T+7). *Verify:* block numbers, written consent. *Not:* price talk, or a keeper who did not reply.

**T+7…T+27 · Tides II and III**
- [ ] **[YOU]** Pin, `setStageURIs`, refresh and post the tide note at T+14 and T+21. *Same checks.*
- [ ] **[YOU]** Turn reminders (T+14, T+21, T+25, T+27), sent by hand at the block. *Verify:* block and time. *Not:* "last chance" pressure.
- [ ] **[YOU]** Answer questions and run office hours, or name a moderator with a written brief. *Verify:* Rule P. *Not:* any word about price.
- [ ] **[YOU]** Mid-period restore drill of the salt backup, offline. *Verify:* the hash matches. *Not:* leave the salt on any online machine.

**T+27…T+28 · Reveal**
- [ ] **[YOU]** Post "Turning closes tomorrow" and the aggregate of turns. *Verify:* the chain head and counts. *Not:* per-token hints.
- [ ] **[YOU]** Fund the owner and keeper wallets. *Verify:* 5× the gas plan. *Not:* an old balance.
- [ ] **[YOU]** Arrange the late-path and fallback callers (a named third party, not the owner) and post the public call-out for `recordSky()`. *Verify:* the person has tested a call on testnet. *Not:* the owner address as the late caller.
- [ ] **[YOU]** Bring the salt backup to the signing room, sealed. *Verify:* the witness holds the second sealed copy. *Not:* type the salt anywhere yet.
- [ ] **[YOU]** Post "Turning closes in one hour" and "The Still Hour has begun", each by hand at its block, and publish the snapshot of all 512 turns. *Verify:* the chain head. *Not:* a countdown promise you cannot keep.
- [ ] **[YOU]** `recordSky()` at reveal + 1. *Verify:* the block is mined; simulation shows success. *Not:* wait for a partner while the window runs.
- [ ] **[YOU]** `revealSalt(<SALT>)`. *Verify:* `recordSky` is mined and the safe head has passed it, the hash matches the explorer, `keccak256(salt)` equals the commitment, sent through the private-orderflow RPC. *Not:* broadcast earlier. Even a reverted early call publishes the salt in the mempool.
- [ ] **[YOU]** Post the sky and salt lines, including the reveal block's builder and fee recipient. *Verify:* finality reached. *Not:* trade in any wallet on the F9 list.
- [ ] **[YOU]** If the late path or the fallback is used: post it in plain words at once. *Verify:* the block numbers. *Not:* soften it.
- [ ] **[YOU]** `refreshMetadata()` and up to four bloom-watch posts. *Verify:* the event appears. *Not:* change files after you have posted.

**T+29…T+30 · Aftermath**
- [ ] **[YOU]** Pin all finals with two providers. *Verify:* 512 of 512 finals match traits recomputed from the contract's `skyOf(id)`; two gateways open them. *Not:* pin a file with a known wrong trait.
- [ ] **[YOU]** `setStageURIs(...)` to the finals, then `freeze(<FINAL_MANIFEST_HASH>)`. *Verify:* manifest hash recorded; five random `tokenURI`s match. *Not:* freeze with a known wrong file, because it is irreversible.
- [ ] **[YOU]** Post the verification write-up and the thanks. *Verify:* claims match the chain. *Not:* rewrite a bad result.
- [ ] **[YOU]** Set up the marketplace collections and royalty settings. *Verify:* signed in with the hardware wallet on the official site. *Not:* a link from a DM.
- [ ] **[YOU]** `withdraw` to the multisig, after `freeze()`. *Verify:* destination on the device; amount equals the contract balance, which must be at least `totalPaid`. *Not:* to a hot wallet.
- [ ] **[YOU]** Retire the deployer address; rotate keys; decide the master secret's fate. *Not:* keep spare copies scattered.
