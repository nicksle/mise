#!/usr/bin/env node
/**
 * make-mock-menu.mjs — regenerate the mock drink program.
 *
 *   node scripts/make-mock-menu.mjs
 *
 * One source of truth for two files, so they cannot drift:
 *   scripts/mock-catalog.json   what the fake POS serves (ugly names, prices,
 *                               variations, sold_out, custom attributes)
 *   data/editorial.json         the repo layer (producer, region, sort order,
 *                               service notes)
 *
 * Edit DRINKS below and re-run to change the list.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOC = 'LMOCKPARASOL';

/* ------------------------------------------------------------------ *
 * The list. `pos` is deliberately ugly — that is what a terminal
 * button looks like. Everything readable is enrichment.
 * ------------------------------------------------------------------ */

const SECTIONS = [
  // drinks
  'Sparkling', 'White', 'Rosé', 'Chilled Red', 'Red',
  'Cocktails', 'Mocktails', 'Beer & Cider', 'Amaro & Digestif',
  // food
  'Brunch', 'Plates', 'Sides', 'Sweet', 'Coffee',
  // its own category, because happy hour is separate items in the POS
  'Happy Hour',
];

/* Guest-facing label where the POS name is written for a terminal instead of
   a menu. The category stays findable at speed; the guest gets the good word. */
const SECTION_NAMES = {
  'Mocktails': 'Sober curious',
  'Amaro & Digestif': 'After',
};

/* wines: glass + bottle variations, vintage in Square */
const WINE = [
  // --- Sparkling ---
  { id:'CAVA',    pos:'CAVA ROSE GLS',  sec:'Sparkling', g:1600, b:6200, vintage:2022, conf:'2026-06-02',
    producer:'Raventós i Blanc', cuvee:'de Nit Rosé', grape:'Xarel·lo, Macabeo, Monastrell',
    region:'Conca del Riu Anoia, Spain', importer:'Skurnik', sort:0,
    note:'Bone dry, high acid. The opener for anyone who says "nothing too sweet".' },
  { id:'PETNAT',  pos:'PET NAT',        sec:'Sparkling', g:1700, b:6600, vintage:2023, conf:'2026-08-01',
    producer:'Onward', cuvee:'Pétillant Naturel', grape:'Malvasia Bianca',
    region:'Suisun Valley, California', importer:'direct', sort:1,
    note:'Cloudy on purpose — say so before you pour. Low ABV, slight funk, crowd-splitter.' },
  { id:'CHAMP',   pos:'CHAMP GROWER',   sec:'Sparkling', g:2600, b:12500, vintage:null, conf:'2026-07-20',
    producer:'Chartogne-Taillet', cuvee:'Sainte Anne', grape:'Chardonnay, Pinot Noir, Meunier',
    region:'Champagne, France', importer:'Terrell', sort:2,
    note:'Grower Champagne, not a big house. Worth the upsell from the cava — say "same family farms it".' },
  { id:'MOVIA',   pos:'BTL MOVIA PURO', sec:'Sparkling', g:null, b:9600, vintage:2019, conf:'2026-05-14', stock:3,
    producer:'Movia', cuvee:'Puro Rosé', grape:'Pinot Noir', region:'Brda, Slovenia',
    importer:'Blue Danube', sort:3,
    note:'Disgorged at the table, upside down, in a bucket. Twenty minutes of theatre — only offer it if you have time.' },

  // --- White ---
  { id:'ALBA',    pos:'ALBARINO',       sec:'White', g:1600, b:6200, vintage:2023, conf:'2026-07-10',
    producer:'Zárate', grape:'Albariño', region:'Rías Baixas, Spain', importer:'De Maison', sort:0,
    note:'Saline and briny. Sell it with anything from the sea.' },
  { id:'RIES',    pos:'RIES DRY',       sec:'White', g:1500, b:5800, vintage:2022, conf:'2026-04-02',
    producer:'Peter Lauer', cuvee:'Barrel X', grape:'Riesling', region:'Mosel, Germany',
    importer:'Vom Boden', sort:1,
    note:'Off-dry but reads dry. Best thing on the list for anything spicy.' },
  { id:'MASSICAN',pos:'FRIULANO BLEND', sec:'White', g:1900, b:7400, vintage:2023, conf:'2026-06-28',
    producer:'Massican', cuvee:'Annia', grape:'Tocai Friulano, Ribolla Gialla, Chardonnay',
    region:'Napa Valley', importer:'direct', sort:2,
    note:'Napa making Italian whites. The answer for a table that cannot agree.' },
  { id:'SANC',    pos:'SANCERRE GLS',   sec:'White', g:2100, b:8400, vintage:2022, conf:'2025-11-20',
    producer:'Domaine Vacheron', grape:'Sauvignon Blanc', region:'Sancerre, France',
    importer:'Kermit Lynch', sort:3,
    note:'Benchmark Sancerre, biodynamic. Vintage rolled in June — confirm before you quote it.' },
  { id:'CHARD',   pos:'CHARD SCM',      sec:'White', g:2400, b:9600, vintage:2021, conf:'2025-06-18',
    producer:'Ceritas', cuvee:'Trout Gulch', grape:'Chardonnay', region:'Santa Cruz Mountains',
    importer:'direct', sort:4,
    note:'No new oak. Lead with "not a buttery Chardonnay" — it heads off the objection.' },
  { id:'SKIN',    pos:'SKIN CONTACT',   sec:'White', g:1800, b:7000, vintage:2022, conf:'2026-03-04',
    producer:'Ruth Lewandowski', cuvee:'Feints', grape:'Arneis blend, skin contact',
    region:'Mendocino County', importer:'Jenny & François', sort:5,
    note:'Orange wine — tannic for a white. Always offer a taste first. It splits the room.' },

  // --- Rosé ---
  { id:'ROSE',    pos:'ROSE GLS',       sec:'Rosé', g:1600, b:6200, vintage:2023, conf:'2026-07-01',
    producer:'Tribute to Grace', grape:'Grenache', region:'Santa Barbara County',
    importer:'direct', sort:0,
    note:'Pale, bone dry, high-altitude fruit. The default pour on a warm afternoon.' },
  { id:'LIEUDIT', pos:'ROSE CAB FRANC', sec:'Rosé', g:1500, b:5800, vintage:2023, conf:'2026-06-11',
    producer:'Lieu Dit', grape:'Cabernet Franc', region:'Santa Ynez Valley',
    importer:'direct', sort:1,
    note:'Herbal, a little savoury. For someone who thinks they dislike rosé.' },
  { id:'BANDOL',  pos:'BANDOL ROSE',    sec:'Rosé', g:2400, b:9600, vintage:2023, conf:'2026-05-30',
    producer:'Domaine Tempier', grape:'Mourvèdre, Grenache, Cinsault', region:'Bandol, France',
    importer:'Kermit Lynch', sort:2,
    note:'The serious one. Structured enough for the chicken. Worth the price, and say why.' },

  // --- Chilled Red ---
  { id:'GAMAY',   pos:'GAMAY',          sec:'Chilled Red', g:2200, b:8800, vintage:2022, conf:'2026-05-11',
    producer:'Jean Foillard', cuvee:'Morgon Côte du Py', grape:'Gamay', region:'Beaujolais, France',
    importer:'Kermit Lynch', sort:0,
    note:'Cru Beaujolais, served with a chill. The gateway red — it converts white drinkers.' },
  { id:'STOUMEN', pos:'POST FLIRT',     sec:'Chilled Red', g:1700, b:6600, vintage:2023, conf:'2026-07-25',
    producer:'Martha Stoumen', cuvee:'Post Flirtation', grape:'Zinfandel, Petite Sirah',
    region:'Mendocino County', importer:'direct', sort:1,
    note:'Juicy, low tannin, drinks like a grown-up soda. Best value red on the list.' },
  { id:'BOWARROW',pos:'RHINESTONES',    sec:'Chilled Red', g:1800, b:7000, vintage:2023, conf:'2026-06-19',
    producer:'Bow & Arrow', cuvee:'Rhinestones', grape:'Gamay Noir, Pinot Noir',
    region:'Willamette Valley, Oregon', importer:'direct', sort:2,
    note:'Loire methods in Oregon. Serve it properly cold, not cellar temp.' },

  // --- Red ---
  { id:'MENCIA',  pos:'MENCIA',         sec:'Red', g:1800, b:7000, vintage:2022, conf:'2026-07-08',
    producer:'Envínate', cuvee:'Lousas Viñas de Aldea', grape:'Mencía', region:'Ribeira Sacra, Spain',
    importer:'José Pastor', sort:0,
    note:'Volcanic, high acid, almost no oak. Serve with a slight chill.' },
  { id:'NEBB',    pos:'NEBB LANGHE',    sec:'Red', g:1900, b:7400, vintage:2022, conf:'2026-07-15',
    producer:'G.D. Vajra', cuvee:'Langhe', grape:'Nebbiolo', region:'Piedmont, Italy',
    importer:'Rare Wine Co.', sort:1,
    note:'Rose petal and tar, grippy. For the Pinot drinker who wants more.' },
  { id:'PINOT',   pos:'PINOT SONOMA',   sec:'Red', g:2600, b:10400, vintage:2021, conf:'2025-07-22',
    producer:'Hirsch Vineyards', cuvee:'San Andreas Fault', grape:'Pinot Noir',
    region:'Sonoma Coast', importer:'direct', sort:2,
    note:'Highest-margin pour on the list. Vintage rolled — confirm before quoting.' },
  { id:'CAB',     pos:'CAB SCM',        sec:'Red', g:2500, b:10000, vintage:2020, conf:'2025-09-30',
    producer:'Ridge', cuvee:'Estate', grape:'Cabernet Sauvignon', region:'Santa Cruz Mountains',
    importer:'direct', sort:3,
    note:'Needs air. Decant it if the table is staying for dinner.' },
  { id:'MONTE',   pos:'BTL MONTE BELLO',sec:'Red', g:null, b:38500, vintage:2019, conf:'2026-06-01', stock:2,
    producer:'Ridge', cuvee:'Monte Bello', grape:'Cabernet blend', region:'Santa Cruz Mountains',
    importer:'direct', sort:4,
    note:'Two left. Manager approval before opening. Decant a full hour.' },

  /* opened at 5pm, nobody has written copy — the stub case */
  { id:'NEWPOUR', pos:'TROUSSEAU',      sec:'Chilled Red', g:1900, b:7400, stub:true, sort:3 },
];

/* everything else: one price, no vintage */
const POURS = [
  // --- Cocktails ---
  /* One object, two categories — this is how a single catalog item reaches
     two menus without being duplicated. */
  { id:'SPRITZ',  pos:'SPRITZ HOUSE',  sec:['Cocktails','Happy Hour'], price:1500, sort:0,
    name:'Parasol Spritz', desc:'Aperol, cava, blood orange, soda',
    note:'Build in the glass, no shake. House aperitif — offer it first.' },
  { id:'PALOMA',  pos:'PALOMA',        sec:'Cocktails', price:1600, sort:1,
    name:'Paloma Fresca', desc:'Tequila blanco, grapefruit, lime, salt',
    note:'Fresh grapefruit, not soda. Salt the rim unless they say no.' },
  { id:'GARDEN',  pos:'GARDEN VAR',    sec:'Cocktails', price:1600, sort:2,
    name:'Garden Variety', desc:'Gin, cucumber, dill, lime, soda',
    note:'Low ABV, very drinkable at brunch. Dill is fresh, not syrup.' },
  { id:'FIZZ',    pos:'FLORE FIZZ',    sec:'Cocktails', price:1600, sort:3,
    name:'Flore Fizz', desc:'Vodka, strawberry, lemon, prosecco',
    note:'Named for the room. Strawberry is macerated in-house, changes with the season.' },
  { id:'SOUR',    pos:'MKT ST SOUR',   sec:'Cocktails', price:1700, sort:4,
    name:'Market Street Sour', desc:'Rye, lemon, egg white, Angostura',
    note:'Contains raw egg white — flag it. Can be made without, ask for a "dry sour".' },
  { id:'ESPMART', pos:'ESPRESSO MRTN', sec:'Cocktails', price:1600, sort:5,
    name:'Espresso Martini', desc:'Vodka, cold brew, demerara',
    note:'Caffeine — do not sell it to a 9pm table without saying so.' },
  { id:'BLOODY',  pos:'BLOODY',        sec:'Cocktails', price:1400, sort:6,
    name:'Bloody Mary', desc:'House mix, celery, everything salt',
    note:'House mix has Worcestershire — contains anchovy. Not vegetarian.' },
  { id:'MIMOSA',  pos:'MIMOSA CARAFE', sec:'Cocktails', price:3200, sort:7,
    name:'Mimosa Carafe', desc:'Cava, seasonal juice — serves two',
    note:'Juice rotates. Ask the bar what is on before you promise anything.' },

  // --- Mocktails ---
  { id:'GARDEN0', pos:'SEEDLIP SPRITZ', sec:'Mocktails', price:1200, sort:0,
    name:'Garden Spritz', desc:'Seedlip Garden 108, cucumber, tonic',
    note:'The best N/A option. Serve it in the same glass as the real spritz — it matters.' },
  { id:'GHIA',    pos:'GHIA SODA',      sec:'Mocktails', price:1200, sort:1,
    name:'Bitter Orange', desc:'Ghia, soda, orange twist',
    note:'Properly bitter. For someone who misses an aperitivo.' },
  { id:'SHRUB',   pos:'SHRUB SODA',     sec:'Mocktails', price:1100, sort:2,
    name:'Strawberry Shrub', desc:'House shrub, lime, soda',
    note:'Shrub is made weekly. Sweet-tart, the one kids order.' },
  { id:'COCONUT', pos:'COCO COLD BREW', sec:'Mocktails', price:1000, sort:3,
    name:'Coconut Cold Brew', desc:'Cold brew, coconut, vanilla',
    note:'Contains coconut. Vegan as made.' },

  // --- Beer & Cider ---
  { id:'KSA',     pos:'FT PT KSA',      sec:'Beer & Cider', price:800, sort:0,
    name:'Fort Point ‘KSA’', desc:'Kölsch-style ale · San Francisco',
    note:'The house beer. Light, safe, always moving.' },
  { id:'PILS',    pos:'TRUMER',         sec:'Beer & Cider', price:800, sort:1,
    name:'Trumer Pils', desc:'Pilsner · Berkeley, California',
    note:'Brewed in Berkeley to an Austrian recipe. Very dry.' },
  { id:'IPA',     pos:'PLINY',          sec:'Beer & Cider', price:1200, sort:2,
    name:'Russian River ‘Pliny the Elder’', desc:'Double IPA · Santa Rosa, California',
    note:'8% — mention it. Allocation is limited, check before promising a second.' },
  { id:'CIDER',   pos:'MIGHTY DRY',     sec:'Beer & Cider', price:1000, sort:3,
    name:'Golden State ‘Mighty Dry’', desc:'Cider · Newcastle, California',
    note:'Naturally gluten-free — the answer for a coeliac table.' },

  // --- Amaro & Digestif ---
  { id:'NONINO',  pos:'NONINO',         sec:'Amaro & Digestif', price:1400, sort:0,
    name:'Amaro Nonino', desc:'Friuli, Italy',
    note:'Gentle, orange-peel sweet. The one to start someone on.' },
  { id:'FERNET',  pos:'FERNET',         sec:'Amaro & Digestif', price:1200, sort:1,
    name:'Fernet-Branca', desc:'Milan, Italy',
    note:'This is San Francisco. Serve it cold, no ceremony.' },
  { id:'CARDA',   pos:'CARDAMARO',      sec:'Amaro & Digestif', price:1200, sort:2,
    name:'Cardamaro', desc:'Piedmont, Italy',
    note:'Wine-based, low ABV, cardoon and thistle. Good before dinner, not only after.' },
  { id:'BRAULIO', pos:'BRAULIO',        sec:'Amaro & Digestif', price:1300, sort:3,
    name:'Braulio', desc:'Valtellina, Italy',
    note:'Alpine, minty, almost medicinal. Sell it after something rich.' },
];

/* food and happy hour — one price, no vintage */
const FOOD = [
  // --- Brunch ---
  { id:'CITRUS',  pos:'CITRUS OO',      sec:'Brunch', price:900,  sort:0,
    name:'Citrus, olive oil, sea salt', desc:'Whatever is best that week, cut thick',
    note:'Fruit rotates weekly — ask the kitchen before you describe it.' },
  { id:'YOGHURT', pos:'YOG DATE',       sec:'Brunch', price:1100, sort:1,
    name:'Yoghurt, date, sesame', desc:'Sheep’s milk, honey, toasted sesame',
    note:'Contains sesame and honey. Not vegan.' },
  { id:'BREAD',   pos:'BREAD BUTTER',   sec:'Brunch', price:700,  sort:2,
    name:'The good bread, cultured butter', desc:'While it lasts',
    note:'Baked next door. Genuinely runs out — do not promise it after 1pm.' },
  { id:'EGGSPAN', pos:'EGGS PAN',       sec:'Brunch', price:1800, sort:3,
    name:'Eggs in the pan, harissa, herbs', desc:'Two eggs, house harissa, flatbread',
    note:'Harissa is properly hot. Warn anyone who asks for mild.' },
  { id:'POTATO',  pos:'FRIED POT',      sec:'Brunch', price:1200, sort:4,
    name:'Fried potatoes, aioli, lemon', desc:'Twice-cooked, garlic aioli',
    note:'Aioli has raw egg. The default side, sells with everything.' },
  { id:'OMELETTE',pos:'OMELETTE',       sec:'Brunch', price:1900, sort:5,
    name:'Omelette, greens, aged sheep', desc:'Folded soft, chard, aged pecorino',
    note:'Cooked to order and slow. Say so on a full room.' },

  // --- Plates (dinner) ---
  { id:'CHICORY', pos:'CHIC ANCHOV',    sec:'Plates', price:1600, sort:0,
    name:'Chicories, anchovy, egg', desc:'Bitter leaves, anchovy dressing, jammy egg',
    note:'Contains anchovy — not vegetarian, and people always assume it is.' },
  { id:'SQUASH',  pos:'SQUASH YOG',     sec:'Plates', price:1500, sort:1,
    name:'Squash, yoghurt, chilli', desc:'Roasted over coals, chilli oil',
    note:'Vegetarian. Can be made vegan without the yoghurt.' },
  { id:'FISH',    pos:'WHOLE FISH MP',  sec:'Plates', price:4200, sort:2,
    name:'Whole fish, herbs, lemon', desc:'Whatever came in that morning',
    note:'Price moves with the market — check the board before quoting it.' },
  { id:'LAMB',    pos:'LAMB COALS',     sec:'Plates', price:4600, sort:3,
    name:'Lamb over coals, for the table', desc:'Shoulder, forty minutes, serves two to three',
    note:'Fire it early. Forty minutes means forty minutes.' },
  { id:'LEEKS',   pos:'LEEKS ROMESCO',  sec:'Plates', price:1700, sort:4,
    name:'Burnt leeks, romesco', desc:'Charred whole, almond romesco',
    note:'Contains almonds. Vegan as made.' },
  { id:'BEANS',   pos:'BEANS',          sec:'Sides', price:1400, sort:0,
    name:'Beans cooked all afternoon', desc:'Gigantes, olive oil, rosemary',
    note:'The thing to add when a table is still hungry.' },
  { id:'GREENS',  pos:'GREENS SIDE',    sec:'Sides', price:1100, sort:1,
    name:'Greens, garlic, chilli', desc:'Whatever is in season, hard and fast',
    note:'Vegan. The fastest thing on the pass.' },

  // --- Sweet ---
  { id:'OOCAKE',  pos:'OO CAKE',        sec:'Sweet', price:1200, sort:0,
    name:'Olive oil cake', desc:'Citrus, crème fraîche',
    note:'Made daily. The one dessert that never comes back.' },
  { id:'CHEESE',  pos:'CHEESE ONE',     sec:'Sweet', price:1400, sort:1,
    name:'Cheese, one kind, good', desc:'Ask what is on',
    note:'One cheese, chosen weekly. Know it before service.' },

  // --- Coffee ---
  { id:'COFFEE',  pos:'COFFEE',         sec:'Coffee', price:500,  sort:0,
    name:'Coffee', desc:'Filter, roasted in Oakland',
    note:'Refills are free. Nobody mentions it and they should.' },
  { id:'CORTADO', pos:'CORTADO',        sec:'Coffee', price:550,  sort:1,
    name:'Cortado', desc:'Double, equal milk',
    note:'The staff drink. Fast to make on a slammed brunch.' },
  { id:'COLDBREW',pos:'COLD BREW',      sec:'Coffee', price:600,  sort:2,
    name:'Cold brew, orange peel', desc:'Steeped overnight, orange oil',
    note:'Strong. Two is a lot.' },

  // --- Happy Hour: separate POS items, deliberately duplicating the real ones.
  //     `twinOf` is the link Square has no way to record. ---
  { id:'HHOYST',  pos:'HH OYSTERS',     sec:'Happy Hour', price:200,  sort:0,
    name:'Oysters', desc:'Half price until six, each',
    note:'Counter only. Cut off at six sharp, the kitchen counts them.' },
  { id:'HHANCH',  pos:'HH ANCHOVY',     sec:'Happy Hour', price:900,  sort:1,
    name:'Anchovy, butter, toast', desc:'Cantabrian, on the good bread',
    note:'Three to a plate. Contains fish and dairy.' },
  { id:'HHOLIVE', pos:'HH OLIVES',      sec:'Happy Hour', price:600,  sort:2,
    name:'Olives, warm, orange peel', desc:'Castelvetrano, warmed in oil',
    note:'Pits in. Say so before you put them down.' },
  { id:'HHSANC',  pos:'HH SANCERRE',    sec:'Happy Hour', price:1400, sort:3,
    twinOf:'SANC', name:'Sancerre, by the glass', desc:'Happy hour pour',
    note:'Same bottle as the list — if the pour dies, this dies with it.' },
  { id:'HHSPRITZ',pos:'HH SPRITZ',      sec:'Happy Hour', price:1100, sort:4,
    twinOf:'SPRITZ', name:'Parasol Spritz', desc:'Happy hour price',
    note:'Same build as the full-price one. Do not make it smaller.' },
];

/* what a real catalog is also full of — never reaches a guest */
const JUNK = [
  ['MISC $1', 100], ['STAFF DRINK', 0], ['GIFT CARD', 5000], ['CORKAGE', 3000],
  ['SOMM POUR', 0], ['BTG WASTE', 0], ['BAR COMP', 0], ['WINE CLUB SHIP', 0],
];

/* ------------------------------------------------------------------ */

const objects = [], counts = {}, editorial = { sections: {}, items: {} };
const ATTR_KEYS = ['menu_name', 'menu_description', 'allergens', 'vintage', 'vintage_confirmed'];

for (const k of ATTR_KEYS) objects.push({
  type: 'CUSTOM_ATTRIBUTE_DEFINITION', id: 'DEF_' + k,
  custom_attribute_definition_data: {
    key: k, name: k, type: k === 'vintage' ? 'NUMBER' : 'STRING',
    allowed_object_types: ['ITEM'], seller_visibility: 'SELLER_VISIBILITY_READ_WRITE_VALUES',
  },
});

SECTIONS.forEach((name, i) => {
  objects.push({ type: 'CATEGORY', id: 'MOCK_CAT_' + i,
    category_data: { name, category_type: 'MENU_CATEGORY' } });
  editorial.sections[name] = { sort_index: i,
    ...(SECTION_NAMES[name] ? { name: SECTION_NAMES[name] } : {}) };
});
const catId = name => 'MOCK_CAT_' + SECTIONS.indexOf(name);
/* `sec` may be a list: an item can sit in more than one category, which is how
   one catalog object reaches two menus without being duplicated. */
const catRefs = sec => (Array.isArray(sec) ? sec : [sec]).map(n => ({ id: catId(n) }));

const attrs = map => {
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    if (v === null || v === undefined || v === '') continue;
    out[k] = { key: k, custom_attribute_definition_id: 'DEF_' + k,
      ...(typeof v === 'number' ? { number_value: String(v) } : { string_value: String(v) }) };
  }
  return Object.keys(out).length ? { custom_attribute_values: out } : {};
};

const variation = (id, name, amount, track) => {
  const vid = `${id}_${name.toUpperCase()}`;
  return { type: 'ITEM_VARIATION', id: vid, item_variation_data: {
    item_id: id, name, pricing_type: 'FIXED_PRICING',
    price_money: { amount, currency: 'USD' },
    ...(track ? { track_inventory: true } : {}),
    location_overrides: [{ location_id: LOC, sold_out: false }] } };
};

for (const w of WINE) {
  const id = 'MOCK_' + w.id;
  const vars = [];
  if (w.g) vars.push(variation(id, 'Glass', w.g));
  vars.push(variation(id, 'Bottle', w.b, !!w.stock));
  if (w.stock) counts[`${id}_BOTTLE`] = w.stock;

  objects.push({ type: 'ITEM', id, item_data: {
    name: w.pos, kitchen_name: w.pos,
    categories: catRefs(w.sec), variations: vars },
    ...(w.stub ? {} : attrs({
      menu_name: `${w.producer}${w.cuvee ? ` ‘${w.cuvee}’` : ''}`,
      vintage: w.vintage, vintage_confirmed: w.conf })) });

  if (!w.stub) editorial.items[id] = {
    producer: w.producer, ...(w.cuvee ? { cuvee: w.cuvee } : {}),
    grape: w.grape, region: w.region, importer: w.importer,
    sort_index: w.sort, service_note: w.note };
}

for (const d of [...POURS, ...FOOD]) {
  const id = 'MOCK_' + d.id;
  objects.push({ type: 'ITEM', id, item_data: {
    name: d.pos, kitchen_name: d.pos,
    categories: catRefs(d.sec),
    variations: [variation(id, 'Regular', d.price)] },
    ...attrs({ menu_name: d.name, menu_description: d.desc }) });
  editorial.items[id] = { sort_index: d.sort, service_note: d.note,
    ...(d.twinOf ? { twin_of: 'MOCK_' + d.twinOf } : {}) };
}

const opsCat = 'MOCK_CAT_OPS';
objects.push({ type: 'CATEGORY', id: opsCat, category_data: { name: 'Operations' } });
JUNK.forEach(([pos, price], i) => {
  const id = 'MOCK_JUNK_' + i;
  objects.push({ type: 'ITEM', id, item_data: {
    name: pos, categories: [{ id: opsCat }],
    variations: [variation(id, 'Regular', price)] } });
});

editorial._comment = 'Generated by scripts/make-mock-menu.mjs. For a real Square account, ' +
  'run `npm run inspect` to get the true catalog_object_ids and re-key these entries.';

writeFileSync(join(ROOT, 'scripts', 'mock-catalog.json'),
  JSON.stringify({ objects, counts }, null, 2) + '\n');
writeFileSync(join(ROOT, 'data', 'editorial.json'),
  JSON.stringify(editorial, null, 2) + '\n');

const items = objects.filter(o => o.type === 'ITEM');
console.log(`
  wrote scripts/mock-catalog.json and data/editorial.json

    ${SECTIONS.length} sections   ${SECTIONS.join(' · ')}
    ${WINE.length} wines        ${WINE.filter(w => w.g).length} by the glass, ${WINE.filter(w => !w.g).length} bottle only
    ${POURS.length} other pours  cocktails, mocktails, beer, amaro
    ${FOOD.length} food items   brunch, plates, sides, sweet, coffee, happy hour
    ${FOOD.filter(f => f.twinOf).length} HH twins     linked with twin_of — Square cannot record this
    ${JUNK.length} junk items   to prove the curation filter works
    1 stub          TROUSSEAU, no copy — held back from guests
    ${items.length} items total
`);
