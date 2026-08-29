#!/usr/bin/env node
/**
 * seed-sandbox.mjs — build a mock Parasol in a Square sandbox account.
 *
 * Creates the custom attribute definitions, the menu categories, the brunch
 * menu, the by-the-glass wine list (with glass/bottle variations), and a
 * handful of junk items so you can prove the curation filter actually works.
 *
 *   SQUARE_TOKEN=EAAA... node seed-sandbox.mjs
 *   SQUARE_TOKEN=EAAA... node seed-sandbox.mjs --wipe    # clear seeded objects first
 *
 * SANDBOX ONLY by design — it refuses to run against production, because this
 * writes to the catalog and you do not want that pointed at a real restaurant.
 *
 * Requires Node 18+ (built-in fetch). No dependencies.
 */

import { randomUUID } from 'node:crypto';

const TOKEN = process.env.SQUARE_TOKEN;
const BASE = 'https://connect.squareupsandbox.com';
const VERSION = '2026-07-16';
const WIPE = process.argv.includes('--wipe');

if (!TOKEN) {
  console.error('Set SQUARE_TOKEN to your SANDBOX access token.');
  console.error('Developer Console > your app > Credentials > Sandbox Access Token.');
  process.exit(1);
}
if (process.env.SQUARE_ENV === 'production') {
  console.error('Refusing to run against production. This script writes to the catalog.');
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Square-Version': VERSION,
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body.errors || []).map(e => `${e.category}/${e.code}: ${e.detail}`).join('; ');
    throw new Error(`${res.status} ${path}\n  ${msg || JSON.stringify(body)}`);
  }
  return body;
}

const upsert = objects =>
  api('/v2/catalog/batch-upsert', {
    method: 'POST',
    body: JSON.stringify({ idempotency_key: randomUUID(), batches: [{ objects }] }),
  });

const money = amount => ({ amount, currency: 'USD' });

const variation = (itemRef, name, amount, extra = {}) => ({
  type: 'ITEM_VARIATION',
  id: `#${itemRef}_${name.toLowerCase()}`,
  present_at_all_locations: true,
  item_variation_data: {
    item_id: `#${itemRef}`,
    name,
    pricing_type: 'FIXED_PRICING',
    price_money: money(amount),
    ...extra,
  },
});

/* ------------------------------------------------------------------ */
/* 1. custom attribute definitions — the presentation layer            */
/* ------------------------------------------------------------------ */
/* Square caps these per account. Spend them on what the restaurant     */
/* must be able to edit itself; everything else belongs in the repo.    */

const DEFINITIONS = [
  { key: 'menu_name',        name: 'Menu name',        type: 'STRING' },
  { key: 'menu_description', name: 'Menu description', type: 'STRING' },
  { key: 'allergens',        name: 'Allergens',        type: 'STRING' },
  // wine-specific: vintage rolls without warning and the somm must fix it fast
  { key: 'vintage',           name: 'Vintage',           type: 'NUMBER' },
  { key: 'vintage_confirmed', name: 'Vintage confirmed', type: 'STRING' },
];

/* ------------------------------------------------------------------ */
/* 2. the menu                                                         */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { ref: 'cat_plates',    name: 'Plates',    menu: true },
  { ref: 'cat_sweet',     name: 'Sweet',     menu: true },
  { ref: 'cat_sides',     name: 'Sides',     menu: true },
  { ref: 'cat_cocktails', name: 'Cocktails', menu: true },
  { ref: 'cat_coffee',    name: 'Coffee',    menu: true },
  { ref: 'cat_wine_btg',  name: 'Wine BTG',  menu: true },
  { ref: 'cat_wine_btl',  name: 'Wine Bottle', menu: true },
  { ref: 'cat_ops',       name: 'Operations', menu: false }, // the junk drawer
];

/* POS names are deliberately ugly. That is the point. */
const FOOD = [
  { ref: 'f_benny',   pos: 'BRUNCH BENNY',    cat: 'cat_plates',    price: 2100,
    menuName: 'Parasol Benedict',         desc: 'poached eggs, black forest ham, chive hollandaise, english muffin', allergens: 'egg, gluten, dairy' },
  { ref: 'f_chkn',    pos: 'CHKN SNDWCH',     cat: 'cat_plates',    price: 1800,
    menuName: 'Buttermilk Fried Chicken', desc: 'pickled fresno, dill aioli, milk bun', allergens: 'gluten, dairy' },
  { ref: 'f_shak',    pos: 'SHAKSHUKA',       cat: 'cat_plates',    price: 1900,
    menuName: 'Shakshuka',                desc: 'stewed tomato and pepper, feta, soft egg, grilled bread', allergens: 'egg, dairy, gluten' },
  { ref: 'f_avo',     pos: 'AVO TST',         cat: 'cat_plates',    price: 1600,
    menuName: 'Avocado Toast',            desc: 'castelvetrano olive, chili crisp, levain', allergens: 'gluten' },
  { ref: 'f_dutch',   pos: 'DUTCH BABY',      cat: 'cat_sweet',     price: 1700,
    menuName: 'Lemon Dutch Baby',         desc: 'meyer lemon curd, powdered sugar, stone fruit', allergens: 'egg, dairy, gluten' },
  { ref: 'f_gran',    pos: 'GRANOLA BWL',     cat: 'cat_sweet',     price: 1300,
    menuName: 'House Granola',            desc: 'greek yogurt, honeycomb, seasonal fruit', allergens: 'dairy, tree nuts' },
  { ref: 'f_pot',     pos: 'BRKFST POTATOES', cat: 'cat_sides',     price: 800,
    menuName: 'Breakfast Potatoes',       desc: 'rosemary, garlic aioli', allergens: 'egg' },
  { ref: 'f_bacon',   pos: 'THICK BACON',     cat: 'cat_sides',     price: 700,
    menuName: 'Thick-Cut Bacon',          desc: '', allergens: '' },
  { ref: 'f_spritz',  pos: 'SPRITZ HOUSE',    cat: 'cat_cocktails', price: 1500,
    menuName: 'Parasol Spritz',           desc: 'aperol, cava, blood orange', allergens: '' },
  { ref: 'f_bloody',  pos: 'BLOODY',          cat: 'cat_cocktails', price: 1400,
    menuName: 'Bloody Mary',              desc: 'house mix, celery, everything salt', allergens: 'fish' },
  { ref: 'f_drip',    pos: 'DRIP',            cat: 'cat_coffee',    price: 500,
    menuName: 'Drip Coffee',              desc: 'rotating single origin', allergens: '' },
  // deliberately left unenriched — this is the auto-created stub case
  { ref: 'f_pea',     pos: 'SPRING PEA TST',  cat: 'cat_plates',    price: 1700,
    menuName: '', desc: '', allergens: '' },
];

const WINE = [
  { ref: 'w_cava',  pos: 'CAVA ROSE GLS', cat: 'cat_wine_btg', glass: 1600, bottle: 6200,
    menuName: 'Raventós i Blanc ‘de Nit Rosé’', desc: 'Xarel·lo, Macabeo · Conca del Riu Anoia, Spain', vintage: 2022, confirmed: '2026-06-02' },
  { ref: 'w_petnat', pos: 'PET NAT',      cat: 'cat_wine_btg', glass: 1700, bottle: 6600,
    menuName: 'Onward ‘Pétillant Naturel’',     desc: 'Malvasia Bianca · Suisun Valley, California', vintage: 2023, confirmed: '2026-08-01' },
  { ref: 'w_alba',  pos: 'ALBARINO',      cat: 'cat_wine_btg', glass: 1600, bottle: 6200,
    menuName: 'Zárate',                         desc: 'Albariño · Rías Baixas, Spain', vintage: 2023, confirmed: '2026-07-10' },
  { ref: 'w_chard', pos: 'CHARD SCM',     cat: 'cat_wine_btg', glass: 2400, bottle: 9600,
    menuName: 'Ceritas ‘Trout Gulch’',          desc: 'Chardonnay · Santa Cruz Mountains', vintage: 2021, confirmed: '2025-06-18' },
  { ref: 'w_ries',  pos: 'RIES DRY',      cat: 'cat_wine_btg', glass: 1500, bottle: 5800,
    menuName: 'Peter Lauer ‘Barrel X’',         desc: 'Riesling · Mosel, Germany', vintage: 2022, confirmed: '2026-04-02' },
  { ref: 'w_sanc',  pos: 'SANCERRE GLS',  cat: 'cat_wine_btg', glass: 2100, bottle: 8400,
    menuName: 'Domaine Vacheron',               desc: 'Sauvignon Blanc · Sancerre, France', vintage: 2022, confirmed: '2025-11-20' },
  { ref: 'w_rose',  pos: 'ROSE GLS',      cat: 'cat_wine_btg', glass: 1600, bottle: 6200,
    menuName: 'Tribute to Grace',               desc: 'Grenache Rosé · Santa Barbara County', vintage: 2023, confirmed: '2026-07-01' },
  { ref: 'w_skin',  pos: 'SKIN CONTACT',  cat: 'cat_wine_btg', glass: 1800, bottle: 7000,
    menuName: 'Ruth Lewandowski ‘Feints’',      desc: 'Arneis blend · Mendocino County', vintage: 2022, confirmed: '2026-03-04' },
  { ref: 'w_gamay', pos: 'GAMAY',         cat: 'cat_wine_btg', glass: 2200, bottle: 8800,
    menuName: 'Jean Foillard ‘Morgon Côte du Py’', desc: 'Gamay · Beaujolais, France', vintage: 2022, confirmed: '2026-05-11' },
  { ref: 'w_nebb',  pos: 'NEBB LANGHE',   cat: 'cat_wine_btg', glass: 1900, bottle: 7400,
    menuName: 'G.D. Vajra ‘Langhe’',            desc: 'Nebbiolo · Piedmont, Italy', vintage: 2022, confirmed: '2026-07-15' },
  { ref: 'w_pinot', pos: 'PINOT SONOMA',  cat: 'cat_wine_btg', glass: 2600, bottle: 10400,
    menuName: 'Hirsch Vineyards ‘San Andreas Fault’', desc: 'Pinot Noir · Sonoma Coast', vintage: 2021, confirmed: '2025-07-22' },
  { ref: 'w_cab',   pos: 'CAB SCM',       cat: 'cat_wine_btg', glass: 2500, bottle: 10000,
    menuName: 'Ridge ‘Estate’',                 desc: 'Cabernet Sauvignon · Santa Cruz Mountains', vintage: 2020, confirmed: '2025-09-30' },
  // bottle only, inventory tracked
  { ref: 'w_monte', pos: 'BTL MONTE BELLO', cat: 'cat_wine_btl', glass: null, bottle: 38500, track: true,
    menuName: 'Ridge ‘Monte Bello’',            desc: 'Cabernet blend · Santa Cruz Mountains', vintage: 2019, confirmed: '2026-06-01' },
  { ref: 'w_krug',  pos: 'BTL KRUG GC',    cat: 'cat_wine_btl', glass: null, bottle: 42500, track: true,
    menuName: 'Krug ‘Grande Cuvée’',            desc: 'Champagne blend · Reims, France', vintage: null, confirmed: '2026-08-10' },
  // the somm opened this at 5pm and nobody has written copy — the stub case
  { ref: 'w_mencia', pos: 'MENCIA',        cat: 'cat_wine_btg', glass: 1800, bottle: 7000,
    menuName: '', desc: '', vintage: null, confirmed: null },
];

/* things a real catalog is full of, which must never reach a guest */
const JUNK = [
  { ref: 'j_misc',    pos: 'MISC $1',        price: 100 },
  { ref: 'j_staff',   pos: 'STAFF MEAL',     price: 0 },
  { ref: 'j_gift',    pos: 'GIFT CARD',      price: 5000 },
  { ref: 'j_corkage', pos: 'CORKAGE',        price: 3000 },
  { ref: 'j_somm',    pos: 'SOMM POUR',      price: 0 },
  { ref: 'j_waste',   pos: 'BTG WASTE',      price: 0 },
];

/* ------------------------------------------------------------------ */

async function wipe() {
  console.log('Wiping previously seeded objects…');
  const q = new URLSearchParams({ types: 'ITEM,CATEGORY,CUSTOM_ATTRIBUTE_DEFINITION' });
  const { objects = [] } = await api(`/v2/catalog/list?${q}`);
  const ids = objects.map(o => o.id);
  if (!ids.length) return console.log('  nothing to wipe\n');
  for (let i = 0; i < ids.length; i += 200) {
    await api('/v2/catalog/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ object_ids: ids.slice(i, i + 200) }),
    });
  }
  console.log(`  deleted ${ids.length} objects\n`);
}

async function main() {
  const { locations = [] } = await api('/v2/locations');
  const loc = locations[0];
  if (!loc) throw new Error('No locations on this sandbox account.');
  console.log(`\nSeeding sandbox → ${loc.name}  (${loc.id})\n`);

  if (WIPE) await wipe();

  /* --- definitions --- */
  console.log('Creating custom attribute definitions…');
  const defIds = {};
  for (const d of DEFINITIONS) {
    try {
      const r = await api('/v2/catalog/object', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          object: {
            type: 'CUSTOM_ATTRIBUTE_DEFINITION',
            id: `#def_${d.key}`,
            custom_attribute_definition_data: {
              type: d.type,
              name: d.name,
              key: d.key,
              allowed_object_types: ['ITEM'],
              seller_visibility: 'SELLER_VISIBILITY_READ_WRITE_VALUES',
              app_visibility: 'APP_VISIBILITY_READ_WRITE_VALUES',
              ...(d.type === 'NUMBER' ? { number_config: { precision: 0 } } : {}),
              ...(d.type === 'STRING' ? { string_config: { enforce_uniqueness: false } } : {}),
            },
          },
        }),
      });
      defIds[d.key] = r.catalog_object.id;
      console.log(`  ✓ ${d.key}`);
    } catch (e) {
      console.log(`  ✗ ${d.key} — ${e.message.split('\n')[1]?.trim() || e.message}`);
      console.log('     (if this is the per-account cap, that is the finding — note it)');
    }
  }

  /* --- categories --- */
  console.log('\nCreating categories…');
  let catObjects = CATEGORIES.map(c => ({
    type: 'CATEGORY',
    id: `#${c.ref}`,
    category_data: {
      name: c.name,
      ...(c.menu ? { category_type: 'MENU_CATEGORY' } : {}),
    },
  }));
  let catRes;
  try {
    catRes = await upsert(catObjects);
  } catch (e) {
    // Square for Restaurants is not available in sandbox; MENU_CATEGORY may be rejected
    console.log('  MENU_CATEGORY rejected — retrying as plain categories.');
    console.log('  ⚠ Note this: the curation filter cannot be tested in sandbox and');
    console.log('    must be validated against the real account.');
    catObjects = catObjects.map(c => ({ ...c, category_data: { name: c.category_data.name } }));
    catRes = await upsert(catObjects);
  }
  const catId = {};
  for (const m of catRes.id_mappings || []) catId[m.client_object_id.replace('#', '')] = m.object_id;
  console.log(`  ✓ ${Object.keys(catId).length} categories`);

  /* --- items --- */
  const attrs = (map) => {
    const out = {};
    for (const [key, value] of Object.entries(map)) {
      if (value === null || value === undefined || value === '') continue;
      if (!defIds[key]) continue;
      out[key] = {
        key,
        custom_attribute_definition_id: defIds[key],
        ...(typeof value === 'number'
          ? { number_value: String(value) }
          : { string_value: String(value) }),
      };
    }
    return Object.keys(out).length ? { custom_attribute_values: out } : {};
  };

  console.log('\nCreating brunch items…');
  const foodObjects = FOOD.map(f => ({
    type: 'ITEM',
    id: `#${f.ref}`,
    present_at_all_locations: true,
    item_data: {
      name: f.pos,
      categories: catId[f.cat] ? [{ id: catId[f.cat] }] : [],
      variations: [variation(f.ref, 'Regular', f.price)],
    },
    ...attrs({ menu_name: f.menuName, menu_description: f.desc, allergens: f.allergens }),
  }));
  await upsert(foodObjects);
  console.log(`  ✓ ${FOOD.length} items  (1 deliberately left without copy)`);

  console.log('\nCreating wine…');
  const wineObjects = WINE.map(w => {
    const vs = [];
    if (w.glass) vs.push(variation(w.ref, 'Glass', w.glass));
    vs.push(variation(w.ref, 'Bottle', w.bottle,
      w.track ? { track_inventory: true, inventory_alert_type: 'LOW_QUANTITY' } : {}));
    return {
      type: 'ITEM',
      id: `#${w.ref}`,
      present_at_all_locations: true,
      item_data: {
        name: w.pos,
        categories: catId[w.cat] ? [{ id: catId[w.cat] }] : [],
        variations: vs,
      },
      ...attrs({
        menu_name: w.menuName, menu_description: w.desc,
        vintage: w.vintage, vintage_confirmed: w.confirmed,
      }),
    };
  });
  await upsert(wineObjects);
  const withBoth = WINE.filter(w => w.glass).length;
  console.log(`  ✓ ${WINE.length} wines  (${withBoth} with glass + bottle variations)`);

  console.log('\nCreating junk items to test the curation filter…');
  await upsert(JUNK.map(j => ({
    type: 'ITEM',
    id: `#${j.ref}`,
    present_at_all_locations: true,
    item_data: {
      name: j.pos,
      categories: catId['cat_ops'] ? [{ id: catId['cat_ops'] }] : [],
      variations: [variation(j.ref, 'Regular', j.price)],
    },
  })));
  console.log(`  ✓ ${JUNK.length} junk items`);

  console.log(`
──────────────────────────────────────────────────────────────────
Done.

  location id   ${loc.id}
  items         ${FOOD.length + WINE.length + JUNK.length}

Next:
  1. node inspect-catalog.mjs        — see it the way the pipeline will
  2. Open the Sandbox Seller Dashboard and 86 something, then re-run
     inspect to watch sold_out flip. That is the whole demo.
──────────────────────────────────────────────────────────────────
`);
}

main().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1); });
