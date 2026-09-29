// The words of the story. Numbers are read from PARAMS so the prose cannot drift from the clock.
// `*word*` marks an italic phrase.

import { PARAMS } from '../../art/index.ts';
import { fmtInt } from '../lib/format.ts';

const c = PARAMS.clock;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = (n: number) => WORDS[n] ?? String(n);

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface Passage {
  title: string;
  body: string;
  line: string;
}

export const HEAD = {
  eyebrow: '01 — The story',
  h2: ['Light does not drown there.', '*It settles.*'],
  lede: 'Five short passages from the shore: how a seed is lifted out of the deep, how it keeps the Tide, and why no two ever open alike.',
};

export const PASSAGES: Passage[] = [
  {
    title: 'The Glass Sea',
    body:
      'The Glass Sea is older than the days: black, patient, and keeping every light that has ever fallen into it. Nothing drowns there. ' +
      'Each light settles as a sheet of its own age and colour, laid against the next so exactly that the two never mix. ' +
      'Where they meet the water shimmers, and the shore calls that seam the *halocline*.',
    line: 'Nothing is lost there. It is only laid down.',
  },
  {
    title: 'The Seed',
    body:
      'The tidekeepers, who live on the shore, have learned to lift a single sheet out of the deep. ' +
      'What comes up is a seed: cold, dim and half-formed, as heavy as a pane of window glass, with a faint ember waiting where the bloom will be. ' +
      'It cannot open alone. It needs the Tide.',
    line: 'Not yet a bloom. Already this seed, and no other.',
  },
  {
    title: 'Four Tides',
    body:
      `The shore keeps one clock, and it is the Tide: a beat every ${word(c.blockSeconds)} seconds, a day every ${fmtInt(c.blocksPerDay)} beats, and a great swell every ${word(c.tideDays)} days. ` +
      `A seed needs ${word(c.tides)} such swells to wake its ${word(c.tides)} depths, one by one. They are the Deep, the Sheets, the Threads and the Lamp.`,
    line: 'A sheet of settled light is still slowly settling.',
  },
  {
    title: 'The Turning',
    body:
      'In the last days the keeper turns the seed to face a horizon: Dawn, Dusk, Zenith or Nadir. That is all a keeper does. ' +
      'The turn may be changed as often as they like, until the Still Hour, when every seed is held where it is. ' +
      'A seed cannot see what is coming; it can only feel which way it is facing.',
    line: 'It knows one thing of the future: the way it was held.',
  },
  {
    title: 'The Bloom',
    body:
      'When the fourth tide breaks the sky opens: a value that no one can know beforehand, not the keeper, not the maker. ' +
      'The whole night of gathered light comes through the seed, coloured by everything it passed, shaped by the way it was held and by the sky. ' +
      'The bud unfolds over a single day, and after that it is done.',
    line: 'No two keepers turn a seed alike. That is why no two blooms are.',
  },
];

/** Turn a `*word*` string into DOM nodes (text + <em>). */
export function richNodes(s: string): (Node | string)[] {
  return s.split('*').map((part, i) => {
    if (i % 2 === 0) return part;
    const em = document.createElement('em');
    em.textContent = part;
    return em;
  });
}
