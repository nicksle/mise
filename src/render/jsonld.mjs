/**
 * jsonld.mjs — schema.org structured data.
 *
 * 86'd items are omitted entirely. Google should not index a dish the kitchen
 * cannot make today, and a wine list in structured data is the kind of thing
 * that wins a "sancerre by the glass castro" search.
 */

import { displayName, guestItems } from './shared.mjs';
import { restaurant, pricing } from '../config.mjs';

export function renderJsonLd(menu, { menuName = 'Menu' } = {}) {
  const sections = menu.sections
    .map(section => {
      const items = guestItems(section)
        .filter(i => i.available)
        .map(i => {
          const price = i.kind === 'pour' ? (i.glass ?? i.bottle) : i.price;
          const name = displayName(i) + (i.kind === 'pour' && i.vintage ? ` ${i.vintage}` : '');
          const node = {
            '@type': 'MenuItem',
            name,
            offers: {
              '@type': 'Offer',
              price: Number(price).toFixed(2),
              priceCurrency: pricing.currency,
            },
          };
          if (i.description) node.description = i.description;
          if (i.allergens) node.suitableForDiet = undefined; // left for a real mapping
          return node;
        });
      return items.length ? { '@type': 'MenuSection', name: section.name, hasMenuItem: items } : null;
    })
    .filter(Boolean);

  const doc = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name,
    url: restaurant.url,
    servesCuisine: restaurant.cuisine,
    address: {
      '@type': 'PostalAddress',
      streetAddress: restaurant.address.street,
      addressLocality: restaurant.address.city,
      addressRegion: restaurant.address.region,
      postalCode: restaurant.address.zip,
    },
    hasMenu: { '@type': 'Menu', name: menuName, hasMenuSection: sections },
  };

  return JSON.stringify(doc, null, 2) + '\n';
}

/** Ready to paste into the site's <head>. */
export const scriptTag = ld =>
  `<script type="application/ld+json">\n${ld.trim()}\n</script>\n`;
