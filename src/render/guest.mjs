/**
 * guest.mjs — the public menu.
 *
 * Renders only items that have copy. A stub the kitchen added twenty minutes
 * ago is simply absent; guests never see POS shorthand.
 */

import { esc, bare, money, displayName, vintageLabel, subtitle,
         guestItems, page, PARASOL_CSS } from './shared.mjs';
import { restaurant, publishing } from '../config.mjs';

export function renderGuest(menu, { heading = 'Menu', sub = '' } = {}) {
  const isWineList = menu.sections.some(s => s.items.some(i => i.kind === 'pour'));
  let body = '';
  let first = true;

  for (const section of menu.sections) {
    const items = guestItems(section);
    if (!items.length) continue;

    body += `<section><h2>${esc(section.name)}</h2>`;
    const pours = items.some(i => i.kind === 'pour');
    if (pours && first) body += `<div class="cols"><span>Glass</span><span>Bottle</span></div>`;
    if (pours) first = false;

    for (const i of items) {
      const out = !i.available;
      const lastOne = i.stock === 1 && i.available;
      const vt = vintageLabel(i);
      const sub2 = subtitle(i);

      /* A wine's glass and bottle carry independent sold_out flags. When the
         open bottle blows the pour is gone but the cellar bottle is not, so
         the glass price greys out and the row stays on the list. */
      const glassGone = i.kind === 'pour' && i.glass != null && i.glassAvailable === false;
      const bottleGone = i.kind === 'pour' && i.bottle != null && i.bottleAvailable === false;

      const prices = i.kind === 'pour'
        ? `<span class="pz col${i.glass == null || glassGone ? ' dim' : ''}">` +
            `${glassGone ? '—' : bare(i.glass)}</span>` +
          `<span class="pz col${bottleGone ? ' dim' : ''}">` +
            `${bottleGone ? '—' : bare(i.bottle)}</span>`
        : `<span class="pz">${money(i.price)}</span>`;

      body +=
        `<div class="row${out ? ' out' : ''}">` +
          `<div class="line">` +
            `<span class="nm">${esc(displayName(i))}` +
              (lastOne ? `<span class="tag">last bottle</span>` : '') +
              (glassGone && !out ? `<span class="tag">bottle only</span>` : '') +
              (out ? `<span class="tag">86</span>` : '') +
            `</span>` +
            (vt ? `<span class="vt">${esc(vt)}</span>` : '') +
            `<span class="dots"></span>` +
            prices +
          `</div>` +
          (sub2 ? `<div class="dd">${esc(sub2)}</div>` : '') +
        `</div>`;
    }
    body += `</section>`;
  }

  const s = menu.stats;
  const notes = [];
  if (s.soldOut && publishing.soldOutTreatment === 'grey')
    notes.push(`${s.soldOut} ${isWineList ? (s.soldOut === 1 ? 'pour' : 'pours') : (s.soldOut === 1 ? 'item' : 'items')} 86’d today`);
  notes.push(isWineList ? 'ask your server what else is open' : 'updated from the kitchen');

  return page({
    title: `${restaurant.name} — ${heading}`,
    style: PARASOL_CSS,
    body:
      `<div class="sheet">` +
        `<div class="brand"><p class="wm">${esc(restaurant.name)}</p>` +
        `<p class="sub">${esc(sub || heading)}</p></div>` +
        body +
        `<div class="foot">${notes.map(esc).join(' &middot; ')}</div>` +
      `</div>`,
  });
}
