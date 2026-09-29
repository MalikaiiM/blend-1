#!/usr/bin/env node
// Build the whole site into ONE self-contained HTML file.
//
//   npm run build:single                      →  dist-single/halocline.html      (open it straight from disk)
//                                                dist-single/halocline.fragment.html   (same page as a body fragment, for hosts that supply <html><head><body>)
//   SINGLE_OUT=/some/dir npm run build:single  writes the two files there instead
//
// Nothing in the output makes a network request: JS and CSS are inline and the two typefaces are data: URIs.

import { build } from 'vite';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(process.env.SINGLE_OUT ?? join(root, 'dist-single'));
const tmp = mkdtempSync(join(tmpdir(), 'halocline-single-'));
process.env.SINGLE_TMP = tmp;

await build({ root, configFile: join(root, 'vite.single.config.ts'), logLevel: 'warn' });

const html = readFileSync(join(tmp, 'index.html'), 'utf8');
const read = (rel) => readFileSync(join(tmp, rel.replace(/^\.\//, '')), 'utf8');

const scriptTag = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>\s*/i.exec(html);
const cssTags = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>\s*/gi)];
if (!scriptTag) throw new Error('no module script found in the built index.html');
const js = read(scriptTag[1]).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = cssTags.map((m) => read(m[1])).join('\n').replace(/<\/style/gi, '<\\/style');
if (readdirSync(tmp).some((f) => f.endsWith('.js') && f !== scriptTag[1].split('/').pop() && f !== 'index.html')) {
  // assets/ holds the chunks; more than one JS file would mean code-splitting survived
}

const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? 'Halocline';
const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
const critical = [...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
const langAttr = /<html[^>]*\blang="([^"]+)"/i.exec(html)?.[1] ?? 'en';
const description = /<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? '';
const favicon = 'data:image/svg+xml,' + encodeURIComponent(readFileSync(join(root, 'public', 'favicon.svg'), 'utf8').replace(/\s+/g, ' ').trim());
const bodyClean = body.replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>\s*/gi, '');

const standalone = `<!doctype html>
<html lang="${langAttr}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta name="theme-color" content="#05060b" />
<link rel="icon" href="${favicon}" type="image/svg+xml" />
<style>${critical}</style>
<style>${css}</style>
</head>
<body>
${bodyClean}
<script type="module">${js}</script>
</body>
</html>
`;

// For hosts that wrap the page in their own <!doctype><html><head><body>: title first, then styles, markup, script.
const fragment = `<title>${process.env.SINGLE_TITLE ?? title}</title>
<style>${critical}\n${css}</style>
${bodyClean}
<script type="module">${js}</script>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'halocline.html'), standalone);
writeFileSync(join(outDir, 'halocline.fragment.html'), fragment);
rmSync(tmp, { recursive: true, force: true });
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' kB';
console.log(`wrote ${join(outDir, 'halocline.html')} (${kb(standalone)}) and halocline.fragment.html (${kb(fragment)})`);
console.log(`  js ${kb(js)} · css ${kb(css)} (fonts inlined)`);
