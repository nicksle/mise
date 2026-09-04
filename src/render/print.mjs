/**
 * print.mjs — the print draft. A draft, deliberately.
 *
 * The pipeline flows current copy and prices into a fixed trim size and hands
 * you a document that is roughly placed. You make the typographic decisions and
 * send to press. Selling "one-click print menus" would be selling a bug: a
 * printed menu does not reflow, so when the kitchen adds four dishes something
 * has to give, and that judgement is a person's.
 *
 * What this does kill is the retyping and the proofreading — which is most of
 * the labour, and all of the risk of a wrong price on a physical menu.
 *
 * Overset detection: the estimator below flags when content will not fit the
 * trim, so you find out before the PDF goes to the printer.
 */

import { esc, bare, money, displayName, vintageLabel, subtitle,
         guestItems, page } from './shared.mjs';
import { restaurant } from '../config.mjs';

/* US Letter, generous margins. Change TRIM to match the real menu stock. */
const TRIM = { width: '8.5in', height: '11in', margin: '0.75in' };
const LINES_PER_PAGE = 46;   // rough capacity at this type size

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Archivo:wght@400;600&display=swap');
  @page { size: ${TRIM.width} ${TRIM.height}; margin: ${TRIM.margin}; }
  :root { --ink:#1A1712; --ink2:#6B6355; --rule:#CFC6B4; }
  * { box-sizing:border-box; }
  body { margin:0; background:#8C8C88; color:var(--ink);
         font-family:"EB Garamond",Georgia,serif; font-size:11.5pt; line-height:1.42; }
  .sheet { width:${TRIM.width}; min-height:${TRIM.height}; margin:24px auto; background:#fff;
           padding:${TRIM.margin}; box-shadow:0 2px 20px rgba(0,0,0,.3); position:relative; }
  .brand { text-align:center; padding-bottom:16pt; margin-bottom:20pt; border-bottom:.5pt solid var(--rule); }
  .wm { font-size:22pt; letter-spacing:.34em; text-transform:uppercase; margin:0 0 5pt; text-indent:.34em; font-weight:400; }
  .sub { font-family:Archivo,sans-serif; font-size:6.5pt; letter-spacing:.26em; text-transform:uppercase;
         color:var(--ink2); margin:0; text-indent:.26em; }
  section { margin-bottom:16pt; break-inside:avoid; }
  h2 { font-family:Archivo,sans-serif; font-size:6.5pt; letter-spacing:.22em; text-transform:uppercase;
       font-weight:600; color:var(--ink2); margin:0 0 9pt; padding-bottom:4pt;
       border-bottom:.5pt solid var(--rule); text-indent:.22em; }
  h2.group { font-family:Georgia,serif; font-size:12pt; letter-spacing:0; text-transform:none;
       font-weight:400; color:var(--ink); text-indent:0; border-bottom:0;
       margin:14pt 0 7pt; padding-bottom:0; break-after:avoid; }
  h2.group:first-child { margin-top:0; }
  section.in-group { margin-left:10pt; }

  section > .note { font-family:Archivo,sans-serif; font-size:6pt; color:var(--ink2);
       margin:-6pt 0 8pt; }

  .cols { display:flex; justify-content:flex-end; gap:16pt; margin:-6pt 0 8pt;
          font-family:Archivo,sans-serif; font-size:5.5pt; letter-spacing:.16em;
          text-transform:uppercase; color:var(--ink2); }
  .cols span { width:30pt; text-align:right; }
  .row { margin-bottom:8pt; break-inside:avoid; }
  .line { display:flex; align-items:baseline; gap:8pt; }
  .nm { font-weight:500; }
  .vt { color:var(--ink2); font-variant-numeric:tabular-nums; }
  .dots { flex:1; border-bottom:.5pt dotted var(--rule); transform:translateY(-3pt); }
  .pz { font-variant-numeric:tabular-nums; }
  .pz.col { width:30pt; text-align:right; }
  .pz.dim { opacity:.35; }
  .dd { font-size:9.5pt; font-style:italic; color:var(--ink2); margin-top:1pt; max-width:52ch; }
  .colophon { position:absolute; bottom:calc(${TRIM.margin} / 2); left:0; right:0; text-align:center;
              font-family:Archivo,sans-serif; font-size:5pt; letter-spacing:.14em;
              text-transform:uppercase; color:#B9B0A0; }
  .overset { background:#FBE9E5; border:1pt solid #A83A26; color:#A83A26; padding:10pt 14pt;
             margin:16px auto; max-width:${TRIM.width}; font-family:Archivo,sans-serif; font-size:10pt; }
  @media print {
    body { background:#fff; }
    .sheet { margin:0; box-shadow:none; }
    .overset { display:none; }
  }
`;

export function renderPrint(menu, { heading = 'Menu', sub = '', buildRef = '' } = {}) {
  let body = '', lines = 0, first = true;

  let group = null;

  for (const section of menu.sections) {
    const items = guestItems(section).filter(i => i.available); // 86'd items never print
    if (!items.length) continue;

    if ((section.group || null) !== group) {
      group = section.group || null;
      /* A group heading costs vertical lines too, and the print draft counts
         them to guess at page breaks. */
      if (group) { body += `<h2 class="group">${esc(group)}</h2>`; lines += 2; }
    }

    lines += 3;
    body += `<section${section.group ? ' class="in-group"' : ''}>` +
            `<h2>${esc(section.name)}</h2>` +
            (section.note ? `<p class="note">${esc(section.note)}</p>` : '');
    if (section.note) lines += 1;
    const pours = items.some(i => i.kind === 'pour');
    if (pours && first) { body += `<div class="cols"><span>Glass</span><span>Bottle</span></div>`; lines += 1; }
    if (pours) first = false;

    for (const i of items) {
      const sub2 = subtitle(i);
      lines += sub2 ? 2 : 1;
      const prices = i.kind === 'pour'
        ? `<span class="pz col${i.glass == null ? ' dim' : ''}">${bare(i.glass)}</span>` +
          `<span class="pz col">${bare(i.bottle)}</span>`
        : `<span class="pz">${money(i.price)}</span>`;
      const vt = vintageLabel(i);

      body +=
        `<div class="row"><div class="line">` +
          `<span class="nm">${esc(displayName(i))}</span>` +
          (vt ? `<span class="vt">${esc(vt)}</span>` : '') +
          `<span class="dots"></span>${prices}` +
        `</div>` +
        (sub2 ? `<div class="dd">${esc(sub2)}</div>` : '') +
        `</div>`;
    }
    body += `</section>`;
  }

  /* The honest part: tell the designer when it will not fit. */
  const overset = lines > LINES_PER_PAGE
    ? `<div class="overset"><b>Overset by roughly ${lines - LINES_PER_PAGE} lines.</b> ` +
      `This will not fit ${TRIM.width} × ${TRIM.height} at the current type size. ` +
      `Cut items, drop descriptions, or go to a second panel — a printed menu does not reflow, ` +
      `so this is your call, not the pipeline's.</div>`
    : '';

  const ref = buildRef || menu.generatedAt;

  return page({
    title: `${restaurant.name} — ${heading} (print draft)`,
    style: CSS,
    body:
      overset +
      `<div class="sheet">` +
        `<div class="brand"><p class="wm">${esc(restaurant.name)}</p>` +
        `<p class="sub">${esc(sub || heading)}</p></div>` +
        body +
        `<div class="colophon">${esc(ref)}</div>` +
      `</div>`,
  });
}
