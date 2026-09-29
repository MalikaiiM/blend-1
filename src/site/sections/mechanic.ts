// 03 — The mechanic. The simulator of the drop and the reveal, and the rules in plain English.
// Owner: mechanic section. Helpers: mechanic.model.ts · mechanic.stage.ts · mechanic.glyphs.ts · styles/mechanic.css

import '../styles/mechanic.css';
import {
  PARAMS, REVEAL_BLOCK, TURN_CLOSE_BLOCK, BLOOM_END_BLOCK, timeline, deriveTraits, rehearsalSky, rulesInPlainEnglish,
  effectiveHorizon, isTurnOpen, MechanicError, HORIZON_NAMES, type Horizon, type PieceState, type Traits,
} from '../../art/index.ts';
import { DEMO } from '../../data/featured.ts';
import { el, watchVisible } from '../lib/dom.ts';
import { reducedMotion, onMotionChange } from '../lib/motion.ts';
import { fmtInt, fmtSpan, shortSeed } from '../lib/format.ts';
import { getThumb } from '../lib/piece.ts';
import { Stage, type StageQuality } from './mechanic.stage.ts';
import { GLYPHS, PLAY_MARK, PAUSE_MARK } from './mechanic.glyphs.ts';
import {
  POS_MAX, BLOCK_MAX, blockToPos, posToBlock, blockFrac, stepNotch, DAY_NOTCHES, TIDE_NOTCHES, JUMPS, TurnLog,
  ROMAN, tideName, PHASE_LABEL, spokenTime, fmtStamp, CLOSED_MESSAGE, BLOCKS_PER_DAY, BLOCKS_PER_TIDE,
} from './mechanic.model.ts';

const SEED = DEMO.seed;
const FINAL_BLOCK = BLOOM_END_BLOCK + 1;
const THUMB_W = 500, THUMB_H = 625;
/** Playback speeds. posPerSec is in scale units (the scale is 10,000 wide); 279 ≈ one day per second through the growth stretch. */
const SPEEDS = [
  { id: 'day', label: '1 day / s', short: '×1 day', posPerSec: 279 },
  { id: 'tide2', label: '1 tide / 2 s', short: '×1 tide / 2 s', posPerSec: 976 },
  { id: 'tide1', label: '1 tide / s', short: '×1 tide', posPerSec: 1953 },
];

const instances = new WeakMap<HTMLElement, () => void>();
let uid = 0;

export default function mount(root: HTMLElement): () => void {
  const existing = instances.get(root);
  if (existing) return existing; // mounting twice is harmless
  const id = `mech${++uid}`;
  const dispose = build(root, id);
  const wrapped = () => { dispose(); instances.delete(root); };
  instances.set(root, wrapped);
  return wrapped;
}

// ─────────────────────────────────────────────────────────────────────
function build(root: HTMLElement, id: string): () => void {
  root.querySelectorAll(':scope > .mech').forEach((n) => n.remove());

  const skyOfRoll = (roll: number) => (roll === 0 ? DEMO.sky : rehearsalSky(1000 + roll));
  const S = {
    block: JUMPS.find((j) => j.id === 'tide2')!.block,
    log: new TurnLog(1, SEED),
    roll: 0,
    playing: false,
    speed: 1,
    message: null as null | { kind: 'ok' | 'refused'; text: string; open: boolean },
    refused: null as null | { i: number | null; text: string; until: number },
  };
  const sky = () => skyOfRoll(S.roll);
  const tokAt = (b: number) => S.log.at(b);
  const pieceState = (): PieceState => {
    const tok = tokAt(S.block);
    return { block: S.block, horizon: tok.turn, sky: S.block >= REVEAL_BLOCK ? sky() : null };
  };

  const disposers: (() => void)[] = [];
  let dead = false;

  // ── live region ────────────────────────────────────────────────────
  const live = el('p', { class: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' });
  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (text: string, delay = 0) => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); }, delay);
  };

  // ── head ───────────────────────────────────────────────────────────
  const head = el('header', { class: 'section-head mech__head', 'data-reveal': '' },
    el('p', { class: 'eyebrow' }, '03 — The mechanic'),
    el('h2', { class: 'h2', id: `${id}-h` }, 'The ', el('em', {}, 'Turn')),
    el('p', { class: 'lede' },
      'For four tides a seed is dim and half-formed. Its keeper may do one thing: turn it toward a horizon. ',
      'Drag the clock, turn the seed, and watch it lean — the rest stays sealed until the sky opens.'),
  );

  // ── stage: the piece + the scrubber ────────────────────────────────
  const canvas = el('canvas', { class: 'mech__canvas', role: 'img', 'aria-label': 'The demo seed, rendered live.' });
  const frame = el('div', { class: 'frame frame--ph mech__frame' }, canvas);
  const capTitle = el('span', { class: 'mech__cap-title' }, '');
  const capState = el('span', { class: 'mech__cap-state', 'aria-hidden': 'true' }, '');
  const figure = el('figure', { class: 'mech__figure' }, frame,
    el('figcaption', { class: 'caption mech__cap' }, capTitle, el('span', { class: 'mech__cap-seed' }, `seed ${shortSeed(SEED)}`), capState));

  const playBtn = el('button', { class: 'btn btn--small mech__play', type: 'button', 'aria-label': 'Play the growth' });
  const scrubBlock = el('output', { class: 'mech__scrub-block', for: `${id}-range` }, '');
  const scrubDay = el('span', { class: 'mech__scrub-day' }, '');

  const range = el('input', {
    type: 'range', class: 'mech__range', id: `${id}-range`, min: 0, max: POS_MAX, step: 1, value: Math.round(blockToPos(S.block)),
    'aria-label': 'Time on the block clock', 'aria-describedby': `${id}-keys`,
  });
  const scale = buildScale(range);
  const scrub = el('div', { class: 'mech__scrub' },
    el('div', { class: 'mech__scrub-row' }, playBtn, el('div', { class: 'mech__scrub-read' }, scrubBlock, scrubDay)),
    scale,
    el('p', { class: 'visually-hidden', id: `${id}-keys` }, 'Arrow keys move one day. Page up and page down move one tide. Home and end go to the mint and to the end.'),
  );
  const stage = el('div', { class: 'mech__stage' }, el('div', { class: 'mech__stick' }, figure, scrub));

  // ── panel 1: the clock ─────────────────────────────────────────────
  const bigBlock = el('p', { class: 'mech__bignum', 'aria-hidden': 'true' }, '');
  const stamp = el('p', { class: 'mech__stamp' }, '');
  const dayLine = el('p', { class: 'mech__dayline' }, '');
  const tideLine = el('p', { class: 'mech__tideline' }, '');
  const kvPhase = el('dd', {}), kvTurning = el('dd', {}), kvReveal = el('dd', {});
  const speedBtns = SPEEDS.map((s, i) => el('button', {
    class: 'chip mech__speed', type: 'button', 'aria-pressed': String(i === S.speed), dataset: { speed: s.id },
    onclick: () => { S.speed = i; speedBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))); },
  }, s.label));
  const jumpBtns = JUMPS.map((j) => el('button', {
    class: 'chip mech__jump', type: 'button', dataset: { jump: j.id },
    onclick: () => { pause(); setBlock(j.block, 'jump'); say(`${j.label}. ${spokenTime(timeline(j.block))}.`); },
  }, j.label));
  const clockBlock = el('section', { class: 'mech__block mech__clock', 'aria-labelledby': `${id}-clk` },
    el('div', { class: 'mech__block-head' },
      el('h3', { class: 'mech__h', id: `${id}-clk` }, 'The clock'),
      el('p', { class: 'caption' }, 'One block every twelve seconds')),
    el('div', { class: 'mech__clockface' },
      el('p', { class: 'label' }, 'Block'), bigBlock, stamp),
    el('div', { class: 'mech__when' }, dayLine, tideLine),
    el('dl', { class: 'kv mech__kv' },
      el('dt', {}, 'Phase'), kvPhase, el('dt', {}, 'Turning'), kvTurning, el('dt', {}, 'The reveal'), kvReveal),
    el('div', { class: 'mech__ctl' },
      el('p', { class: 'label', id: `${id}-jl` }, 'Jump to'),
      el('div', { class: 'mech__chips mech__chips--jump', role: 'group', 'aria-labelledby': `${id}-jl` }, ...jumpBtns)),
    el('div', { class: 'mech__ctl mech__ctl--inline' },
      el('p', { class: 'label', id: `${id}-sl` }, 'Play speed'),
      el('div', { class: 'mech__chips', role: 'group', 'aria-labelledby': `${id}-sl` }, ...speedBtns)),
  );

  // ── panel 2: the turn ──────────────────────────────────────────────
  const hzBtns = PARAMS.horizons.map((h, i) => {
    const tag = el('span', { class: 'mech__hz-tag' }, '');
    const line = el('span', { class: 'mech__hz-line' }, h.line);
    const b = el('button', {
      class: 'mech__hz', type: 'button', 'aria-pressed': 'false', dataset: { horizon: String(i), id: h.id },
      onclick: () => doTurn(i as Horizon),
    },
      el('span', { class: 'mech__hz-glyph', innerHTML: GLYPHS[i] }),
      el('span', { class: 'mech__hz-text' }, el('span', { class: 'mech__hz-name' }, h.name), line),
      tag);
    return { b, tag, line, text: h.line };
  });
  const facing = el('p', { class: 'mech__facing' }, '');
  const note = el('p', { class: 'mech__note' }, '');
  const logList = el('ol', { class: 'mech__log', 'aria-labelledby': `${id}-lg` });
  const driftBtn = el('button', { class: 'btn btn--small mech__drift', type: 'button', onclick: () => doDrift() }, 'Leave it to drift');
  const turnBlock = el('section', { class: 'mech__block mech__turn', 'aria-labelledby': `${id}-trn` },
    el('div', { class: 'mech__block-head' },
      el('h3', { class: 'mech__h', id: `${id}-trn` }, 'Turn the seed'),
      el('p', { class: 'caption' }, 'The one thing a keeper does')),
    el('div', { class: 'mech__hzs', role: 'group', 'aria-label': 'Horizons' }, ...hzBtns.map((x) => x.b)),
    facing, note,
    el('div', { class: 'mech__logwrap' },
      el('p', { class: 'label', id: `${id}-lg` }, 'Log'), logList),
    el('div', { class: 'mech__turn-foot' },
      driftBtn,
      el('p', { class: 'mech__inherit' }, 'If you sell, the next keeper can turn it again.')),
  );

  // ── panel 3: the sky ───────────────────────────────────────────────
  const rehearseBtn = el('button', { class: 'btn mech__rehearse', type: 'button', onclick: () => rehearse() }, 'Rehearse the sky');
  const skyTag = el('p', { class: 'mech__skytag' }, '');
  const traitsTitle = el('p', { class: 'mech__traits-title' }, '');
  const traitsTier = el('span', { class: 'tier' }, '');
  const traitsBody = el('tbody', {});
  const bloomSeedLine = el('p', { class: 'mech__seedline' }, '');
  const skyBlock = el('section', { class: 'mech__block mech__sky', 'aria-labelledby': `${id}-sky` },
    el('div', { class: 'mech__block-head' },
      el('h3', { class: 'mech__h', id: `${id}-sky` }, 'The sky'),
      el('p', { class: 'caption' }, 'What no one can steer')),
    el('div', { class: 'mech__rehearse-row' },
      rehearseBtn,
      el('p', { class: 'mech__rehearse-note' },
        el('strong', {}, 'Rehearsal'), ` — the real sky stays sealed until block ${fmtInt(REVEAL_BLOCK)} and no one can steer it.`)),
    skyTag,
    el('div', { class: 'mech__traits-head' }, traitsTitle, traitsTier),
    el('table', { class: 'mech__traits' },
      el('caption', { class: 'visually-hidden' }, 'The sealed traits of the bloom, with the share of the edition that holds each'),
      el('thead', { class: 'visually-hidden' }, el('tr', {}, el('th', { scope: 'col' }, 'Trait'), el('th', { scope: 'col' }, 'Value'), el('th', { scope: 'col' }, 'Share of edition'), el('th', { scope: 'col' }, 'Tier'))),
      traitsBody),
    bloomSeedLine,
  );

  const panel = el('div', { class: 'mech__panel' }, clockBlock, turnBlock, skyBlock);
  const sim = el('div', { class: 'mech__sim', 'data-reveal': '' }, stage, panel);

  // ── the four horizons of this seed ─────────────────────────────────
  const hzFigs = PARAMS.horizons.map((h, i) => {
    const cv = el('canvas', { class: 'mech__hzcanvas', width: THUMB_W, height: THUMB_H, role: 'img', 'aria-label': `This seed and sky, turned toward ${h.name}` });
    const fr = el('div', { class: 'frame frame--ph mech__hzframe' }, cv);
    const nm = el('span', { class: 'mech__hzcap-name' }, h.name);
    const yours = el('span', { class: 'mech__hzcap-yours' }, '');
    const ttl = el('span', { class: 'mech__hzcap-title' }, '');
    const tr = el('span', { class: 'tier' }, '');
    const fig = el('figure', { class: 'mech__hzfig', 'data-reveal': '', style: `--d:${i * 90}` }, fr,
      el('figcaption', { class: 'mech__hzcap' }, el('span', { class: 'mech__hzcap-top' }, nm, yours), ttl, tr));
    return { fig, cv, fr, ttl, tr, yours };
  });
  const hzNote = el('p', { class: 'mech__hznote' }, '');
  const horizonsBand = el('section', { class: 'mech__hzband', 'aria-labelledby': `${id}-hzs` },
    el('div', { class: 'mech__hzhead', 'data-reveal': '' },
      el('h3', { class: 'mech__h mech__h--lg', id: `${id}-hzs` }, 'The four horizons of ', el('em', {}, 'this'), ' seed'),
      hzNote),
    el('div', { class: 'mech__hzgrid' }, ...hzFigs.map((f) => f.fig)),
  );

  // ── the rules in plain English ─────────────────────────────────────
  const rules = rulesInPlainEnglish();
  const ruleItems = rules.map((r, i) => el('li', { class: 'mech__rule', 'data-reveal': '', style: `--d:${Math.min(i, 4) * 60}` },
    el('span', { class: 'mech__rule-n' }, String(i + 1).padStart(2, '0')),
    el('div', { class: 'mech__rule-body' }, el('h4', { class: 'mech__rule-t' }, r.title), el('p', { class: 'mech__rule-p' }, r.body))));
  const contract = [
    ['nativeHorizon', 'uint8(keccak256(abi.encodePacked(seed, "native"))[0]) % 4'],
    ['sky', 'keccak256(abi.encodePacked(artistSalt, blockhash(REVEAL_BLOCK), uint256(tokenId)))'],
    ['bloomSeed', 'keccak256(abi.encodePacked(seed, uint8(horizon), sky))'],
  ];
  const rulesBlock = el('section', { class: 'mech__rules', 'aria-labelledby': `${id}-rl` },
    el('div', { class: 'mech__rules-head', 'data-reveal': '' },
      el('h3', { class: 'mech__h mech__h--xl', id: `${id}-rl` }, 'The rules in ', el('em', {}, 'plain English')),
      el('p', { class: 'mech__rules-sub' }, 'Eight rules, written the way the contract will read them.')),
    el('div', { class: 'mech__rules-main' },
      el('ol', { class: 'mech__rulelist' }, ...ruleItems),
      el('div', { class: 'mech__fair', 'data-reveal': '' },
        el('h3', { class: 'mech__h' }, 'Why this is fair'),
        el('p', { class: 'mech__fair-p mech__fair-p--lead' },
          'There are four choices and none of them is better than another. Choosing costs nothing, there is nothing to qualify for, and until the Still Hour you may change your mind as often as you like.'),
        el('p', { class: 'mech__fair-p' },
          'Whoever keeps the seed at that moment has the last word — the next keeper included, if you sell. What that keeper is choosing is a direction, not a prize: ',
          'the rare things are not decided by the horizon at all.'),
        el('p', { class: 'mech__fair-p' },
          'They are rolled afterwards, from the seed, the horizon and a sky that mixes a salt the artist sealed ', el('em', {}, 'before'),
          ' the mint with the hash of a block no one chose. The artist cannot know that block; a validator cannot know that salt. ',
          'What is left to the keeper is the way the seed was facing.')),
      el('div', { class: 'mech__contract', 'data-reveal': '' },
        el('h3', { class: 'mech__h' }, 'What a contract stores'),
        el('p', { class: 'caption' }, 'One number per seed — the last turn — and three hashes'),
        el('dl', { class: 'mech__hashes' }, ...contract.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])))),
  );

  const wrapEl = el('div', { class: 'wrap mech' }, head, sim, horizonsBand, rulesBlock, live);
  root.append(wrapEl);

  // ═════════════════════════════════════════════════════════════════
  // behaviour
  // ═════════════════════════════════════════════════════════════════
  const stageR = new Stage({
    canvas, seed: SEED,
    onQuality: (q: StageQuality) => {
      capState.textContent = q === 'draft' ? 'sketch' : '';
      if (q !== 'none') frame.classList.remove('frame--ph');
    },
  });
  disposers.push(() => stageR.destroy());

  // size the canvas to its frame
  let sizeTimer: ReturnType<typeof setTimeout> | undefined;
  const measure = () => { const r = frame.getBoundingClientRect(); stageR.setSize(r.width, r.height); };
  const ro = new ResizeObserver(() => { if (!stageR.W) measure(); else { clearTimeout(sizeTimer); sizeTimer = setTimeout(measure, 180); } });
  ro.observe(frame);
  disposers.push(() => { ro.disconnect(); clearTimeout(sizeTimer); });
  measure();
  disposers.push(watchVisible(figure, (v) => { stageR.setVisible(v); if (!v) pause(); }, '160px'));

  // ── readouts ───────────────────────────────────────────────────────
  const cache = new Map<Node, string>();
  const put = (n: Node, text: string) => { if (cache.get(n) !== text) { cache.set(n, text); n.textContent = text; } };
  const attr = (n: Element, k: string, v: string) => { const key = `${k}=${v}`; if ((n as any)[`__${k}`] !== key) { (n as any)[`__${k}`] = key; n.setAttribute(k, v); } };

  let traitsCache: { key: string; t: Traits } | null = null;
  const traitsFor = (horizon: Horizon | null, revealed: boolean, roll: number): Traits => {
    const key = `${horizon}|${revealed}|${roll}`;
    if (traitsCache?.key !== key) traitsCache = { key, t: deriveTraits(SEED, { horizon, sky: revealed ? skyOfRoll(roll) : null }) };
    return traitsCache.t;
  };

  let lastPhaseKey = '';
  let phaseTimer: ReturnType<typeof setTimeout> | undefined;
  let labelTimer: ReturnType<typeof setTimeout> | undefined;

  function renderClock() {
    const tl = timeline(S.block);
    const open = isTurnOpen(S.block);
    put(bigBlock, fmtInt(S.block));
    put(scrubBlock, `Block ${fmtInt(S.block)}`);
    put(stamp, fmtStamp(S.block));
    const growing = tl.phase === 'seed' || tl.phase === 'growing' || tl.phase === 'still';
    put(scrubDay, growing ? `Day ${tl.day} · Tide ${ROMAN[tl.tide - 1]}` : tl.phase === 'opening' ? `Opening · ${Math.round(tl.bloom * 100)} %` : 'Final');
    const dayKey = growing ? `g${tl.day}|${tl.tide}` : `${tl.phase}|${tl.day}`;
    if ((dayLine as any).__k !== dayKey) {
      (dayLine as any).__k = dayKey;
      const sep = () => el('span', { class: 'mech__sep', 'aria-hidden': 'true' }, '·');
      if (growing) dayLine.replaceChildren(`Day ${tl.day}`, sep(), `Tide ${ROMAN[tl.tide - 1]}`, el('span', { class: 'mech__dash' }, '—'), el('em', {}, tideName(tl.tide).name));
      else dayLine.replaceChildren(`Day ${tl.day}`, sep(), el('em', {}, tl.phase === 'opening' ? 'The sky is open' : 'The bloom is final'));
    }
    put(tideLine,
      tl.phase === 'seed' ? 'Cold, dim and half-formed — a pane of window, heavy in the hand.'
      : tl.phase === 'growing' ? tideName(tl.tide).line
      : tl.phase === 'still' ? 'The seeds hold still. Nothing anyone learns can be acted on.'
      : tl.phase === 'opening' ? 'The bud unfolds into its sealed form over one day.'
      : 'It never changes again.');
    put(kvPhase, tl.phase === 'opening' ? `Opening · ${Math.round(tl.bloom * 100)} %` : PHASE_LABEL[tl.phase]);
    put(kvTurning, open ? `Closes in ${fmtSpan(TURN_CLOSE_BLOCK - S.block)} · ${fmtInt(TURN_CLOSE_BLOCK - S.block)} blocks` : `Closed since block ${fmtInt(TURN_CLOSE_BLOCK)}`);
    put(kvReveal,
      tl.blocksToReveal > 0 ? `${fmtInt(tl.blocksToReveal)} blocks to the reveal · ${fmtSpan(tl.blocksToReveal)}`
      : `The sky opened at block ${fmtInt(REVEAL_BLOCK)}`);
    attr(range, 'aria-valuetext', spokenTime(tl));
    range.style.setProperty('--f', (blockToPos(S.block) / POS_MAX).toFixed(5));
    // announce phase changes once the hand has settled
    const key = tl.phase === 'growing' ? `growing${tl.tide}` : tl.phase;
    if (key !== lastPhaseKey) {
      const first = lastPhaseKey === '';
      lastPhaseKey = key;
      if (!first) {
        clearTimeout(phaseTimer);
        phaseTimer = setTimeout(() => {
          const t = timeline(S.block);
          say(
            t.phase === 'still' ? 'The Still Hour. Turning is closed. The seeds hold still.'
            : t.phase === 'opening' ? 'The sky has opened. The bloom is unfolding.'
            : t.phase === 'bloomed' ? 'Bloomed. The piece is final.'
            : t.phase === 'seed' ? 'Block 0. The seed, dim and half-formed.'
            : `Tide ${ROMAN[t.tide - 1]}, ${tideName(t.tide).name}. Day ${t.day}.`);
        }, 600);
      }
    }
  }

  function renderTurn() {
    const open = isTurnOpen(S.block);
    const revealed = S.block >= REVEAL_BLOCK;
    const tok = tokAt(S.block);
    const eff = effectiveHorizon(tok);
    const rf = S.refused && performance.now() < S.refused.until ? S.refused : null;
    hzBtns.forEach(({ b, tag, line, text }, i) => {
      const pressed = tok.turn === i;
      const drifted = tok.turn === null && revealed && eff.horizon === i;
      const refused = !!rf && rf.i === i;
      attr(b, 'aria-pressed', String(pressed));
      attr(b, 'aria-disabled', String(!open));
      attr(b, 'data-state', refused ? 'refused' : pressed ? 'facing' : drifted ? 'drifted' : !open ? 'closed' : 'open');
      put(tag, refused ? 'Refused' : pressed ? 'Facing' : drifted ? 'Drifted' : !open ? 'Closed' : '');
      put(line, refused ? rf!.text : text);
    });
    if (tok.turn !== null) put(facing, `Facing ${HORIZON_NAMES[tok.turn]} — turned at block ${fmtInt(tok.turnBlock ?? 0)}.`);
    else if (revealed) put(facing, `Drifted to ${HORIZON_NAMES[eff.horizon]}, its native horizon — fixed by the seed, never by a hand.`);
    else put(facing, 'Not turned. Left alone, the seed drifts to its native horizon.');

    // message (refusals persist until the situation changes)
    if (S.message && S.message.open !== open) S.message = null;
    const msg = S.message;
    note.dataset.kind = msg ? msg.kind : open ? 'open' : 'closed';
    if (msg) {
      note.replaceChildren(el('span', { class: 'mech__note-tag' }, msg.kind === 'refused' ? 'Refused' : 'Done'), ' ', msg.text);
      cache.delete(note);
    } else put(note, open ? `Turning is open until block ${fmtInt(TURN_CLOSE_BLOCK)} — the Still Hour.` : revealed ? `Turning closed at block ${fmtInt(TURN_CLOSE_BLOCK)}. The sky is open; nothing can be changed now.` : CLOSED_MESSAGE);
    attr(driftBtn, 'aria-disabled', String(!open || tok.turn === null));

    // log
    const list = S.log.list();
    const counting = S.log.counting();
    const sig = list.map((e) => `${e.id}:${e.block > S.block ? 'a' : 'p'}`).join(',') + `|${counting?.id}`;
    if ((logList as any).__sig !== sig) {
      (logList as any).__sig = sig;
      if (!list.length) logList.replaceChildren(el('li', { class: 'mech__log-empty' }, 'Nothing turned yet.'));
      else logList.replaceChildren(...list.slice(0, 8).map((e) => el('li', { class: 'mech__log-row', dataset: { ahead: String(e.block > S.block), counts: String(e.id === counting?.id) } },
        el('span', { class: 'mech__log-what' }, `Block ${fmtInt(e.block)} · ${e.horizon === null ? 'left to drift' : `turned toward ${HORIZON_NAMES[e.horizon]}`}`),
        e.block > S.block ? el('span', { class: 'mech__log-flag' }, 'ahead') : null,
        e.id === counting?.id ? el('span', { class: 'mech__log-counts' }, 'counts') : null)));
    }
  }

  let skyKey = '';
  function renderSky() {
    const revealed = S.block >= REVEAL_BLOCK;
    const tok = tokAt(S.block);
    const eff = effectiveHorizon(tok);
    const t = traitsFor(tok.turn, revealed, S.roll);
    put(skyTag, revealed
      ? `Rehearsal sky no. ${S.roll + 1} — 0x${sky().slice(0, 6)}…${sky().slice(-4)}. Not the real one.`
      : 'Press it to jump to the reveal and watch a pretend sky open.');
    put(traitsTitle, t.title);
    put(traitsTier, revealed && t.tier ? t.tier : 'Sealed');
    traitsTier.dataset.tier = revealed && t.tier ? t.tier : 'sealed';
    const key = `${revealed}|${tok.turn}|${eff.horizon}|${S.roll}`;
    if (key !== skyKey) {
      skyKey = key;
      const rows = t.list.filter((e) => e.group === 'bloom');
      traitsBody.replaceChildren(...rows.map((e) => {
        const sealed = !revealed || e.sealed;
        return el('tr', { class: sealed ? 'is-sealed' : '' },
          el('th', { scope: 'row' }, e.label),
          el('td', { class: 'mech__tv' }, sealed ? 'Sealed' : e.value),
          el('td', { class: 'mech__tp' }, sealed ? '—' : pct(e.share)),
          el('td', { class: 'mech__tt' }, sealed ? '' : el('span', { class: 'tier', dataset: { tier: e.tier } }, e.tier)));
      }));
      put(bloomSeedLine, revealed && t.bloomSeed ? `bloomSeed 0x${t.bloomSeed.slice(0, 8)}…${t.bloomSeed.slice(-6)}` : `Sealed until block ${fmtInt(REVEAL_BLOCK)}`);
    }
  }

  function renderCaption() {
    const revealed = S.block >= REVEAL_BLOCK;
    const tok = tokAt(S.block);
    const t = traitsFor(tok.turn, revealed, S.roll);
    put(capTitle, t.title);
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => {
      const tl = timeline(S.block);
      const tk = tokAt(S.block);
      const facingTxt = tk.turn !== null ? `facing ${HORIZON_NAMES[tk.turn]}` : 'unturned';
      canvas.setAttribute('aria-label', `${t.title}, the demo seed, at block ${fmtInt(S.block)}: ${spokenTime(tl)}, ${PHASE_LABEL[tl.phase].toLowerCase()}, ${facingTxt}.`);
    }, 350);
  }

  // horizons band ------------------------------------------------------
  let bandKey = '';
  let bandJobs: { cancel: () => void }[] = [];
  let bandVisible = false;
  function renderHorizonsBand() {
    const revealed = S.block >= REVEAL_BLOCK;
    const finalTok = tokAt(BLOCK_MAX);
    const eff = effectiveHorizon(finalTok);
    hzFigs.forEach((f, i) => {
      const t = deriveTraits(SEED, { horizon: i as Horizon, sky: revealed ? sky() : null });
      put(f.ttl, revealed ? t.title : 'Sealed');
      f.tr.dataset.tier = revealed && t.tier ? t.tier : 'sealed';
      put(f.tr, revealed && t.tier ? t.tier : '');
      f.tr.hidden = !revealed;
      put(f.yours, revealed ? (eff.horizon === i ? (finalTok.turn !== null ? 'your turn' : 'its drift') : '') : '');
      f.fig.dataset.yours = String(revealed && eff.horizon === i);
      f.fig.dataset.sealed = String(!revealed);
    });
    put(hzNote, revealed
      ? 'The same seed under the same sky, turned each way. The light and the way it opens change; the odds do not.'
      : 'Sealed until the sky opens. The same seed, under one sky, will bloom four different ways.');
    const key = revealed ? `r${S.roll}` : '';
    if (revealed && bandVisible && key !== bandKey) {
      bandKey = key;
      bandJobs.forEach((j) => j.cancel());
      bandJobs = hzFigs.map((f, i) => {
        const job = getThumb(SEED, { block: FINAL_BLOCK, horizon: i as Horizon, sky: sky() }, THUMB_W, THUMB_H, 2);
        job.promise.then((cv) => {
          if (dead || !cv || bandKey !== key) return;
          const g = f.cv.getContext('2d')!;
          g.drawImage(cv, 0, 0, f.cv.width, f.cv.height);
          f.fr.classList.remove('frame--ph');
        });
        return job;
      });
    }
  }
  disposers.push(watchVisible(horizonsBand, (v) => { bandVisible = v; if (v) renderHorizonsBand(); }, '300px'));
  disposers.push(() => bandJobs.forEach((j) => j.cancel()));

  // refresh ------------------------------------------------------------
  let raf = 0;
  function refreshUI() {
    raf = 0;
    if (dead) return;
    renderClock(); renderTurn(); renderSky(); renderCaption(); renderHorizonsBand();
    setPlayLabel();
  }
  const scheduleUI = () => { if (!raf) raf = requestAnimationFrame(refreshUI); };
  disposers.push(() => cancelAnimationFrame(raf));

  function setBlock(b: number, source: 'slider' | 'jump' | 'play' | 'key' | 'api' = 'api') {
    const nb = Math.min(BLOCK_MAX, Math.max(0, Math.round(b)));
    if (nb === S.block && source !== 'api') return;
    S.block = nb;
    if (source !== 'slider') range.value = String(Math.round(blockToPos(nb)));
    stageR.setState(pieceState());
    scheduleUI();
  }

  // ── the turn ───────────────────────────────────────────────────────
  let refusedTimer: ReturnType<typeof setTimeout> | undefined;
  function doTurn(h: Horizon) {
    try {
      const e = S.log.turn(h, S.block);
      const text = `Turned toward ${HORIZON_NAMES[h]} at block ${fmtInt(e.block)}. The seed leans.`;
      S.message = { kind: 'ok', text: `${text.replace(' The seed leans.', '')} It counts unless you turn again.`, open: true };
      say(`${text} It counts unless you turn again.`);
    } catch (err) {
      const text = err instanceof MechanicError ? err.message : 'That turn was refused.';
      S.message = { kind: 'refused', text, open: isTurnOpen(S.block) };
      S.refused = { i: h, text, until: performance.now() + 5200 };
      clearTimeout(refusedTimer);
      refusedTimer = setTimeout(() => { S.refused = null; scheduleUI(); }, 5300);
      say(`Refused. ${text}`);
    }
    stageR.setState(pieceState());
    refreshUI();
  }
  function doDrift() {
    try {
      if (tokAt(S.block).turn === null && isTurnOpen(S.block)) {
        S.message = { kind: 'ok', text: 'Nothing to clear — the seed is already drifting.', open: true };
        say('Nothing to clear. The seed is already drifting.');
      } else {
        const e = S.log.drift(S.block);
        S.message = { kind: 'ok', text: `Left to drift at block ${fmtInt(e.block)}. It will face its native horizon.`, open: true };
        say('Turn cleared. The seed will drift to its native horizon.');
      }
    } catch (err) {
      const text = err instanceof MechanicError ? err.message : 'That was refused.';
      S.message = { kind: 'refused', text, open: isTurnOpen(S.block) };
      say(`Refused. ${text}`);
    }
    stageR.setState(pieceState());
    refreshUI();
  }
  function rehearse() {
    S.roll += 1;
    // rehearse the whole reveal: go to the moment the sky opens and let the bloom unfold (or land on it, if motion is reduced)
    pause();
    if (reducedMotion()) setBlock(FINAL_BLOCK, 'jump');
    else { setBlock(REVEAL_BLOCK, 'jump'); play(); }
    S.message = null;
    say(`A new rehearsal sky, number ${S.roll + 1}. Not the real sky. ${reducedMotion() ? 'The bloom is shown open.' : 'The reveal plays.'}`);
    refreshUI();
  }

  // ── play ───────────────────────────────────────────────────────────
  let playRaf = 0, playLast = 0, playTimer: ReturnType<typeof setTimeout> | undefined;
  function setPlayLabel() {
    const atEnd = S.block >= BLOCK_MAX;
    const label = S.playing ? 'Pause' : atEnd ? 'Replay' : 'Play';
    if ((playBtn as any).__l !== label) {
      (playBtn as any).__l = label;
      playBtn.innerHTML = (S.playing ? PAUSE_MARK : PLAY_MARK) + `<span>${label}</span>`;
      playBtn.setAttribute('aria-label', S.playing ? 'Pause' : atEnd ? 'Replay from the mint' : 'Play the growth');
    }
    playBtn.setAttribute('aria-pressed', String(S.playing));
  }
  function play() {
    if (S.playing) return;
    if (S.block >= BLOCK_MAX) setBlock(0, 'jump');
    S.playing = true;
    setPlayLabel();
    if (reducedMotion()) stepPlay(); else { playLast = performance.now(); playRaf = requestAnimationFrame(frameTick); }
  }
  function pause(announce = false) {
    if (!S.playing) return;
    S.playing = false;
    cancelAnimationFrame(playRaf); playRaf = 0;
    clearTimeout(playTimer);
    setPlayLabel();
    if (announce) say(`Paused. ${spokenTime(timeline(S.block))}.`);
  }
  /** The Still Hour is held (the seeds hold still) and the opening is given room; the growth runs at the chosen speed. */
  const paceAt = (pos: number) => (pos >= 7800 && pos < 8100 ? 0.3 : pos >= 8100 && pos < 9600 ? 0.4 : 1);
  function advance(sec: number) {
    const here = blockToPos(S.block);
    const pos = here + SPEEDS[S.speed]!.posPerSec * paceAt(here) * sec;
    if (pos >= POS_MAX) { setBlock(BLOCK_MAX, 'play'); pause(); say('The end of the scale. The bloom is final.'); return false; }
    setBlock(posToBlock(pos), 'play');
    return true;
  }
  function frameTick(now: number) {
    playRaf = 0;
    if (!S.playing) return;
    const dt = Math.min(0.1, (now - playLast) / 1000);
    playLast = now;
    if (advance(dt)) playRaf = requestAnimationFrame(frameTick);
  }
  // reduced motion: discrete steps, one per second, no easing
  function stepPlay() {
    if (!S.playing) return;
    if (advance(1)) playTimer = setTimeout(stepPlay, 1000);
  }
  playBtn.addEventListener('click', () => { if (S.playing) pause(true); else { play(); say('Playing.'); } });
  disposers.push(onMotionChange((reduced) => {
    if (!S.playing) return;
    cancelAnimationFrame(playRaf); clearTimeout(playTimer);
    if (reduced) stepPlay(); else { playLast = performance.now(); playRaf = requestAnimationFrame(frameTick); }
  }));
  disposers.push(() => { cancelAnimationFrame(playRaf); clearTimeout(playTimer); });
  const onVis = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', onVis);
  disposers.push(() => document.removeEventListener('visibilitychange', onVis));

  // ── scrubber input ─────────────────────────────────────────────────
  range.addEventListener('input', () => { if (S.playing) pause(); setBlock(posToBlock(Number(range.value)), 'slider'); });
  range.addEventListener('keydown', (e) => {
    const k = e.key;
    let nb: number | null = null;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (k === 'ArrowRight' || k === 'ArrowUp') nb = stepNotch(S.block, 1, DAY_NOTCHES);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') nb = stepNotch(S.block, -1, DAY_NOTCHES);
    else if (k === 'PageUp') nb = stepNotch(S.block, 1, TIDE_NOTCHES);
    else if (k === 'PageDown') nb = stepNotch(S.block, -1, TIDE_NOTCHES);
    else if (k === 'Home') nb = 0;
    else if (k === 'End') nb = BLOCK_MAX;
    if (nb === null) return;
    e.preventDefault();
    if (S.playing) pause();
    setBlock(nb, 'key');
  });

  // ── go ─────────────────────────────────────────────────────────────
  stageR.setState(pieceState());
  refreshUI();

  return () => {
    dead = true;
    pause();
    clearTimeout(liveTimer); clearTimeout(phaseTimer); clearTimeout(labelTimer); clearTimeout(refusedTimer);
    disposers.forEach((d) => { try { d(); } catch { /* ignore */ } });
    wrapEl.remove();
  };
}

const pct = (share: number) => (share >= 0.1 ? `${Math.round(share * 100)} %` : `${(share * 100).toFixed(1)} %`);

// ═════════════════════════════════════════════════════════════════════
// The scale: a hairline ruler under a transparent range input.
// ═════════════════════════════════════════════════════════════════════
function buildScale(range: HTMLInputElement): HTMLElement {
  const at = (block: number) => blockFrac(block).toFixed(5);
  const pos = (frac: number) => frac.toFixed(5);
  const ticks = el('div', { class: 'mech__ticks', 'aria-hidden': 'true' });

  // still-hour band
  ticks.append(el('i', { class: 'mech__still', style: `--x:${at(TURN_CLOSE_BLOCK)};--x2:${at(REVEAL_BLOCK)}` }));
  // a hairline over the day that the bloom takes to open
  ticks.append(el('i', { class: 'mech__open', style: `--x:${at(REVEAL_BLOCK)};--x2:${at(BLOOM_END_BLOCK)}` }));
  const tick = (block: number, cls = '') => ticks.append(el('i', { class: `mech__tick ${cls}`.trim(), style: `--x:${at(block)}` }));
  for (let d = 1; d < 28; d++) tick(d * BLOCKS_PER_DAY, d % 7 === 0 ? 'is-major' : '');
  tick(0, 'is-long');
  tick(TURN_CLOSE_BLOCK, 'is-long');
  tick(REVEAL_BLOCK, 'is-major');
  for (let q = 1; q < 4; q++) tick(REVEAL_BLOCK + q * (BLOCKS_PER_DAY / 4));
  tick(BLOOM_END_BLOCK, 'is-long');
  tick(BLOCK_MAX, 'is-end');

  const label = (text: (string | Node)[], x: number, cls: string, row: 'a' | 'b') =>
    ticks.append(el('span', { class: `mech__lab is-${cls} row-${row}`, style: `--x:${pos(x)}` }, ...text));
  label(['Mint'], 0, 'l', 'b');
  for (let i = 0; i < 4; i++) {
    label([el('span', { class: 'mech__tw' }, 'Tide '), ROMAN[i]!], blockFrac((i + 0.5) * BLOCKS_PER_TIDE), 'c', 'a');
  }
  label(['Reveal'], blockFrac(REVEAL_BLOCK), 'l', 'a');
  label(['Still Hour'], blockFrac(TURN_CLOSE_BLOCK), 'r', 'b');
  label(['Bloomed'], 1, 'r', 'b');

  return el('div', { class: 'mech__scale' }, range, ticks);
}
