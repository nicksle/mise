#!/usr/bin/env node
/**
 * sync.mjs — the worker. Square in, menu.json out.
 *
 *   fetch → curate → enrich → normalize → validate → write
 *
 * Everything downstream renders from menu.json and nothing else. If this file
 * is correct, the renderers cannot publish something wrong.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, square as sq, curation, pricing, checks, publishing } from './config.mjs';
import { listCatalog, resolveLocation, inventoryCounts } from './square.mjs';
import { loadEditorial, joinLayers, reconcileStubs, vintageAgeMonths } from './enrich.mjs';

const OUT = join(ROOT, 'out');
const STATE = join(ROOT, 'data', 'sync-state.json');

const log = (...a) => console.log(...a);
const norm = s => String(s || '').trim().toLowerCase();

/* ---------------------------------------------------------------- */
/* curate                                                            */
/* ---------------------------------------------------------------- */

function isMenuCategory(cat) {
  if (!cat) return false;
  const d = cat.category_data || {};
  if (d.category_type === 'MENU_CATEGORY') return true;
  // Fallback for accounts not using Square for Restaurants (and for sandbox,
  // where Restaurants menu management is unavailable).
  return curation.menuCategoryNames.includes(norm(d.name));
}

function curate(items, catById) {
  const kept = [], dropped = [];
  for (const item of items) {
    const name = item.item_data?.name || '';
    const cats = (item.item_data?.categories || []).map(c => catById.get(c.id)).filter(Boolean);
    const menuCat = cats.find(isMenuCategory);

    const denied = curation.denyNamePatterns.find(re => re.test(name));
    if (denied) { dropped.push({ item, why: `name matches ${denied}` }); continue; }
    if (curation.requireMenuCategory && !menuCat) {
      dropped.push({ item, why: 'not in a menu category' });
      continue;
    }
    kept.push({ item, category: menuCat });
  }
  return { kept, dropped };
}

/* ---------------------------------------------------------------- */
/* price rules                                                       */
/* ---------------------------------------------------------------- */

const amountOf = v => Number(v?.item_variation_data?.price_money?.amount ?? NaN);
const varName = v => norm(v?.item_variation_data?.name);

function priceShape(item, soldOutBy, stockBy) {
  const vars = item.item_data?.variations || [];
  const find = names => vars.find(v => names.includes(varName(v)));

  const glass = find(pricing.glassNames);
  const bottle = find(pricing.bottleNames);

  // A wine: one item, two variations, two independent sold_out flags.
  if (glass || bottle) {
    return {
      kind: 'pour',
      glass: glass ? amountOf(glass) / 100 : null,
      bottle: bottle ? amountOf(bottle) / 100 : null,
      glassAvailable: glass ? !soldOutBy.has(glass.id) : null,
      bottleAvailable: bottle ? !soldOutBy.has(bottle.id) : null,
      stock: bottle && stockBy[bottle.id] != null ? stockBy[bottle.id] : null,
      available: (glass && !soldOutBy.has(glass.id)) || (bottle && !soldOutBy.has(bottle.id)),
    };
  }

  const amounts = vars.map(amountOf).filter(n => Number.isFinite(n));
  const chosen = pricing.singlePriceStrategy === 'lowest'
    ? Math.min(...amounts) : amounts[0];
  return {
    kind: 'plate',
    price: Number.isFinite(chosen) ? chosen / 100 : null,
    available: vars.some(v => !soldOutBy.has(v.id)),
    stock: null,
  };
}

/* ---------------------------------------------------------------- */
/* validate                                                          */
/* ---------------------------------------------------------------- */

function validate(model) {
  const problems = [];
  const all = model.sections.flatMap(s => s.items);

  if (checks.failOnMissingSection && !model.sections.length)
    problems.push('no sections produced — the curation filter matched nothing');

  for (const s of model.sections) {
    if (checks.failOnEmptySection && !s.items.length)
      problems.push(`section "${s.name}" is empty`);
  }
  if (checks.failOnZeroPrice) {
    for (const i of all) {
      const p = i.kind === 'pour' ? (i.glass ?? i.bottle) : i.price;
      if (p == null || p <= 0) problems.push(`"${i.posName}" has no usable price`);
    }
  }
  const stubs = all.filter(i => i.needsReview).length;
  if (all.length && stubs / all.length > checks.maxStubRatio)
    problems.push(`${stubs}/${all.length} items have no menu copy — the enrichment join looks broken`);

  return problems;
}

/* ---------------------------------------------------------------- */
/* main                                                              */
/* ---------------------------------------------------------------- */

export async function sync({ quiet = false } = {}) {
  const say = quiet ? () => {} : log;
  say(`\n  mise sync  ·  ${sq.env}  ·  ${sq.base}`);

  const locationId = await resolveLocation();
  const objects = await listCatalog();

  const items = objects.filter(o => o.type === 'ITEM' && !o.is_deleted);
  const catById = new Map(objects.filter(o => o.type === 'CATEGORY').map(c => [c.id, c]));

  /* sold_out lives per-variation, per-location */
  const soldOutBy = new Set();
  const trackedIds = [];
  for (const item of items) {
    for (const v of item.item_data?.variations || []) {
      const d = v.item_variation_data || {};
      if ((d.location_overrides || []).some(o => o.location_id === locationId && o.sold_out)) {
        soldOutBy.add(v.id);
      }
      if (d.track_inventory) trackedIds.push(v.id);
    }
  }
  const stockBy = await inventoryCounts(trackedIds, locationId);

  const { kept, dropped } = curate(items, catById);
  const editorial = loadEditorial();
  const { stubs, fresh } = reconcileStubs(kept.map(k => k.item), editorial);

  /* merge stub records into the editorial view so joinLayers sees them */
  for (const [id, s] of Object.entries(stubs)) {
    if (!editorial.items[id]) editorial.items[id] = { menu_name: s.menu_name || '' };
  }

  /* group into sections, ordered by the editorial sequence */
  const bySection = new Map();
  for (const { item, category } of kept) {
    const joined = joinLayers(item, editorial);
    const shape = priceShape(item, soldOutBy, stockBy);
    const catName = category?.category_data?.name || 'Menu';
    const sectionName = editorial.sections[catName]?.name || catName;

    const entry = {
      ...joined, ...shape,
      vintageAgeMonths: vintageAgeMonths(joined.vintageConfirmed),
      staleVintage: (() => {
        const m = vintageAgeMonths(joined.vintageConfirmed);
        return m != null && m >= publishing.staleVintageMonths;
      })(),
    };
    if (!bySection.has(sectionName)) bySection.set(sectionName, []);
    bySection.get(sectionName).push(entry);
  }

  const sections = [...bySection.entries()]
    .map(([name, list]) => ({
      name,
      sortIndex: editorial.sections[name]?.sort_index ?? 999,
      items: list.sort((a, b) => a.sortIndex - b.sortIndex ||
        a.menuName.localeCompare(b.menuName)),
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));

  const model = {
    generatedAt: new Date().toISOString(),
    source: `square:${sq.env}`,
    locationId,
    sections,
    stats: {
      itemsInCatalog: items.length,
      published: sections.flatMap(s => s.items).filter(i => !i.needsReview).length,
      heldBack: sections.flatMap(s => s.items).filter(i => i.needsReview).length,
      filteredOut: dropped.length,
      soldOut: sections.flatMap(s => s.items).filter(i => !i.available).length,
      staleVintages: sections.flatMap(s => s.items).filter(i => i.staleVintage).length,
    },
    dropped: dropped.map(d => ({ id: d.item.id, name: d.item.item_data?.name, why: d.why })),
  };

  const problems = validate(model);
  if (problems.length) {
    console.error('\n  BUILD FAILED — refusing to publish:\n');
    for (const p of problems) console.error(`    ✗ ${p}`);
    console.error('');
    const err = new Error('sanity checks failed');
    err.problems = problems;
    throw err;
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'menu.json'), JSON.stringify(model, null, 2) + '\n');
  writeFileSync(STATE, JSON.stringify({
    lastSync: model.generatedAt, locationId,
  }, null, 2) + '\n');

  const s = model.stats;
  say(`  ${s.itemsInCatalog} items in catalog`);
  say(`  ${s.filteredOut} filtered out (not menu items)`);
  say(`  ${s.published} published to guests`);
  if (s.heldBack)      say(`  ${s.heldBack} held back — awaiting copy${fresh.length ? ` (${fresh.length} new this run)` : ''}`);
  if (s.soldOut)       say(`  ${s.soldOut} currently 86'd`);
  if (s.staleVintages) say(`  ${s.staleVintages} wines with a stale vintage — confirm with the somm`);
  say(`  → out/menu.json\n`);

  return model;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  sync().catch(e => {
    if (!e.problems) console.error('\n  ' + e.message + '\n');
    process.exit(1);
  });
}
