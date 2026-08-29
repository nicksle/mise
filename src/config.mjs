/**
 * config.mjs — everything the pipeline is allowed to be opinionated about,
 * in one file, so decisions are visible instead of buried in logic.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* --- .env, without a dependency --- */
if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TOKEN = process.env.SQUARE_TOKEN || '';
const ENV = process.env.SQUARE_ENV || (TOKEN ? 'sandbox' : 'mock');

export const square = {
  env: ENV,
  token: TOKEN || 'mock-token',
  locationId: process.env.SQUARE_LOCATION_ID || '',
  version: '2026-07-16',
  base: {
    mock: process.env.MOCK_URL || 'http://127.0.0.1:8789',
    sandbox: 'https://connect.squareupsandbox.com',
    production: 'https://connect.squareup.com',
  }[ENV],
};

/* Once the React site exists, point the studio's guest preview at its dev
   server so what you see while editing copy is the real site, not Mise's
   standalone approximation of it. */
export const site = {
  repo: process.env.SITE_REPO || '',
  devUrl: process.env.SITE_DEV_URL || '',
};

export const webhook = {
  signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '',
  notificationUrl: process.env.WEBHOOK_NOTIFICATION_URL || '',
  port: Number(process.env.PORT || 3000),
  debounceMs: 4000,        // a manager editing five items fires five events
  githubRepo: process.env.GITHUB_REPO || '',
  githubToken: process.env.GITHUB_TOKEN || '',
};

/* ------------------------------------------------------------------ */
/* Curation — what reaches a guest. This is a decision, not a query.    */
/* ------------------------------------------------------------------ */
export const curation = {
  /* Primary rule: the item must sit in a category typed MENU_CATEGORY,
     which is what Square creates when a menu is built through the
     Restaurants dashboard. */
  requireMenuCategory: true,

  /* Fallback for accounts that don't use Restaurants menu management
     (and for sandbox, where it isn't available). Category names that count
     as menu categories, case-insensitive. */
  menuCategoryNames: [
    // drinks
    'sparkling', 'white', 'rosé', 'rose', 'orange', 'skin contact',
    'chilled red', 'red', 'reserve',
    'cocktails', 'mocktails', 'beer & cider', 'beer and cider', 'beer',
    'amaro & digestif', 'amaro and digestif', 'amaro', 'digestif',
    'wine btg', 'wine bottle',
    // food
    'plates', 'sweet', 'sides', 'coffee', 'brunch', 'dinner', 'happy hour',
  ],

  /* Belt and braces: never publish an item whose POS name matches these,
     whatever category it lands in. */
  denyNamePatterns: [
    /^misc/i, /staff/i, /gift ?card/i, /corkage/i, /comp\b/i,
    /waste/i, /\bsomm pour\b/i, /^open /i, /wine club/i, /^test/i,
  ],
};

/* ------------------------------------------------------------------ */
/* Price display — the twenty-minute conversation with the GM, written  */
/* down so it stops being a source of bugs.                             */
/* ------------------------------------------------------------------ */
export const pricing = {
  /* Variation names treated as the by-the-glass pour, in priority order. */
  glassNames: ['glass', 'gls', 'by the glass', 'btg', '6oz', '5oz'],
  /* Variation names treated as the bottle. */
  bottleNames: ['bottle', 'btl', '750ml', 'full bottle'],
  /* For a single-variation item, that variation's price is the price.
     For multi-variation food (small/large), which one shows on the menu: */
  singlePriceStrategy: 'lowest',   // 'lowest' | 'first'
  currency: 'USD',
};

/* ------------------------------------------------------------------ */
/* Publishing rules — the asymmetry between staff and guests.           */
/* ------------------------------------------------------------------ */
export const publishing = {
  /* An item with no menu_name is a stub. Staff need it tonight; guests
     must never see POS shorthand. */
  guestRequiresCopy: true,
  serviceShowsStubs: true,
  /* Sold-out items: 'grey' keeps them visible and struck through,
     'hide' removes them. JSON-LD always omits them. */
  soldOutTreatment: 'grey',
  /* Flag a wine whose vintage hasn't been confirmed in this many months. */
  staleVintageMonths: 8,
};

/* ------------------------------------------------------------------ */
/* Sanity checks — these fail the build rather than publishing garbage. */
/* ------------------------------------------------------------------ */
export const checks = {
  failOnEmptySection: true,
  failOnZeroPrice: true,
  failOnMissingSection: true,
  /* If more than this fraction of items would publish without copy,
     something is wrong with the enrichment join — stop. */
  maxStubRatio: 0.5,
};

export const restaurant = {
  name: 'Parasol',
  url: 'https://parasol.sf',
  cuisine: 'Californian',
  address: { street: '2298 Market St', city: 'San Francisco', region: 'CA', zip: '94114' },
};
