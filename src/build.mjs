#!/usr/bin/env node
/**
 * build.mjs — render every output from out/menu.json.
 *
 * Renderers read the model and nothing else, so if sync.mjs is correct these
 * cannot publish something wrong.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT } from './config.mjs';
import { loadMenu } from './render/shared.mjs';
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

export function build() {
  const menu = loadMenu();
  mkdirSync(OUT, { recursive: true });

  const isWine = menu.sections.some(s => s.items.some(i => i.kind === 'pour'));
  const heading = isWine ? 'Wine' : 'Brunch';
  const sub = isWine ? 'By the glass · poured this week' : 'Saturday & Sunday · 10 to 3';
  const ref = buildRef();

  const files = {
    'guest.html':   renderGuest(menu, { heading, sub }),
    'service.html': renderService(menu),
    'print.html':   renderPrint(menu, { heading, sub, buildRef: ref }),
    'menu.jsonld':  renderJsonLd(menu, { menuName: heading }),
  };
  files['head-snippet.html'] = scriptTag(files['menu.jsonld']);

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT, name), content);
  }

  const s = menu.stats;
  console.log(`
  built from out/menu.json  (${ref})

    out/guest.html          ${s.published} items — public menu
    out/service.html        ${s.published + s.heldBack} items — internal, includes ${s.heldBack} stub(s)
    out/print.html          print draft, 86'd items omitted
    out/menu.jsonld         structured data, 86'd items omitted
    out/head-snippet.html   paste into the site <head>
`);
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) build();
