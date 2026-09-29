// Where is the dev server? serve.mjs records the URL Vite really bound in .dev-url; tools read it from here.
import { readFileSync } from 'node:fs';

export function devUrl(mode = 'dev', fallback = mode === 'preview' ? 'http://localhost:4173' : 'http://localhost:5173') {
  try {
    const u = readFileSync(new URL(`../.${mode}-url`, import.meta.url), 'utf8').trim();
    if (u) return u;
  } catch { /* server not started through serve.mjs */ }
  return fallback;
}
