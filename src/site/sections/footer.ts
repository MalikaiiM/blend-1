// The footer: wordmark, tagline, the same anchors as the nav, and a plain statement about the images.

import '../styles/footer.css';
import { el } from '../lib/dom.ts';
import { PARAMS } from '../../art/index.ts';

const LINKS: [string, string][] = [
  ['#story', 'Story'],
  ['#made', 'How it’s made'],
  ['#mechanic', 'The mechanic'],
  ['#gallery', 'Gallery'],
  ['#timeline', 'Timeline'],
  ['#mint', 'Mint'],
];

export default function mount(root: HTMLElement) {
  root.replaceChildren();
  root.classList.add('foot--ready');
  root.append(el('div', { class: 'wrap foot__inner' },
    el('div', { class: 'foot__brand' },
      el('a', { class: 'foot__mark', href: '#top', 'aria-label': 'Halocline — back to top' }, 'Halocline'),
      el('p', { class: 'foot__tag' }, PARAMS.meta.tagline),
    ),
    el('nav', { class: 'foot__nav', 'aria-label': 'Footer' },
      el('ul', { role: 'list' }, ...LINKS.map(([href, label]) => el('li', {}, el('a', { href }, label)))),
    ),
    el('div', { class: 'foot__fine' },
      el('p', { class: 'foot__live' }, 'Every image on this page is generated live in your browser from the seed printed beside it.'),
      el('p', { class: 'foot__credit' }, 'Set in Instrument Serif and DM Mono.'),
    ),
    el('div', { class: 'foot__base' },
      el('p', { class: 'foot__copy' }, '© 2026 Halocline'),
      el('a', { class: 'foot__top', href: '#top' }, 'Back to top'),
    ),
  ));
  return () => { root.replaceChildren(); root.classList.remove('foot--ready'); };
}
