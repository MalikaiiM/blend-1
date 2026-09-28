import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/dm-mono/latin-300.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/nav.css';
import { initNav } from './nav.ts';
import { mountSections } from './sections.ts';
import { observeReveal } from './lib/reveal.ts';

initNav();
mountSections();
observeReveal();
