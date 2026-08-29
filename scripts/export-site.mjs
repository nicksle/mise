#!/usr/bin/env node
/**
 * export-site.mjs — copy the built menu into the site repo.
 *
 *   SITE_REPO=../parasol npm run export:site
 *
 * Writes out/menu.json to $SITE_REPO/src/data/menu.json and the JSON-LD
 * snippet alongside it. Commit both in the site repo — the data is part of the
 * site's build, and committing it is what makes a rebuild reproducible later.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from '../src/config.mjs';

const SITE = process.env.SITE_REPO;
if (!SITE) {
  console.error(`
  Set SITE_REPO to the Parasol site checkout, in .env or inline:

    SITE_REPO=../parasol npm run export:site
`);
  process.exit(1);
}

const site = resolve(ROOT, SITE);
if (!existsSync(site)) {
  console.error(`\n  No such directory: ${site}\n`);
  process.exit(1);
}

const menuPath = join(ROOT, 'out', 'menu.json');
if (!existsSync(menuPath)) {
  console.error('\n  out/menu.json not found — run `npm run sync` first.\n');
  process.exit(1);
}

const dest = join(site, 'src', 'data');
mkdirSync(dest, { recursive: true });

const menu = readFileSync(menuPath, 'utf8');
writeFileSync(join(dest, 'menu.json'), menu);

const ld = join(ROOT, 'out', 'menu.jsonld');
if (existsSync(ld)) writeFileSync(join(dest, 'menu.jsonld'), readFileSync(ld, 'utf8'));

const m = JSON.parse(menu);
console.log(`
  exported to ${dest}

    menu.json      ${m.stats.published} items across ${m.sections.length} sections
    menu.jsonld    structured data

  In the site:
    import menu from '../data/menu.json'
    <DrinkMenu menu={menu} heading="Drinks" />
`);
