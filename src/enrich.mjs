/**
 * enrich.mjs — the join, and the stub lifecycle.
 *
 * Square is canonical for anything that moves during service: price, category,
 * sold_out, stock. It is NOT the place menu language lives, because POS names
 * are written for a terminal button pressed four hundred times a night.
 *
 * Three layers, joined on catalog_object_id:
 *   1. Square catalog        — price, availability, category      (canonical)
 *   2. Square custom attrs   — menu_name, description, vintage    (seller edits)
 *   3. data/editorial.json   — producer, region, sort order, notes (we edit)
 *
 * When an item appears in the POS that we've never seen, we auto-create a stub
 * so nothing is silently dropped. The stub is visible to staff immediately and
 * held back from guests until someone writes the copy.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, publishing } from './config.mjs';

const EDITORIAL = join(ROOT, 'data', 'editorial.json');
const STUBS = join(ROOT, 'data', 'stubs.json');

const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

export const loadEditorial = () => read(EDITORIAL, { sections: {}, items: {} });
export const loadStubs = () => read(STUBS, {});

/** Pull the seller-editable values off a catalog item. */
export function squareAttrs(item) {
  const raw = item.custom_attribute_values || {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    // Square may namespace the map key; the inner `key` is authoritative.
    const key = v.key || k.split(':').pop();
    out[key] = v.string_value ?? v.number_value ?? v.boolean_value ?? null;
  }
  return out;
}

/**
 * Merge the three layers for one item. Precedence, deliberately:
 *   editorial  <  square custom attributes  <  square canonical fields
 * The restaurant's own edits beat ours; the catalog beats everything for
 * price and availability.
 */
export function joinLayers(item, editorial) {
  const attrs = squareAttrs(item);
  const ed = editorial.items[item.id] || {};
  const posName = item.item_data?.name || '';

  /* Presentation layer precedence. Canonical fields below are untouched by
     this — Square always wins on price, availability and vintage. */
  const repoWins = publishing.copyOwner !== 'square';
  const pickCopy = (fromSquare, fromRepo) => {
    const sqv = (fromSquare || '').trim();
    const repov = (fromRepo || '').trim();
    const value = repoWins ? (repov || sqv) : (sqv || repov);
    const from = !value ? 'none'
      : repoWins ? (repov ? 'repo' : 'square')
      : (sqv ? 'square' : 'repo');
    return { value, from };
  };

  const name = pickCopy(attrs.menu_name, ed.menu_name);
  const desc = pickCopy(attrs.menu_description, ed.description);
  const allerg = pickCopy(attrs.allergens, ed.allergens);
  const menuName = name.value;

  return {
    id: item.id,
    posName,
    menuName,
    description: desc.value,
    allergens: allerg.value,

    /* Which layer supplied the words, so the studio can say so instead of
       leaving you typing into a field that loses. */
    copyFrom: name.from,
    squareHasName: !!(attrs.menu_name || '').trim(),

    // wine fields — vintage lives in Square because it rolls without warning
    vintage: attrs.vintage != null ? Number(attrs.vintage) : (ed.vintage ?? null),
    vintageConfirmed: attrs.vintage_confirmed || ed.vintage_confirmed || null,
    producer: ed.producer || '',
    cuvee: ed.cuvee || '',
    grape: ed.grape || '',
    region: ed.region || '',
    importer: ed.importer || '',

    // service-only — never rendered to guests
    serviceNote: ed.service_note || '',
    pairing: ed.pairing || '',

    sortIndex: ed.sort_index ?? 999,

    /* A stub is an item the POS knows about and the menu does not.
       This is the flag every downstream publishing rule keys off. */
    needsReview: !menuName,
  };
}

/**
 * Auto-create stub records for catalog ids we've never seen. Returns the ids
 * that were new this run, so the sync log can report them.
 */
export function reconcileStubs(items, editorial) {
  const stubs = loadStubs();
  const known = new Set([...Object.keys(editorial.items), ...Object.keys(stubs)]);
  const fresh = [];

  for (const item of items) {
    if (known.has(item.id)) continue;
    const attrs = squareAttrs(item);
    if (attrs.menu_name) continue;      // seller already wrote copy in Square
    stubs[item.id] = {
      pos_name: item.item_data?.name || '',
      first_seen: new Date().toISOString(),
      needs_review: true,
      menu_name: '',
      description: '',
      note: 'Auto-created from the POS. Fill in menu_name to publish to guests.',
    };
    fresh.push(item.id);
  }

  // Drop stubs for items that have since been given copy, or deleted.
  const liveIds = new Set(items.map(i => i.id));
  for (const id of Object.keys(stubs)) {
    const stillStub = liveIds.has(id) && !editorial.items[id]?.menu_name;
    if (!stillStub) delete stubs[id];
  }

  write(STUBS, stubs);
  return { stubs, fresh };
}

/** Months since a vintage was last confirmed. null when never confirmed. */
export function vintageAgeMonths(confirmed) {
  if (!confirmed) return null;
  const then = new Date(confirmed);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44)));
}
