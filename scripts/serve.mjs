#!/usr/bin/env node
// Start Vite (dev or preview) on a port that is genuinely free — never one another program is already using.
//
//   npm run dev                  first free port from 5173; opens your browser on macOS/Windows terminals
//   npm run preview              (after `npm run build`) first free port from 4173
//   npm run dev -- --open        force-open the browser        NO_OPEN=1 npm run dev     never open it
//
// Why not just let Vite choose? Vite only notices a busy port if its own bind fails. A forgotten dev server sitting on
// [::1]:5173 does NOT stop another program from binding 0.0.0.0:5173 — and then `localhost:5173` in the browser reaches
// the OLD server (the classic "Internal Server Error / EPERM" from some other project). So this asks the way a browser
// would: try to CONNECT to the port on every loopback address, and accept a port only if nothing answers and we can bind
// both loopbacks ourselves. The URL Vite actually ends up on is written to .dev-url / .preview-url so scripts can find it.

import net from 'node:net';
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] === 'preview' ? 'preview' : 'dev';
const passthrough = process.argv.slice(3);
const root = fileURLToPath(new URL('..', import.meta.url));
const urlFile = fileURLToPath(new URL(`../.${mode}-url`, import.meta.url));
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

// Vite 8 needs Node 20.19+ or 22.12+.
const [maj, min] = process.versions.node.split('.').map(Number);
if (!((maj === 20 && min >= 19) || (maj === 22 && min >= 12) || maj > 22)) {
  console.error(`\n  Node ${process.versions.node} is too old for this project — it needs Node 20.19+ or 22.12+ (https://nodejs.org).\n`);
  process.exit(1);
}

const LOOPBACKS = ['127.0.0.1', '::1'];
const NOT_LISTENING = new Set(['ECONNREFUSED', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ENETUNREACH', 'EHOSTUNREACH']);

/** Does anything accept a connection on this port? (A silent, filtered port counts as taken.) */
function answers(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(500, () => done(true));
    s.once('connect', () => done(true));
    s.once('error', (e) => done(!NOT_LISTENING.has(e.code)));
  });
}
function canBind(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (e) => resolve(e.code === 'EAFNOSUPPORT' || e.code === 'EADDRNOTAVAIL')); // no IPv6 here is fine
    s.listen({ port, host, exclusive: true }, () => s.close(() => resolve(true)));
  });
}
async function isFree(port) {
  for (const h of LOOPBACKS) if (await answers(port, h)) return false;
  for (const h of LOOPBACKS) if (!(await canBind(port, h))) return false;
  return true;
}

const preferred = mode === 'preview' ? 4173 : 5173;
const skipped = [];
let port = preferred;
for (; port < preferred + 300; port++) {
  if (await isFree(port)) break;
  skipped.push(port);
}
if (port >= preferred + 300) {
  console.error(`\n  No free port found between ${preferred} and ${preferred + 299}.\n`);
  process.exit(1);
}
if (skipped.length) {
  console.log(`\n  Port${skipped.length > 1 ? 's' : ''} ${skipped.join(', ')} already in use by another program — leaving ${skipped.length > 1 ? 'them' : 'it'} alone.\n  Using ${port} instead.`);
}

const wantOpen =
  !process.env.NO_OPEN && !passthrough.some((a) => a === '--open' || a === '--no-open') &&
  process.stdout.isTTY && ['darwin', 'win32'].includes(process.platform);
const args = [viteBin, mode, '--port', String(port), ...(wantOpen ? ['--open'] : []), ...passthrough];

const child = spawn(process.execPath, args, { cwd: root, stdio: ['inherit', 'pipe', 'inherit'], env: process.env });
let recorded = false;
child.stdout.on('data', (buf) => {
  process.stdout.write(buf);
  if (recorded) return;
  const m = /Local:\s+(https?:\/\/\S+)/.exec(buf.toString().replace(/\x1b\[[0-9;]*m/g, ''));
  if (m) { recorded = true; writeFileSync(urlFile, m[1].replace(/\/$/, '') + '\n'); }
});
const cleanup = () => { try { rmSync(urlFile, { force: true }); } catch { /* ignore */ } };
child.on('exit', (code) => { cleanup(); process.exit(code ?? 0); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
process.on('exit', cleanup);
