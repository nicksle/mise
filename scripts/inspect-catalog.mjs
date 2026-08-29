#!/usr/bin/env node
/**
 * inspect-catalog.mjs — the Phase 00 spike.
 *
 * Read-only. Never writes. Point it at a sandbox account to sanity-check your
 * assumptions, then at Parasol's real account to find out what you're actually
 * dealing with before you quote anything.
 *
 *   SQUARE_TOKEN=EAAA... node inspect-catalog.mjs              # sandbox
 *   SQUARE_TOKEN=EAAA... SQUARE_ENV=production node inspect-catalog.mjs
 *
 * Writes catalog-dump.json next to itself so you can grep the raw objects.
 *
 * Requires Node 18+ (built-in fetch). No dependencies.
 */

import { writeFileSync } from 'node:fs';

const TOKEN = process.env.SQUARE_TOKEN;
const ENV = process.env.SQUARE_ENV === 'production' ? 'production' : 'sandbox';
const BASE = ENV === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';
const VERSION = '2026-07-16'; // pin it; Square dates its API versions

if (!TOKEN) {
  console.error('Set SQUARE_TOKEN. Sandbox tokens are in the Developer Console\n' +
                'under your app > Credentials > Sandbox Access Token.');
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Square-Version': VERSION,
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body.errors || []).map(e => `${e.code}: ${e.detail}`).join('; ');
    throw new Error(`${res.status} ${path} — ${msg || JSON.stringify(body)}`);
  }
  return body;
}

/* ---------- fetch everything ---------- */

async function listAll() {
  const types = 'ITEM,ITEM_VARIATION,CATEGORY,MODIFIER_LIST,CUSTOM_ATTRIBUTE_DEFINITION,IMAGE';
  let cursor, all = [];
  do {
    const q = new URLSearchParams({ types });
    if (cursor) q.set('cursor', cursor);
    const page = await api(`/v2/catalog/list?${q}`);
    all = all.concat(page.objects || []);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

/* ---------- reporting helpers ---------- */

const bar = (n, max, w = 28) =>
  '█'.repeat(Math.max(0, Math.round((n / (max || 1)) * w))).padEnd(w, '·');

const money = c => (c == null ? '—' : '$' + (Number(c) / 100).toFixed(2));

function section(title) {
  console.log('\n' + '─'.repeat(66));
  console.log(title.toUpperCase());
  console.log('─'.repeat(66));
}

/* ---------- main ---------- */

const t0 = Date.now();
console.log(`\nSquare catalog inspection — ${ENV}\n${BASE}`);

const { locations = [] } = await api('/v2/locations');
section('locations');
for (const l of locations) {
  console.log(`  ${l.id}  ${l.name}${l.status === 'ACTIVE' ? '' : '  (' + l.status + ')'}`);
  if (l.address) console.log(`      ${[l.address.address_line_1, l.address.locality].filter(Boolean).join(', ')}`);
}

const objects = await listAll();
const by = t => objects.filter(o => o.type === t);
const items = by('ITEM');
const cats = by('CATEGORY');
const defs = by('CUSTOM_ATTRIBUTE_DEFINITION');
const vars = by('ITEM_VARIATION');

section('size');
console.log(`  items                 ${items.length}`);
console.log(`  item variations       ${vars.length}`);
console.log(`  categories            ${cats.length}`);
console.log(`  modifier lists        ${by('MODIFIER_LIST').length}`);
console.log(`  images                ${by('IMAGE').length}`);
console.log(`  custom attr defs      ${defs.length}`);

/* --- categories, and whether this seller uses Square for Restaurants menus --- */
section('categories');
const catById = new Map(cats.map(c => [c.id, c]));
const menuCats = cats.filter(c => c.category_data?.category_type === 'MENU_CATEGORY');
console.log(`  MENU_CATEGORY         ${menuCats.length}   ← the filter the pipeline relies on`);
console.log(`  other category types  ${cats.length - menuCats.length}`);
if (menuCats.length === 0) {
  console.log('\n  ⚠  No MENU_CATEGORY found. Either this seller does not use Square for');
  console.log('     Restaurants menu management, or (in sandbox) it is unavailable.');
  console.log('     The curation rule will need a different basis — check with the GM.');
}
console.log('');
for (const c of cats) {
  const n = items.filter(i => (i.item_data?.categories || []).some(x => x.id === c.id)).length;
  const type = c.category_data?.category_type || 'REGULAR_CATEGORY';
  console.log(`  ${String(n).padStart(4)}  ${bar(n, items.length)}  ${c.category_data?.name}  [${type}]`);
}

/* --- the junk: items reachable but not in any menu category --- */
const inMenuCat = i => (i.item_data?.categories || [])
  .some(x => catById.get(x.id)?.category_data?.category_type === 'MENU_CATEGORY');
const orphans = items.filter(i => !inMenuCat(i));
section(`would be filtered out  (${orphans.length} of ${items.length})`);
if (!orphans.length) console.log('  none — unusually tidy catalog');
for (const i of orphans.slice(0, 40)) {
  console.log(`  ${(i.item_data?.name || '?').slice(0, 44).padEnd(46)} ${i.id}`);
}
if (orphans.length > 40) console.log(`  … and ${orphans.length - 40} more`);

/* --- how bad are the names? this decides how much enrichment work there is --- */
section('name hygiene');
const names = items.map(i => i.item_data?.name || '');
const shouty = names.filter(n => n === n.toUpperCase() && /[A-Z]/.test(n)).length;
const abbrev = names.filter(n => n.length <= 14).length;
const withDesc = items.filter(i => (i.item_data?.description || '').trim().length > 0).length;
console.log(`  ALL CAPS names        ${shouty} / ${items.length}   ${bar(shouty, items.length)}`);
console.log(`  <= 14 chars           ${abbrev} / ${items.length}   ${bar(abbrev, items.length)}`);
console.log(`  have a description    ${withDesc} / ${items.length}   ${bar(withDesc, items.length)}`);
console.log(`\n  Every item without a usable name or description is enrichment work.`);
console.log(`  Estimated stubs needing copy: ${items.length - withDesc}`);

/* --- variation shape: is wine modelled as glass/bottle under one item? --- */
section('variation shape');
const counts = {};
for (const i of items) {
  const n = (i.item_data?.variations || []).length;
  counts[n] = (counts[n] || 0) + 1;
}
for (const [n, c] of Object.entries(counts).sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(n).padStart(2)} variation(s)  ${String(c).padStart(4)} items  ${bar(c, items.length)}`);
}
const multi = items.filter(i => (i.item_data?.variations || []).length > 1);
if (multi.length) {
  console.log('\n  Multi-variation items (this is where glass/bottle would live):');
  for (const i of multi.slice(0, 12)) {
    const vs = (i.item_data.variations || [])
      .map(v => `${v.item_variation_data?.name}=${money(v.item_variation_data?.price_money?.amount)}`)
      .join('  ');
    console.log(`    ${(i.item_data.name || '?').slice(0, 30).padEnd(32)} ${vs}`);
  }
  if (multi.length > 12) console.log(`    … and ${multi.length - 12} more`);
} else {
  console.log('\n  No multi-variation items. If they sell wine by glass AND bottle,');
  console.log('  it is modelled as two separate items — the sync worker must pair them.');
}

/* --- custom attributes: the cap that decides the layer split --- */
section('custom attribute definitions');
const visible = defs.filter(d =>
  (d.custom_attribute_definition_data?.seller_visibility || '').includes('READ_WRITE'));
console.log(`  seller-visible in use  ${visible.length}`);
console.log(`  seller-hidden in use   ${defs.length - visible.length}`);
console.log('  (docs state a cap of 10 each per account — confirm against this number)\n');
for (const d of defs) {
  const dd = d.custom_attribute_definition_data || {};
  console.log(`  ${String(dd.key).padEnd(24)} ${String(dd.type).padEnd(10)} ${dd.seller_visibility}`);
}

/* --- availability --- */
section('availability right now');
let soldOut = 0, tracked = 0;
for (const v of vars) {
  const d = v.item_variation_data || {};
  if ((d.location_overrides || []).some(o => o.sold_out)) soldOut++;
  if (d.track_inventory) tracked++;
}
console.log(`  variations 86'd        ${soldOut}`);
console.log(`  tracking inventory     ${tracked}   ← these can auto-86 at zero`);

/* --- dump --- */
writeFileSync(new URL('./catalog-dump.json', import.meta.url),
  JSON.stringify({ env: ENV, fetched_at: new Date().toISOString(), locations, objects }, null, 2));

section('next');
console.log(`  Raw objects written to catalog-dump.json (${objects.length} objects)`);
console.log(`  Took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`
  Answer these before quoting:
    1. Does the catalog use MENU_CATEGORY, or will curation need another rule?
    2. Is wine glass/bottle one item with two variations, or two items?
    3. How many items need copy written? (the stub count above)
    4. How many custom attribute slots are already spent?
`);
