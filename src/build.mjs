#!/usr/bin/env node
/**
 * build.mjs — render every output from out/menu.json.
 *
 * Renderers read the model and nothing else, so if sync.mjs is correct these
 * cannot publish something wrong.
 *
 * Menus are compositions, so every output is rendered PER MENU: a guest page,
 * a print draft, a service reference and a JSON-LD block each.
 *
 * The service reference used to be the one exception — one document covering
 * everything, on the argument that a server mid-shift wants one searchable
 * page rather than four tabs. That argument still holds for the floor, so
 * service.html is still built and still covers all menus. But it is wrong for
 * the person EDITING: standing on the Daytime menu and being shown a service
 * sheet that opens on the sparkling wines is just a mismatch to squint past.
 * So both exist now, and the studio previews the scoped one.
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
   catalog, so they live here rather than being inferred from the data.

   Daytime's is REAL — off the printed menu in the window. The other three are
   still invented, and marked so. Wrong hours are the worst possible demo bug:
   they are the one line on the page the restaurant knows by heart, and they
   make every correct thing next to them look like a guess too. */
const SUBTITLES = {
  'drinks':      'Wine, cocktails & more · list rotates weekly',   // PLACEHOLDER
  'brunch':      'Wednesday to Sunday · 9 to 3',                   // real
  'happy-hour':  'Tuesday to Friday · 4.30 to 6',                  // PLACEHOLDER
  'dinner':      'Tuesday to Saturday · from 5.30',                // PLACEHOLDER
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
      `<a href="print-${esc(m.slug)}.html">print draft</a> &middot; ` +
      `<a href="service-${esc(m.slug)}.html">service</a></div></div>`;
  }).join('');

  const skipped = model.stats.menusSkipped || [];
  const notes = [`built ${esc(ref)}`,
    `<a href="service.html">service reference</a> covers all menus at once`];
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
    /* Scoped to this menu, and named for it — the heading is the only way to
       tell two service sheets apart at a glance, and `view` already carries
       per-menu stats so the KPI row counts this menu, not the catalog. */
    files[`service-${m.slug}.html`] = renderService(view, { heading: `${m.name} — service` });
    files[`menu-${m.slug}.jsonld`] = renderJsonLd(view, { menuName: m.name });
    files[`head-${m.slug}.html`] = scriptTag(files[`menu-${m.slug}.jsonld`]);
  }

  /* One document for the floor: everything, stubs included, searchable. Still
     the right thing to hand a server — they are not thinking in menus, they are
     looking up the bottle a table just asked about. */
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
      `${n} items · ${m.sections.length} sections · print + service + JSON-LD alongside`);
  }
  console.log(`
    out/service.html        ${s.published + s.heldBack} items — internal, includes ${s.heldBack} stub(s), all menus
                            (service-<menu>.html alongside each guest page, scoped to that menu)
    out/guest.html          alias of guest-${primary ? primary.slug : 'none'}.html, for anything still pointed at it
`);
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) build();
