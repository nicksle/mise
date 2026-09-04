/**
 * service.mjs — the internal reference. Not a menu.
 *
 * Deliberately looks like a tool rather than a menu, because it is one. Shows
 * everything the guest menu hides: the POS button name so staff can find it on
 * the terminal, allergens, prep notes, stock, importer, vintage confirmation
 * age — and the stubs, which staff need tonight even though guests must not
 * see them.
 *
 * Built mobile-first: this gets read on a phone, standing up, in the dark.
 */

import { esc, money, bare, displayName, subtitle, page } from './shared.mjs';
import { restaurant, publishing } from '../config.mjs';

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  :root { --paper:#FAFAF7; --card:#fff; --ink:#191A18; --ink2:#55584F; --ink3:#8A8E84;
          --rule:#DEE0D8; --accent:#2E4E6B; --warn:#8A6321; --warnbg:#F6EDDC;
          --flag:#A83A26; --flagbg:#F7E9E4; --ok:#2F6A4F; --okbg:#E4F0E9; }
  @media (prefers-color-scheme: dark) {
    :root { --paper:#101210; --card:#181B18; --ink:#E9EBE5; --ink2:#AAB0A6; --ink3:#787E76;
            --rule:#2E332E; --accent:#86AECE; --warn:#D6A94F; --warnbg:#29220F;
            --flag:#E08066; --flagbg:#2C1B15; --ok:#7FBF9C; --okbg:#16261E; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font-family:Archivo,system-ui,sans-serif; font-size:15px; line-height:1.5; }
  .wrap { max-width:720px; margin:0 auto; padding:0 0 60px; }
  header { padding:26px 18px 18px; border-bottom:2px solid var(--ink); }
  h1 { margin:0 0 4px; font-size:1.3rem; letter-spacing:-.02em; }
  header p { margin:0; color:var(--ink2); font-size:.85rem; }
  .kpis { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
  .kpi { font-family:"JetBrains Mono",monospace; font-size:.66rem; letter-spacing:.05em;
         padding:4px 9px; border-radius:2px; background:var(--card); border:1px solid var(--rule); color:var(--ink2); }
  .kpi.warn { background:var(--warnbg); color:var(--warn); border-color:transparent; }
  .kpi.flag { background:var(--flagbg); color:var(--flag); border-color:transparent; }
  h2 { position:sticky; top:0; margin:0; padding:11px 18px 8px; background:var(--paper);
       font-family:"JetBrains Mono",monospace; font-size:.62rem; letter-spacing:.14em;
       text-transform:uppercase; color:var(--ink3); border-bottom:1px solid var(--rule); z-index:1; }
  h2.group { position:static; font-family:Georgia,serif; font-size:1.05rem; letter-spacing:0;
       text-transform:none; color:var(--ink); background:var(--card2);
       padding:14px 18px 10px; border-bottom:0; }
  h2.in-group { padding-left:30px; }
  .row { padding:13px 18px; border-bottom:1px solid var(--rule); background:var(--card); }
  .row.hold { background:var(--warnbg); }
  .row.out { opacity:.62; }
  .top { display:flex; align-items:baseline; gap:9px; flex-wrap:wrap; }
  .nm { font-size:1rem; font-weight:600; letter-spacing:-.005em; }
  .row.out .nm { text-decoration:line-through; }
  .btn { font-family:"JetBrains Mono",monospace; font-size:.65rem; color:var(--ink3);
         background:var(--paper); border:1px solid var(--rule); padding:1px 6px; border-radius:2px; }
  .pz { margin-left:auto; font-family:"JetBrains Mono",monospace; font-size:.83rem;
        font-variant-numeric:tabular-nums; white-space:nowrap; color:var(--ink2); }
  .meta { font-size:.85rem; color:var(--ink2); margin-top:3px; }
  .note { font-size:.87rem; margin-top:7px; }
  .note b { display:block; font-family:"JetBrains Mono",monospace; font-size:.58rem;
            letter-spacing:.1em; text-transform:uppercase; color:var(--ink3); font-weight:500; margin-bottom:1px; }
  .tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
  .t { font-family:"JetBrains Mono",monospace; font-size:.6rem; letter-spacing:.05em;
       padding:2px 7px; border-radius:2px; background:var(--paper); border:1px solid var(--rule); color:var(--ink2); }
  .t.warn { background:var(--warnbg); color:var(--warn); border-color:transparent; }
  .t.flag { background:var(--flagbg); color:var(--flag); border-color:transparent; }
  .t.ok   { background:var(--okbg); color:var(--ok); border-color:transparent; }
  .hold-note { font-family:"JetBrains Mono",monospace; font-size:.66rem; color:var(--warn); margin-top:8px; line-height:1.5; }
  footer { padding:20px 18px; color:var(--ink3); font-size:.78rem; }
`;

export function renderService(menu, { heading = 'Service reference' } = {}) {
  let body = '';

  let group = null;

  for (const section of menu.sections) {
    if (!section.items.length) continue;
    if ((section.group || null) !== group) {
      group = section.group || null;
      if (group) body += `<h2 class="group">${esc(group)}</h2>`;
    }
    body += `<h2${section.group ? ' class="in-group"' : ''}>${esc(section.name)}</h2>`;

    for (const i of section.items) {
      const price = i.kind === 'pour'
        ? (i.glass != null ? money(i.glass) + ' / ' : '') + money(i.bottle)
        : money(i.price);

      const tags = [];
      if (!i.available) tags.push(['flag', "86’d"]);
      if (i.stock != null) tags.push([i.stock <= 1 ? 'warn' : '', `${i.stock} in stock`]);
      if (i.kind === 'pour' && i.vintageAgeMonths != null)
        tags.push([i.staleVintage ? 'warn' : 'ok', `vintage confirmed ${i.vintageAgeMonths}mo ago`]);
      if (i.kind === 'pour' && i.vintageAgeMonths == null && !i.needsReview)
        tags.push(['warn', 'vintage never confirmed']);
      if (i.allergens) tags.push(['', i.allergens]);

      /* Same rule as the guest menu: a written description wins over the
         grape/region line, so what you type reaches every view, not some. */
      const meta = subtitle(i);

      body +=
        `<div class="row${i.needsReview ? ' hold' : ''}${!i.available ? ' out' : ''}">` +
          `<div class="top">` +
            `<span class="nm">${esc(i.needsReview ? '—' : displayName(i) +
                (i.kind === 'pour' ? (i.vintage ? ' ' + i.vintage : ' NV') : ''))}</span>` +
            `<span class="btn">${esc(i.posName)}</span>` +
            `<span class="pz">${price}</span>` +
          `</div>` +
          (meta ? `<div class="meta">${esc(meta)}</div>` : '') +
          (i.serviceNote ? `<div class="note"><b>service note</b>${esc(i.serviceNote)}</div>` : '') +
          (i.pairing ? `<div class="note"><b>pairing</b>${esc(i.pairing)}</div>` : '') +
          (tags.length ? `<div class="tags">` +
            tags.map(([c, t]) => `<span class="t ${c}">${esc(t)}</span>`).join('') + `</div>` : '') +
          (i.needsReview
            ? `<div class="hold-note">stub auto-created from the POS · needs_review: true<br>` +
              `shown here because you are selling it tonight — held back from the guest menu until someone writes the copy</div>`
            : '') +
        `</div>`;
    }
  }

  const s = menu.stats;
  const kpis = [
    ['', `${s.published} on the menu`],
    s.heldBack ? ['warn', `${s.heldBack} awaiting copy`] : null,
    s.soldOut ? ['flag', `${s.soldOut} 86’d`] : null,
    s.staleVintages ? ['warn', `${s.staleVintages} stale vintage${s.staleVintages === 1 ? '' : 's'}`] : null,
  ].filter(Boolean);

  return page({
    title: `${restaurant.name} — ${heading}`,
    style: CSS,
    body:
      `<div class="wrap">` +
        `<header><h1>${esc(heading)}</h1>` +
        `<p>Internal. Not for guests.</p>` +
        `<div class="kpis">${kpis.map(([c, t]) => `<span class="kpi ${c}">${esc(t)}</span>`).join('')}</div>` +
        `</header>` +
        body +
        `<footer>Generated ${esc(menu.generatedAt)} from ${esc(menu.source)}. ` +
        `Stale vintage = unconfirmed for ${publishing.staleVintageMonths}+ months.</footer>` +
      `</div>`,
  });
}
