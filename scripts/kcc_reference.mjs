#!/usr/bin/env node
// KCC 1.0: write data/kcc-quotes-reference.json, a fixed set of quotes produced by the real
// worker code on the bundled JSON. Anyone can re-run it and diff: the quotes are deterministic.
//   node scripts/kcc_reference.mjs          (write)    node scripts/kcc_reference.mjs --check   (diff, exit 1 on drift)
import { loadWorker } from './build_invest.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'kcc-quotes-reference.json');
const CASES = [
  ['Port Harcourt', 'Apapa', 'cement_bagged'], ['Onne', 'Kano', 'fertilizer_urea'], ['Aba', 'Port Harcourt', 'palm_oil'],
  ['Warri', 'Benin City', 'fuel_ago'], ['Gboko', 'Enugu', 'cement_bulk'], ['Kano', 'Onitsha', 'rice'], ['6.5,3.4', 'Uyo', 'steel_rebar'],
];
const w = await loadWorker();
const quotes = [];
for (const [from, to, commodity] of CASES) {
  const r = await w.fetch(new Request('https://offline.local/api/kcc/quote?' + new URLSearchParams({ from, to, commodity })), {}, {});
  quotes.push(await r.json());
}
const text = JSON.stringify({ note: 'Deterministic reference quotes from worker/src/kcc.js on bundled JSON. Re-run: node scripts/kcc_reference.mjs --check', quotes }, null, 1) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== text) { console.error('KCC reference quotes drifted'); process.exit(1); }
  console.log('KCC reference quotes identical');
} else { writeFileSync(OUT, text); console.log('wrote', OUT); }
