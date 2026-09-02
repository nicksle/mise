#!/usr/bin/env node
/**
 * build.mjs — render every output from out/menu.json.
 *
 * Renderers read the model and nothing else, so if sync.mjs is correct these
 * cannot publish something wrong.
 *
 * Menus are compositions, so most outputs are rendered PER MENU: a guest page,
 * a print draft and a JSON-LD block each. The service reference is deliberately
 * NOT split — a server mid-shift wants one searchable document, not four tabs.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, restaurant } from './config.mjs';
import { loadMenu, page, esc, PARASOL_CSS } from './render/shared.mjs';
import { renderGuest } from './render/guest.mjs';
import { renderService } from './render/service.mjs';
import { renderPrint } from './render/print.mjs';
import { renderJsonLd, scriptTag } from './render/jsonld.mjs';

const OUT = join(ROOT, 'out');

/** Every print run should be traceable to the exact data that produced it. */
function buildRef() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    return `${new Date().toISOString().slice(0, 10)} · ${sha}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/* A standing line per menu. Hours belong to the restaurant, not to the
   catalog, so they live here rather than being inferred from the data. */
const SUBTITLES = {
  'drinks':      'Wine, cocktails & more · list rotates weekly',
  'brunch':      'Saturday & Sunday · 10 to 3',
  'happy-hour':  'Tuesday to Friday · 4.30 to 6',
  'dinner':      'Tuesday to Saturday · from 5.30',
};

/** Stats scoped to one menu, so each page reports its own counts. */
function statsFor(sections, model) {
  const all = sections.flatMap(s => s.items);
  return {
    ...model.stats,
    published: all.filter(i => !i.needsReview).length,
    heldBack: all.filter(i => i.needsReview).length,
    soldOut: all.filter(i => !i.available).length,
    staleVintages: all.filter(i => i.staleVintage).length,
  };
}

/* The renderers take a model and read `sections` off it. A per-menu view is
   the same model with that menu's sections — so composition cost the renderers
   no changes at all. */
const viewOf = (model, m) => ({ ...model, sections: m.sections, stats: statsFor(m.sections, model) });

function renderIndex(model, ref) {
  const rows = model.menus.map(m => {
    const n = m.sections.reduce((t, s) => t + s.items.length, 0);
    return `<div class="row"><div class="line">` +
      `<span class="nm"><a href="guest-${esc(m.slug)}.html">${esc(m.name)}</a></span>` +
      `<span class="dots"></span>` +
      `<span class="pz">${n}</span>` +
      `</div><div class="dd">` +
      `${m.sections.map(s => esc(s.name)).join(' · ')} &middot; ` +
      `<a href="print-${esc(m.slug)}.html">print draft</a></div></div>`;
  }).join('');

  const skipped = model.stats.menusSkipped || [];
  const notes = [`built ${esc(ref)}`, `<a href="service.html">service reference</a> covers all menus`];
  if (skipped.length) notes.push(`not published: ${skipped.map(esc).join(', ')} — nothing in the catalog for them`);

  return page({
    title: `${restaurant.name} — menus`,
    style: PARASOL_CSS,
    body: `<div class="sheet">` +
      `<div class="brand"><p class="wm">${esc(restaurant.name)}</p>` +
      `<p class="sub">${model.menus.length} menus, composed from the catalog</p></div>` +
      `<section><h2>Menus</h2>${rows}</section>` +
      `<div class="foot">${notes.join(' &middot; ')}</div>` +
      `</div>`,
  });
}

export function build() {
  const model = loadMenu();
  mkdirSync(OUT, { recursive: true });
  const ref = buildRef();
  const menus = model.menus || [];

  const files = {};

  for (const m of menus) {
    const view = viewOf(model, m);
    const sub = SUBTITLES[m.slug] || '';
    files[`guest-${m.slug}.html`] = renderGuest(view, { heading: m.name, sub });
    files[`print-${m.slug}.html`] = renderPrint(view, { heading: m.name, sub, buildRef: ref });
    files[`menu-${m.slug}.jsonld`] = renderJsonLd(view, { menuName: m.name });
    files[`head-${m.slug}.html`] = scriptTag(files[`menu-${m.slug}.jsonld`]);
  }

  /* One document for the floor: everything, stubs included, searchable. */
  files['service.html'] = renderService(model);
  files['index.html'] = renderIndex(model, ref);

  /* Back-compatible combined outputs, so anything pointed at the old file
     names keeps working. */
  const primary = menus[0];
  if (primary) {
    files['guest.html'] = files[`guest-${primary.slug}.html`];
    files['print.html'] = files[`print-${primary.slug}.html`];
    files['menu.jsonld'] = files[`menu-${primary.slug}.jsonld`];
    files['head-snippet.html'] = files[`head-${primary.slug}.html`];
  }

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT, name), content);
  }

  const s = model.stats;
  console.log(`
  built from out/menu.json  (${ref})

    out/index.html          ${menus.length} menus`);
  for (const m of menus) {
    const n = m.sections.reduce((t, sec) => t + sec.items.length, 0);
    console.log(`      guest-${m.slug}.html`.padEnd(28) +
      `${n} items · ${m.sections.length} sections · print + JSON-LD alongside`);
  }
  console.log(`
    out/service.html        ${s.published + s.heldBack} items — internal, includes ${s.heldBack} stub(s), all menus
    out/guest.html          alias of guest-${primary ? primary.slug : 'none'}.html, for anything still pointed at it
`);
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) build();
