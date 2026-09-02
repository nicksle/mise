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
import { ROOT, square as sq, curation, pricing, checks, publishing, menus as menuDefs } from './config.mjs';
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
    /* Every menu category it sits in, not just the first — an item can
       legitimately appear on more than one menu (a wine on the drinks list
       and on happy hour). Composition depends on knowing all of them. */
    const menuCats = cats.filter(isMenuCategory);

    const denied = curation.denyNamePatterns.find(re => re.test(name));
    if (denied) { dropped.push({ item, why: `name matches ${denied}` }); continue; }
    if (curation.requireMenuCategory && !menuCats.length) {
      dropped.push({ item, why: 'not in a menu category' });
      continue;
    }
    kept.push({ item, categories: menuCats });
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

  if (checks.failOnMissingSection && !model.menus.length)
    problems.push('no menus produced — the curation filter matched nothing');

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
  const uniqueItems = [...new Map(kept.map(k => [k.item.id, k.item])).values()];
  const { stubs, fresh } = reconcileStubs(uniqueItems, editorial);

  /* merge stub records into the editorial view so joinLayers sees them */
  for (const [id, s] of Object.entries(stubs)) {
    if (!editorial.items[id]) editorial.items[id] = { menu_name: s.menu_name || '' };
  }

  /* Which categories are wine, from the menu definitions. The wine-only
     rules key off this: a cocktail has no vintage to confirm. */
  const wineCategories = new Set(
    menuDefs.flatMap(m => m.sources.filter(s => s.kind === 'wine')
      .map(s => norm(s.category))));

  /* One entry per (item, category) pair. */
  const byCategory = new Map();
  for (const { item, categories } of kept) {
    const joined = joinLayers(item, editorial);
    const shape = priceShape(item, soldOutBy, stockBy);
    for (const category of categories) {
      const catName = category?.category_data?.name || 'Menu';
      const isWine = wineCategories.has(norm(catName));
      const months = vintageAgeMonths(joined.vintageConfirmed);
      const entry = {
        ...joined, ...shape,
        category: catName,
        isWine,
        vintageAgeMonths: isWine ? months : null,
        staleVintage: isWine && months != null && months >= publishing.staleVintageMonths,
      };
      if (!byCategory.has(catName)) byCategory.set(catName, []);
      byCategory.get(catName).push(entry);
    }
  }

  /* Compose each menu from its sources, in the order the config lists them. */
  const catKeyByNorm = new Map([...byCategory.keys()].map(k => [norm(k), k]));
  const bySortIndex = (a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name);

  const buildSection = (catName, src) => ({
    name: src.as || editorial.sections[catName]?.name || catName,
    category: catName,
    kind: src.kind || 'plate',
    sortIndex: editorial.sections[catName]?.sort_index ?? 999,
    items: [...byCategory.get(catName)].sort((a, b) =>
      a.sortIndex - b.sortIndex || a.menuName.localeCompare(b.menuName)),
  });

  const builtMenus = [];
  const skippedMenus = [];
  for (const def of menuDefs) {
    const matched = def.sources
      .map(src => ({ src, catName: catKeyByNorm.get(norm(src.category)) }));

    /* A menu with a `required` source and no match for it is a menu this
       restaurant doesn't run yet — skip it rather than assembling something
       that looks like a menu and isn't. */
    const missingRequired = matched.some(x => x.src.required && !x.catName);
    if (missingRequired) { skippedMenus.push(def.slug); continue; }

    const sections = matched
      .filter(x => x.catName)
      .map(x => buildSection(x.catName, x.src))
      .filter(sec => sec.items.length);
    if (!sections.length) { skippedMenus.push(def.slug); continue; }
    builtMenus.push({ slug: def.slug, name: def.name, sections });
  }

  /* Back-compatible flat view: every section that reached a menu, deduped by
     category. Renderers that predate composition keep working unchanged. */
  const seenCat = new Set();
  const sections = builtMenus
    .flatMap(m => m.sections)
    .filter(sec => !seenCat.has(sec.category) && seenCat.add(sec.category))
    .sort(bySortIndex);

  /* Happy-hour twins: the same drink exists twice in the POS and Square does
     not know they are related. One live while the other is 86'd is a guest
     being told something untrue. */
  const warnings = [];
  if (checks.warnOnOrphanedTwin) {
    const entries = builtMenus.flatMap(m => m.sections.flatMap(sec => sec.items));
    const byId = new Map();
    for (const e of entries) if (!byId.has(e.id)) byId.set(e.id, e);
    const seenPair = new Set();
    for (const e of entries) {
      const twinId = editorial.items[e.id]?.twin_of;
      if (!twinId) continue;
      const twin = byId.get(twinId);
      /* Compare against the twin's POUR, not the item: 86'ing the glass
         leaves the cellar bottle available, and a happy-hour glass should
         die with the pour it duplicates. */
      const twinLive = twin.kind === 'pour' && twin.glassAvailable != null
        ? twin.glassAvailable : twin.available;
      if (!twin || !e.available || twinLive) continue;
      const pair = [e.id, twinId].sort().join('|');
      if (seenPair.has(pair)) continue;
      seenPair.add(pair);
      warnings.push(`"${e.menuName || e.posName}" is live but its twin ` +
        `"${twin.menuName || twin.posName}" is 86'd — one of them is wrong`);
    }
  }

  const model = {
    generatedAt: new Date().toISOString(),
    source: `square:${sq.env}`,
    locationId,
    menus: builtMenus,
    sections,
    warnings,
    stats: {
      itemsInCatalog: items.length,
      published: sections.flatMap(s => s.items).filter(i => !i.needsReview).length,
      heldBack: sections.flatMap(s => s.items).filter(i => i.needsReview).length,
      filteredOut: dropped.length,
      soldOut: sections.flatMap(s => s.items).filter(i => !i.available).length,
      staleVintages: sections.flatMap(s => s.items).filter(i => i.staleVintage).length,
      menusPublished: builtMenus.length,
      menusSkipped: skippedMenus,
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
  say(`  ${s.menusPublished} menu${s.menusPublished === 1 ? '' : 's'} composed: ` +
      builtMenus.map(m => `${m.name} (${m.sections.length})`).join(', '));
  if (s.menusSkipped.length)
    say(`  skipped, nothing in the catalog for them: ${s.menusSkipped.join(', ')}`);
  say(`  ${s.filteredOut} filtered out (not menu items)`);
  say(`  ${s.published} published to guests`);
  if (s.heldBack)      say(`  ${s.heldBack} held back — awaiting copy${fresh.length ? ` (${fresh.length} new this run)` : ''}`);
  if (s.soldOut)       say(`  ${s.soldOut} currently 86'd`);
  if (s.staleVintages) say(`  ${s.staleVintages} wines with a stale vintage — confirm with the somm`);
  for (const w of warnings) say(`  ! ${w}`);
  say(`  → out/menu.json\n`);

  return model;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  sync().catch(e => {
    if (!e.problems) console.error('\n  ' + e.message + '\n');
    process.exit(1);
  });
}
