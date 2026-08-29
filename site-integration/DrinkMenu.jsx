/**
 * DrinkMenu.jsx — the guest menu, for the Parasol site.
 *
 * Drop this into the site repo (src/components/) and import menu.json at build
 * time. This component is the ONLY renderer of the public menu; Mise's
 * out/guest.html is a standalone preview, not a second implementation to keep
 * in sync. If you find yourself editing both, one of them should be deleted.
 *
 *   import menu from '../data/menu.json'
 *   <DrinkMenu menu={menu} heading="Drinks" sub="Wine, cocktails & more" />
 *
 * Uses the site's existing tokens (--ink, --line, --accent) so it inherits the
 * cream/ink treatment rather than carrying its own palette.
 */

import { useMemo } from 'react';
import './DrinkMenu.css';

const money = n => (n == null ? '—' : `$${Number(n).toFixed(0)}`);
const bare  = n => (n == null ? '—' : Number(n).toFixed(0));

/** Producer + cuvée for wine, menu name for everything else. */
function displayName(item) {
  if (item.producer) {
    return item.cuvee ? `${item.producer} ‘${item.cuvee}’` : item.producer;
  }
  return item.menuName;
}

function subtitle(item) {
  return item.kind === 'pour'
    ? [item.grape, item.region].filter(Boolean).join(' · ')
    : item.description;
}

function Row({ item, reveal }) {
  const isPour = item.kind === 'pour';
  const out = !item.available;

  /* Glass and bottle carry independent sold_out flags. When the open bottle
     blows the pour is gone but the cellar bottle is not — the row stays on the
     list, tagged, with the glass price dashed. */
  const glassGone  = isPour && item.glass != null && item.glassAvailable === false;
  const bottleGone = isPour && item.bottle != null && item.bottleAvailable === false;
  const lastOne    = item.stock === 1 && item.available;
  const sub        = subtitle(item);

  return (
    <div className={`dm-row${out ? ' is-out' : ''}${reveal ? ` ${reveal}` : ''}`}>
      <div className="dm-line">
        <span className="dm-name">
          {displayName(item)}
          {lastOne   && <span className="dm-tag">last bottle</span>}
          {glassGone && !out && <span className="dm-tag">bottle only</span>}
          {out       && <span className="dm-tag">86</span>}
        </span>

        {isPour && (
          <span className="dm-vintage">{item.vintage ? item.vintage : 'NV'}</span>
        )}

        <span className="dm-leader" aria-hidden="true" />

        {isPour ? (
          <>
            <span className={`dm-price dm-col${item.glass == null || glassGone ? ' is-dim' : ''}`}>
              {glassGone ? '—' : bare(item.glass)}
            </span>
            <span className={`dm-price dm-col${bottleGone ? ' is-dim' : ''}`}>
              {bottleGone ? '—' : bare(item.bottle)}
            </span>
          </>
        ) : (
          <span className="dm-price">{money(item.price)}</span>
        )}
      </div>

      {sub && <p className="dm-sub">{sub}</p>}
    </div>
  );
}

export default function DrinkMenu({ menu, heading = 'Drinks', sub = '' }) {
  /* Guests only ever see items with copy. A stub the somm created twenty
     minutes ago is simply absent — never POS shorthand on a public page. */
  const sections = useMemo(
    () =>
      (menu?.sections ?? [])
        .map(s => ({ ...s, items: s.items.filter(i => !i.needsReview) }))
        .filter(s => s.items.length > 0),
    [menu]
  );

  if (!sections.length) return null;

  const firstPourIndex = sections.findIndex(s => s.items.some(i => i.kind === 'pour'));
  const soldOut = menu.stats?.soldOut ?? 0;

  return (
    <div className="dm">
      {(heading || sub) && (
        <header className="dm-head r-1">
          {heading && <h2 className="dm-heading">{heading}</h2>}
          {sub && <p className="dm-sub-head">{sub}</p>}
        </header>
      )}

      {sections.map((section, si) => (
        <section key={section.name} className={`dm-section r-${Math.min(si + 2, 6)}`}>
          <h3 className="dm-section-title">{section.name}</h3>

          {si === firstPourIndex && (
            <div className="dm-cols" aria-hidden="true">
              <span>Glass</span>
              <span>Bottle</span>
            </div>
          )}

          {section.items.map(item => (
            <Row key={item.id} item={item} />
          ))}
        </section>
      ))}

      <p className="dm-foot">
        {soldOut > 0 && `${soldOut} ${soldOut === 1 ? 'pour' : 'pours'} 86’d today · `}
        ask your server what else is open
      </p>
    </div>
  );
}
