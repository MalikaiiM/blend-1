// Write a named section of docs/AUDIT.md between marker comments, leaving the rest untouched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeSection(file: string, key: string, md: string) {
  const start = `<!-- ${key}:start -->`, end = `<!-- ${key}:end -->`;
  mkdirSync(dirname(file), { recursive: true });
  let doc = existsSync(file) ? readFileSync(file, 'utf8') : '# Halocline — audit\n\n';
  const block = `${start}\n${md.trim()}\n${end}`;
  if (doc.includes(start) && doc.includes(end)) doc = doc.slice(0, doc.indexOf(start)) + block + doc.slice(doc.indexOf(end) + end.length);
  else doc = doc.trimEnd() + '\n\n' + block + '\n';
  writeFileSync(file, doc);
}
export const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%';
