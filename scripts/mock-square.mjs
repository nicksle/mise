#!/usr/bin/env node
/**
 * mock-square.mjs — a local stand-in for Square's Catalog API.
 *
 * Exists so the whole pipeline runs with no Square account at all. It speaks
 * enough of the real API shape (items, variations, categories, custom attribute
 * values, location_overrides.sold_out, inventory counts) that swapping in a
 * real sandbox token changes nothing but the base URL.
 *
 *   node scripts/mock-square.mjs
 *
 * Extras for demoing, which the real API obviously does not have:
 *   POST /_mock/86/:posName      toggle an item sold out
 *   POST /_mock/add              add a new item with no copy (the stub case)
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = join(HERE, 'mock-catalog.json');
const PORT = Number(process.env.MOCK_PORT || 8789);

const LOCATION = { id: 'LMOCKPARASOL', name: 'Parasol', status: 'ACTIVE',
  address: { address_line_1: '2298 Market St', locality: 'San Francisco' } };

/* mock-catalog.json is a fixture, not a database. State lives in memory so
   every run starts identical and `npm run demo` is reproducible. Set
   MOCK_PERSIST=1 if you want changes to survive a restart. */
let db = existsSync(SEED)
  ? JSON.parse(readFileSync(SEED, 'utf8'))
  : { objects: [], counts: {} };

const persist = () => {
  if (process.env.MOCK_PERSIST === '1') writeFileSync(SEED, JSON.stringify(db, null, 2) + '\n');
};
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : {};

    if (url.pathname === '/v2/locations') return json(res, 200, { locations: [LOCATION] });

    if (url.pathname === '/v2/catalog/list') {
      const types = (url.searchParams.get('types') || '').split(',').filter(Boolean);
      const objects = types.length ? db.objects.filter(o => types.includes(o.type)) : db.objects;
      return json(res, 200, { objects });
    }

    if (url.pathname === '/v2/catalog/search') {
      const types = body.object_types || [];
      const objects = types.length ? db.objects.filter(o => types.includes(o.type)) : db.objects;
      return json(res, 200, { objects, latest_time: new Date().toISOString() });
    }

    if (url.pathname === '/v2/inventory/counts/batch-retrieve') {
      const ids = body.catalog_object_ids || [];
      const counts = ids.filter(id => db.counts[id] != null).map(id => ({
        catalog_object_id: id, state: 'IN_STOCK',
        quantity: String(db.counts[id]), location_id: LOCATION.id,
      }));
      return json(res, 200, { counts });
    }

    /* ---- demo helpers ---- */

    if (url.pathname.startsWith('/_mock/86/')) {
      const target = decodeURIComponent(url.pathname.split('/_mock/86/')[1]).toUpperCase();
      const which = (url.searchParams.get('variation') || '').toLowerCase();
      let hit = null;
      for (const o of db.objects) {
        if (o.type !== 'ITEM' || (o.item_data?.name || '').toUpperCase() !== target) continue;
        for (const v of o.item_data.variations || []) {
          const vn = (v.item_variation_data?.name || '').toLowerCase();
          if (which && vn !== which) continue;
          const ov = v.item_variation_data.location_overrides ||= [
            { location_id: LOCATION.id, sold_out: false }];
          const row = ov.find(x => x.location_id === LOCATION.id) || ov[0];
          row.sold_out = !row.sold_out;
          hit = { item: target, variation: v.item_variation_data.name, sold_out: row.sold_out };
        }
      }
      if (!hit) return json(res, 404, { errors: [{ code: 'NOT_FOUND', detail: target }] });
      persist();
      return json(res, 200, hit);
    }

    if (url.pathname === '/_mock/add') {
      const id = 'MOCK_NEW_' + Math.random().toString(36).slice(2, 8).toUpperCase();
      db.objects.push({
        type: 'ITEM', id,
        item_data: {
          name: body.name || 'NEW ITEM',
          categories: [{ id: body.category_id || 'MOCK_CAT_PLATES' }],
          variations: [{
            type: 'ITEM_VARIATION', id: id + '_V1',
            item_variation_data: {
              item_id: id, name: 'Regular', pricing_type: 'FIXED_PRICING',
              price_money: { amount: body.amount || 1700, currency: 'USD' },
              location_overrides: [{ location_id: LOCATION.id, sold_out: false }],
            },
          }],
        },
      });
      persist();
      return json(res, 200, { id, name: body.name });
    }

    json(res, 404, { errors: [{ code: 'NOT_FOUND', detail: url.pathname }] });
  });
}).listen(PORT, () => {
  console.log(`  mock Square listening on http://127.0.0.1:${PORT}`);
  console.log(`  ${db.objects.filter(o => o.type === 'ITEM').length} items loaded\n`);
}).on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use — another mock server is running.`);
    console.error(`  Stop it first:  pkill -f mock-square.mjs\n`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
