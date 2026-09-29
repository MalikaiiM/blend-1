// 02 — How it's made. The layers pull apart in 3D; sliders, a seed box and every knob of the generator sit beside them.
import '../styles/made.css';
import {
  PARAMS, REVEAL_BLOCK, timeline, nativeHorizon, normalizeSeed, seedFromText, randomSeed, resolvePiece, defaultParam,
  type Piece, type PieceState, type Traits,
} from '../../art/index.ts';
import { DEMO } from '../../data/featured.ts';
import { el, fillRange, debounce } from '../lib/dom.ts';
import { reducedMotion } from '../lib/motion.ts';
import { fmtInt, shortSeed } from '../lib/format.ts';
import { Stage, GEO } from './made.stage.ts';
import { Renderer, type Mode } from './made.render.ts';
import { ROWS, ROW_ORDER, BAR_LABELS, COPY, loreOf, roman, fmtNum, type RowId } from './made.data.ts';

type H = 0 | 1 | 2 | 3;
const GROW_MAX = 1000;
const INTRO_SEP = 0.62;
const skyFor = (seed: string) => (seed === DEMO.seed ? DEMO.sky : null);

const live = new WeakMap<HTMLElement, () => void>();
let uid = 0;

export default function mount(root: HTMLElement) {
  live.get(root)?.(); // mounted twice: tear the first one down
  root.replaceChildren();
  const id = `made${uid++}`;
  const ac = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: any) => void, opts: AddEventListenerOptions = {}) =>
    t.addEventListener(type, fn, { ...opts, signal: ac.signal });

  // ── state ────────────────────────────────────────────────────────
  const S = {
    seed: DEMO.seed,
    growth: GROW_MAX,          // 0..GROW_MAX → block 0..REVEAL
    bloom: GROW_MAX,           // 0..GROW_MAX → REVEAL..BLOOM_END (only when > 0)
    horizon: DEMO.horizon as H | null,
    pinned: null as RowId | null,
    hover: null as RowId | null,
  };
  let hoverLock: RowId | null = null;
  const blockOf = () => (S.bloom > 0
    ? REVEAL_BLOCK + Math.round((S.bloom / GROW_MAX) * PARAMS.clock.bloomBlocks)
    : Math.round((S.growth / GROW_MAX) * REVEAL_BLOCK));
  const stateOf = (): PieceState => ({ block: blockOf(), horizon: S.horizon, sky: skyFor(S.seed) });
  const traitsOf = (): Traits => resolvePiece(S.seed, stateOf()).traits;

  // ── DOM ──────────────────────────────────────────────────────────
  const stageEl = el('figure', { class: 'made__stage' });
  const capTitle = el('span', { class: 'made__ctitle' }, ' ');
  const capMeta = el('span', { class: 'caption made__cmeta' }, ' ');
  const busyEl = el('span', { class: 'caption made__busy', 'aria-hidden': 'true' }, 'Rendering');
  stageEl.append(el('figcaption', { class: 'made__cap' }, capTitle, capMeta), busyEl);

  const sepId = `${id}-sep`;
  const sepIn = el('input', { id: sepId, type: 'range', class: 'slider', min: 0, max: 1000, step: 1, value: 0, 'aria-valuetext': 'Layers together' });
  const sepOut = el('output', { class: 'mono num made__val', for: sepId, 'aria-live': 'off' }, '0.00');
  const showAll = el('button', { class: 'btn btn--small made__showall', type: 'button', disabled: true }, 'Show all');
  const coarse = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  const isoLine = el('p', { class: 'caption made__iso', 'aria-live': 'polite' }, '\u00a0');
  const bar = el('div', { class: 'made__bar' },
    el('label', { class: 'label made__lbl', for: sepId }, 'Pull apart'), sepOut, showAll, sepIn, isoLine);

  // prose + head
  const head = el('div', { class: 'made__intro' },
    el('header', { class: 'section-head made__head' },
      el('p', { class: 'eyebrow', 'data-reveal': '' }, COPY.eyebrow),
      (() => { const h = el('h2', { class: 'h2', 'data-reveal': '', style: '--d:80' }); h.innerHTML = COPY.h2; return h; })(),
      el('p', { class: 'lede', 'data-reveal': '', style: '--d:160' }, COPY.lede)),
    el('div', { class: 'prose made__prose', 'data-reveal': '', style: '--d:240' }, ...COPY.prose.map((t) => el('p', {}, t))));

  // ladder
  const rowEls = new Map<RowId, HTMLButtonElement>();
  const ladder = el('ol', { class: 'made__ladder', 'data-reveal': '' });
  ROWS.forEach((r, i) => {
    const lore = loreOf(r.id);
    const btn = el('button', { class: 'made__row', type: 'button', 'aria-pressed': 'false', dataset: { layer: r.id } },
      el('span', { class: 'made__idx mono' }, String(i + 1).padStart(2, '0')),
      el('span', { class: 'made__rt' },
        el('span', { class: 'made__rname' }, lore.name, el('span', { class: 'made__off caption' }, 'Not in this seed')),
        el('span', { class: 'made__rline' }, lore.line),
        el('span', { class: 'made__rdetail' }, el('span', {}, ...BAR_LABELS.map((b) =>
          el('span', { class: 'made__dl' }, el('b', {}, b.long), r.ranges[b.key]))))),
      el('span', { class: 'made__bars', 'aria-hidden': 'true', hidden: !r.bars }, ...BAR_LABELS.map((b) =>
        el('span', { class: 'made__b4' },
          el('span', { class: 'made__bl' }, b.label),
          el('span', { class: 'made__track' }, r.bars ? el('i', { style: `--v:${r.bars[b.key]}` }) : null)))));
    rowEls.set(r.id, btn);
    ladder.append(el('li', {}, btn));
  });

  // moment: growth, bloom, horizon
  const growId = `${id}-grow`, bloomId = `${id}-bloom`;
  const growIn = el('input', { id: growId, type: 'range', class: 'slider', min: 0, max: GROW_MAX, step: 1, value: S.growth });
  const bloomIn = el('input', { id: bloomId, type: 'range', class: 'slider', min: 0, max: GROW_MAX, step: 1, value: S.bloom });
  const growOut = el('output', { class: 'mono made__val', for: growId, 'aria-live': 'off' });
  const bloomOut = el('output', { class: 'mono made__val', for: bloomId, 'aria-live': 'off' });
  const momentLine = el('p', { class: 'mono made__moment', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const chipEls: HTMLButtonElement[] = [];
  const horizonNames = PARAMS.horizons.map((h) => h.name);
  const chipsWrap = el('div', { class: 'made__chips', role: 'group', 'aria-label': 'Horizon' });
  [...horizonNames, 'Drift'].forEach((name, i) => {
    const b = el('button', { class: 'chip made__chip', type: 'button', 'aria-pressed': 'false' }, name);
    on(b, 'click', () => { S.horizon = i < 4 ? (i as H) : null; syncMoment(); requestRender('progressive'); });
    chipEls.push(b);
    chipsWrap.append(b);
  });
  const horizonLine = el('p', { class: 'made__hline', 'aria-live': 'polite' });

  // seed
  const seedId = `${id}-seed`;
  const seedIn = el('input', {
    id: seedId, type: 'text', class: 'field made__seedin', autocomplete: 'off', autocapitalize: 'off', spellcheck: false,
    placeholder: 'A word, a sentence, or 64 hex characters', 'aria-describedby': `${id}-seednote`,
  });
  const randomBtn = el('button', { class: 'btn btn--small', type: 'button' }, 'Random');
  const hexA = el('span', { class: 'made__hexa' }), hexB = el('span', { class: 'made__hexb' });
  const copyBtn = el('button', { class: 'btn btn--small made__copy', type: 'button' }, 'Copy');
  const copyLive = el('span', { class: 'visually-hidden', 'aria-live': 'polite' });
  const seedNote = el('p', { class: 'made__note made__seednote', id: `${id}-seednote` });
  const traitsTitle = el('p', { class: 'made__ttitle' });
  const tierEl = el('span', { class: 'tier' });
  const traitsDl = el('dl', { class: 'made__traits' });

  // knobs
  const knobInputs = new Map<string, { input: HTMLInputElement; out: HTMLOutputElement; step: number }>();
  const groupCounts = new Map<RowId, HTMLElement>();
  const knobsBox = el('div', { class: 'made__knobs' });
  let knobN = 0;
  ROW_ORDER.forEach((rid) => {
    const knobs = (PARAMS.layers as Record<string, { knobs?: { path: string; label: string; min: number; max: number; step: number }[] }>)[rid]?.knobs;
    if (!knobs?.length) return;
    const count = el('span', { class: 'caption made__kcount' });
    groupCounts.set(rid, count);
    const rows = knobs.map((k) => {
      const kid = `${id}-k${knobN++}`;
      const def = defaultParam(k.path) as number;
      const input = el('input', { id: kid, type: 'range', class: 'slider', min: k.min, max: k.max, step: k.step, value: def, dataset: { path: k.path } });
      const out = el('output', { class: 'mono made__val', for: kid, 'aria-live': 'off' }, fmtNum(def, k.step));
      knobInputs.set(k.path, { input, out, step: k.step });
      fillRange(input);
      on(input, 'input', () => { const v = Number(input.value); out.textContent = fmtNum(v, k.step); fillRange(input); renderer.setKnob(k.path, v); syncKnobs(); requestRender('drag'); });
      on(input, 'change', () => requestRender('release'));
      return el('div', { class: 'made__krow' }, el('label', { class: 'label', for: kid }, k.label), out, input);
    });
    const d = el('details', { class: 'made__kgroup', dataset: { layer: rid } },
      el('summary', {}, el('span', { class: 'made__kname' }, loreOf(rid).name), count),
      el('div', { class: 'made__krows' },
        rid === 'inclusion' ? el('p', { class: 'made__note' }, 'These act only on a seed whose bloom carries an inclusion.') : null, ...rows));
    knobsBox.append(d);
  });
  const resetBtn = el('button', { class: 'btn btn--small', type: 'button', disabled: true }, 'Reset the glass');

  const section = (title: string, note: string, ...kids: (Node | null)[]) => {
    const hid = `${id}-h${uid++}`;
    return el('section', { class: 'made__block', 'aria-labelledby': hid, 'data-reveal': '' },
      el('h3', { class: 'made__h label', id: hid }, title),
      el('p', { class: 'made__note' }, note), ...kids);
  };

  const panel = el('div', { class: 'made__panel' },
    section('The ladder', 'From the dark water below to the dust in front. Each layer differs from its neighbours in scale, value, blur and saturation. Choose one to see it alone.',
      el('div', { class: 'made__lhead', 'aria-hidden': 'true' }, el('span'), el('span'),
        el('span', { class: 'made__bars' }, ...BAR_LABELS.map((b) => el('span', { class: 'made__bl' }, b.label)))),
      ladder),
    section('The moment', 'A seed grows for four tides, then blooms toward the horizon its keeper chose. Move along the clock, or turn it.',
      el('div', { class: 'made__krow made__krow--big' }, el('label', { class: 'label', for: growId }, 'Growth'), growOut, growIn),
      el('div', { class: 'made__krow made__krow--big' }, el('label', { class: 'label', for: bloomId }, 'Bloom'), bloomOut, bloomIn),
      el('p', { class: 'label made__sub', id: `${id}-hz` }, 'Horizon'), chipsWrap, horizonLine, momentLine),
    section('The seed', 'Same seed, same image. Type any word and it is hashed into a seed; paste 64 hex characters and it is used as it is.',
      el('div', { class: 'made__seedrow' }, el('label', { class: 'visually-hidden', for: seedId }, 'Seed: a word or 64 hex characters'), seedIn, randomBtn),
      el('div', { class: 'made__hex' }, el('code', { class: 'mono' }, hexA, hexB), copyBtn, copyLive),
      seedNote,
      el('div', { class: 'made__ttop' }, traitsTitle, tierEl), traitsDl),
    section('The glass', 'Every dial the generator exposes, grouped by layer. They change only what you see here, never the rest of the page.',
      knobsBox, el('div', { class: 'made__reset' }, resetBtn)));

  const stageCol = el('div', { class: 'made__stagecol' }, stageEl, bar);
  const grid = el('div', { class: 'made__grid' }, stageCol, panel);
  const rootEl = el('div', { class: 'made wrap' }, head, grid);
  root.append(rootEl);

  // ── stage + renderer ─────────────────────────────────────────────
  const renderer = new Renderer();
  renderer.onBusy = (b) => stageEl.classList.toggle('is-busy', b);
  let firstFull = false;
  let introPlayed = false;
  let visible = false;

  const stage = new Stage(stageEl, {
    onHover: (rid) => hoverRow(rid),
    onPick: (rid) => pickRow(rid),
    onResize: () => requestRender('progressive'),
    onOpen: () => { introPlayed = true; stage.setSeparation(INTRO_SEP, true); },
  });
  stage.onSep = (v) => { setSepUI(v); };
  stage.scene.setAttribute('role', 'img');
  const setStageLabel = (title: string) => stage.scene.setAttribute('aria-label', `${title}, pulled apart into ${stage.present.length || 'its'} layers`);

  const initialSep = reducedMotion() ? INTRO_SEP : 0;
  stage.setSeparation(initialSep);

  // ── separation ───────────────────────────────────────────────────
  function setSepUI(v: number) {
    sepIn.value = String(Math.round(v * 1000));
    fillRange(sepIn);
    sepOut.textContent = v.toFixed(2);
    sepIn.setAttribute('aria-valuetext', v < 0.005 ? 'Layers together' : `${Math.round(v * 100)} percent apart`);
  }
  setSepUI(initialSep);
  on(sepIn, 'input', () => { introPlayed = true; const v = Number(sepIn.value) / 1000; stage.setSeparation(v); setSepUI(v); });

  // ── isolation ────────────────────────────────────────────────────
  function paintIso() {
    const eff = S.hover ?? S.pinned;
    stage.setIso(eff);
    rowEls.forEach((b, rid) => {
      b.classList.toggle('is-on', eff === rid);
      b.classList.toggle('is-dim', !!eff && eff !== rid);
      b.setAttribute('aria-pressed', String(S.pinned === rid));
    });
    showAll.disabled = !S.pinned;
    const line = S.pinned ? `Showing ${loreOf(S.pinned).name} alone` : coarse ? 'Tap a layer, or choose one below' : 'Point at a layer, or choose one from the ladder';
    if (isoLine.textContent !== line) isoLine.textContent = line;
  }
  function hoverRow(rid: RowId | null) {
    if (rid && hoverLock === rid) return;
    if (!rid) hoverLock = null;
    S.hover = rid;
    paintIso();
  }
  function pickRow(rid: RowId) {
    if (rowEls.get(rid)?.disabled) return;
    S.pinned = S.pinned === rid ? null : rid;
    S.hover = null; hoverLock = rid;
    paintIso();
  }
  rowEls.forEach((b, rid) => {
    on(b, 'pointerenter', (e: PointerEvent) => { if (e.pointerType === 'mouse' && !b.disabled) hoverRow(rid); });
    on(b, 'pointerleave', (e: PointerEvent) => { if (e.pointerType === 'mouse') { hoverLock = null; hoverRow(null); } });
    on(b, 'focus', () => { if (b.matches(':focus-visible')) hoverRow(rid); });
    on(b, 'blur', () => { if (S.hover === rid) { hoverLock = null; hoverRow(null); } });
    on(b, 'click', () => pickRow(rid));
  });
  on(showAll, 'click', () => { S.pinned = null; S.hover = null; hoverLock = null; paintIso(); });
  on(root, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && S.pinned) { S.pinned = null; S.hover = null; paintIso(); } });

  // ── moment (growth / bloom / horizon) ────────────────────────────
  function momentText() {
    const tl = timeline(blockOf());
    let g: string;
    if (tl.block <= 0) g = 'The seed, at block 0';
    else if (!tl.revealed) g = `Tide ${roman(tl.tide)}, ${PARAMS.lore.tides[tl.tide - 1]!.name} · day ${tl.day}`;
    else g = 'Day 28, the sky opens';
    const b = S.bloom <= 0 ? 'Sealed' : S.bloom >= GROW_MAX ? 'Final' : `${Math.round((S.bloom / GROW_MAX) * 100)} % open`;
    return { g, b, tl };
  }
  const announce = debounce(() => {
    const { tl } = momentText();
    momentLine.textContent = `Block ${fmtInt(tl.block)} · ${tl.revealed ? (tl.bloom >= 1 ? 'the bloom is final' : 'the bloom is opening') : `${fmtInt(tl.blocksToReveal)} blocks to the reveal`}`;
  }, 500);
  function syncMoment() {
    const { g, b, tl } = momentText();
    growOut.textContent = g;
    bloomOut.textContent = b;
    fillRange(growIn); fillRange(bloomIn);
    growIn.setAttribute('aria-valuetext', g); bloomIn.setAttribute('aria-valuetext', b);
    chipEls.forEach((c, i) => c.setAttribute('aria-pressed', String(i < 4 ? S.horizon === i : S.horizon === null)));
    horizonLine.textContent = S.horizon === null
      ? `Never turned. The seed drifts to its native horizon, ${PARAMS.horizons[nativeHorizon(S.seed)]!.name}.`
      : PARAMS.horizons[S.horizon]!.line;
    announce();
    syncSeedUI(tl.block);
  }
  on(growIn, 'input', () => {
    S.growth = Number(growIn.value);
    if (S.growth < GROW_MAX && S.bloom > 0) { S.bloom = 0; bloomIn.value = '0'; }
    syncMoment(); requestRender('drag');
  });
  on(growIn, 'change', () => requestRender('release'));
  on(bloomIn, 'input', () => {
    S.bloom = Number(bloomIn.value);
    if (S.bloom > 0 && S.growth < GROW_MAX) { S.growth = GROW_MAX; growIn.value = String(GROW_MAX); }
    syncMoment(); requestRender('drag');
  });
  on(bloomIn, 'change', () => requestRender('release'));

  // ── seed box ─────────────────────────────────────────────────────
  function syncSeedUI(_block?: number) {
    hexA.textContent = S.seed.slice(0, 32);
    hexB.textContent = S.seed.slice(32);
    const t = traitsOf();
    traitsTitle.textContent = t.title;
    if (t.tier) { tierEl.textContent = t.tier; tierEl.dataset.tier = t.tier; tierEl.hidden = false; } else tierEl.hidden = true;
    traitsDl.replaceChildren(...traitRows(t));
    capTitle.textContent = t.title;
    capMeta.textContent = `${shortSeed(S.seed)} · ${t.colors.def.name} · ${t.horizon.name}${t.horizon.turned ? '' : ' (drifted)'}`;
    const raw = seedIn.value.trim();
    seedNote.textContent = !raw ? 'Type anything and press Enter; a new piece is made from it.' : normalizeSeed(raw) ? 'Read as a 64-character seed.' : 'Hashed as text (keccak-256), so the same words always give the same seed.';
    setStageLabel(t.title);
  }
  function setSeed(seed: string, fromRandom = false) {
    if (seed === S.seed) return;
    S.seed = seed;
    if (fromRandom) seedIn.value = '';
    syncMoment();
    requestRender('progressive');
  }
  const commitText = () => {
    const raw = seedIn.value.trim();
    if (!raw) { syncSeedUI(); return; }
    const seed = normalizeSeed(raw) ?? seedFromText(raw);
    if (seed === S.seed) { syncSeedUI(); return; }
    setSeed(seed);
  };
  on(seedIn, 'input', debounce(commitText, 500));
  on(seedIn, 'keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commitText();
    if (compact()) seedIn.blur(); // closes the keyboard and pins the stage again, so the new seed can be seen
  });
  on(randomBtn, 'click', () => setSeed(randomSeed(), true));
  on(copyBtn, 'click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(S.seed); ok = true; } catch {
      try { const r = document.createRange(); r.selectNodeContents(hexA.parentElement!); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); ok = document.execCommand('copy'); s?.removeAllRanges(); } catch { /* nothing to do */ }
    }
    copyBtn.textContent = ok ? 'Copied' : 'Select it';
    copyLive.textContent = ok ? 'Seed copied' : 'Copy failed';
    setTimeout(() => { copyBtn.textContent = 'Copy'; copyLive.textContent = ''; }, 1800);
  });

  // ── knobs ────────────────────────────────────────────────────────
  function syncKnobs() {
    let total = 0;
    ROW_ORDER.forEach((rid) => {
      const knobs = (PARAMS.layers as Record<string, { knobs?: { path: string }[] }>)[rid]?.knobs ?? [];
      const n = knobs.filter((k) => renderer.hasKnob(k.path)).length;
      total += n;
      const c = groupCounts.get(rid);
      if (c) c.textContent = n ? `${n} changed` : '';
    });
    resetBtn.disabled = total === 0;
  }
  on(resetBtn, 'click', () => {
    renderer.clearKnobs();
    knobInputs.forEach((k, path) => {
      const d = defaultParam(path) as number;
      k.input.value = String(d); k.out.textContent = fmtNum(d, k.step); fillRange(k.input);
    });
    syncKnobs();
    requestRender('release');
  });

  // ── rendering ────────────────────────────────────────────────────
  let tFull = 0, tDraft = 0, lastDraft = 0;
  function run(mode: Mode, pri = 5) {
    const { w, h } = stage.renderSize();
    renderer.render({ seed: S.seed, state: stateOf(), w, h }, mode, onPiece, pri);
  }
  let shownSeed = '';
  function onPiece(p: Piece, q: 'draft' | 'full') {
    const arrive = p.seed !== shownSeed;
    shownSeed = p.seed;
    stage.setPiece(p, arrive);
    paintIso();
    if (q === 'full') { firstFull = true; maybeIntro(); }
    setStageLabel(p.traits.title);
    ROWS.forEach((r) => {
      const b = rowEls.get(r.id)!;
      const absent = r.id === 'inclusion' && !stage.present.includes('inclusion');
      b.disabled = absent;
      b.classList.toggle('is-off', absent);
      if (absent && S.pinned === 'inclusion') { S.pinned = null; paintIso(); }
    });
  }
  function requestRender(kind: 'progressive' | 'drag' | 'release') {
    clearTimeout(tFull); clearTimeout(tDraft); tDraft = 0;
    if (kind === 'progressive') { tFull = window.setTimeout(() => run('progressive'), 40); return; }
    if (kind === 'release') { tFull = window.setTimeout(() => run('full'), 30); return; }
    // while dragging: a draft at most every ~140 ms, and a full render once the hand rests
    const wait = Math.max(0, 140 - (performance.now() - lastDraft));
    tDraft = window.setTimeout(() => { tDraft = 0; lastDraft = performance.now(); run('draft', 6); }, wait);
    tFull = window.setTimeout(() => run('full'), 900);
  }

  // ── intro: the stack opens once, the first time it is seen ───────
  function maybeIntro() {
    if (introPlayed || !firstFull || !visible) return;
    introPlayed = true;
    if (reducedMotion()) return; // already open
    stage.setSeparation(INTRO_SEP, true);
  }
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); maybeIntro(); }, { threshold: 0.45 })
    : null;
  if (io) io.observe(stageEl); else visible = true;

  // ── small screens: the pinned stage must not hide what you are typing ──
  const setStick = () => root.style.setProperty('--stick-h', `${stageCol.offsetHeight}px`);
  const roStick = new ResizeObserver(setStick);
  roStick.observe(stageCol);
  const compact = () => matchMedia('(max-width: 1039px)').matches;
  on(seedIn, 'focus', () => { if (compact()) rootEl.classList.add('is-typing'); });
  on(seedIn, 'blur', () => rootEl.classList.remove('is-typing'));

  // ── go ───────────────────────────────────────────────────────────
  syncMoment();
  paintIso();
  syncKnobs();
  run('progressive', 2);

  if ((import.meta as any).env?.DEV) (window as any).__made = { stage, S, renderer, run, GEO };

  const dispose = () => {
    live.delete(root);
    clearTimeout(tFull); clearTimeout(tDraft);
    renderer.cancel();
    io?.disconnect();
    roStick.disconnect();
    stage.destroy();
    ac.abort();
  };
  live.set(root, dispose);
  return dispose;
}

// ── traits list ────────────────────────────────────────────────────
const GROUPS: Record<string, string> = { body: 'The body · from the seed', bloom: 'The bloom · seed, horizon and sky', keeper: 'The keeper' };
function traitRows(t: Traits): Node[] {
  const out: Node[] = [];
  let group = '';
  for (const e of t.list) {
    if (e.group !== group) {
      group = e.group;
      out.push(el('div', { class: 'made__tgroup' }, GROUPS[group] ?? group));
    }
    const pct = Number.isNaN(e.share) ? 'sealed' : e.group === 'keeper' ? 'chosen' : `${e.share * 100 < 10 ? (e.share * 100).toFixed(1) : Math.round(e.share * 100)} %`;
    out.push(el('div', { class: 'made__trow' + (e.sealed ? ' is-sealed' : ''), dataset: { tier: e.tier } },
      el('dt', {}, e.label), el('dd', {}, e.value), el('dd', { class: 'made__share num' }, pct)));
  }
  return out;
}
