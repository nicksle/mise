#!/usr/bin/env node
/**
 * demo.mjs — the whole system in one command, no Square account required.
 *
 *   npm run demo
 *
 * Starts the mock POS, syncs, builds, then simulates a real service: a manager
 * 86s a glass pour on the terminal and the kitchen adds a dish with no copy.
 * Re-syncs and shows what each of the three views does about it.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MOCK = 'http://127.0.0.1:8789';

const rule = (t = '') => console.log('\n' + '─'.repeat(64) + (t ? `\n${t}` : ''));

const mock = spawn(process.execPath, [join(HERE, 'mock-square.mjs')], {
  cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
});
process.on('exit', () => mock.kill());
process.on('SIGINT', () => { mock.kill(); process.exit(0); });

const run = async (mod) => {
  const m = await import(join(ROOT, 'src', mod) + `?t=${Date.now()}`);
  return m.sync ? m.sync() : m.build();
};

await sleep(900);

rule('1 · First sync — the catalog as it stands');
await run('sync.mjs');
await run('build.mjs');

rule('2 · Service happens');
console.log('   A manager 86s the Sancerre by the glass on the terminal.');
const a = await fetch(`${MOCK}/_mock/86/SANCERRE%20GLS?variation=glass`, { method: 'POST' });
console.log('  ', await a.text());
console.log('\n   The somm opens something new at 5pm. Nobody writes copy.');
const b = await fetch(`${MOCK}/_mock/add`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'RIES KABINETT', category_id: 'MOCK_CAT_1', amount: 1600 }),
});
console.log('  ', await b.text());

rule('3 · Re-sync — this is what the webhook would trigger');
await run('sync.mjs');
await run('build.mjs');

rule('What each view did about it');
console.log(`
  Guest menu     Sancerre still listed, tagged "bottle only", glass price
                 dashed out — the pour blew, the cellar bottle did not.
                 RIES KABINETT does not appear at all.

  Service ref    Both are present. RIES KABINETT is flagged needs_review
                 in amber, because you are selling it tonight.

  Print draft    86'd pours omitted; you would not reprint over one blown
                 bottle. Carries a build ref so a reprint is reproducible.

  schema.org     Stubs and 86'd items omitted entirely — Google should not
                 index something the kitchen cannot serve.

  Open these:
    out/guest.html    out/service.html    out/print.html    out/menu.jsonld
`);

mock.kill();
