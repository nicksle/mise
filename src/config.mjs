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
/* Menus — a menu is a COMPOSITION, not a category.                     */
/*                                                                      */
/* The category tree belongs to the restaurant: it is how they ring     */
/* things up and how they report. If a menu had to *be* a category,     */
/* changing the website would mean reorganising the POS, which is the   */
/* coupling this project exists to remove. So a menu is an ordered list */
/* of sources, each rendered as a section.                              */
/*                                                                      */
/*   category  the Square category name, matched case-insensitively     */
/*   as        guest-facing section label, when it differs from the POS */
/*   kind      'wine' opts the section into the wine-only rules         */
/*             (vintage confirmation, by-the-glass derivation)          */
/*                                                                      */
/* A menu whose sources are all absent from the catalog is skipped, not */
/* failed — that is a menu this restaurant does not run yet.            */
/* ------------------------------------------------------------------ */
export const menus = [
  {
    slug: 'drinks',
    name: 'Drinks',
    sources: [
      { category: 'Sparkling',        kind: 'wine' },
      { category: 'White',            kind: 'wine' },
      { category: 'Rosé',             kind: 'wine' },
      { category: 'Chilled Red',      kind: 'wine' },
      { category: 'Red',              kind: 'wine' },
      { category: 'Cocktails' },
      /* POS says Mocktails because that is what a server can find at speed;
         guests get the label the room actually uses. */
      { category: 'Mocktails',        as: 'Sober curious' },
      { category: 'Beer & Cider' },
      { category: 'Amaro & Digestif', as: 'After' },
    ],
  },
  {
    slug: 'brunch',
    name: 'Brunch',
    sources: [
      { category: 'Brunch', required: true },
      { category: 'Sweet' },
      { category: 'Coffee' },
    ],
  },
  {
    slug: 'happy-hour',
    name: 'Happy Hour',
    /* Happy hour is separate items in the POS at Parasol, so it names its own
       category — and may legitimately pull the same wine the drinks menu
       pulls. That is composition working, not a bug. */
    sources: [
      /* `required` names the source that defines the menu. Without it the
         menu is skipped, so happy hour can't quietly become "the cocktail
         list under a different title" when the catalog has no HH items. */
      { category: 'Happy Hour', required: true },
    ],
  },
  {
    slug: 'dinner',
    name: 'Dinner',
    sources: [
      { category: 'Plates', required: true },
      { category: 'Sides' },
      { category: 'Sweet' },
    ],
  },
];

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

  /* Who owns the words a guest reads.
       'repo'   — Mise is the editor: what you type in the studio wins.
       'square' — the restaurant's dashboard wins, studio copy is a fallback.
     Mise is the editor, so 'repo'. Two places to write the same sentence is
     the drift problem this project exists to kill, and the studio silently
     losing to a Square attribute is how it comes back.
     Price, availability and VINTAGE are always Square's, either way —
     vintage rolls without warning and the somm fixes it from the floor. */
  copyOwner: 'repo',
  /* Flag a wine whose vintage hasn't been confirmed in this many months.
     Scoped to sources marked kind:'wine' — a Negroni has no vintage. */
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
  /* Happy hour is separate POS items, so the same drink exists twice and
     Square has no idea they are related. An item carrying `twin_of` in
     editorial.json that is live while its twin is 86'd means one of the
     two is lying to a guest. Warn rather than fail: taking every menu
     down over one drink is worse than flagging it loudly. */
  warnOnOrphanedTwin: true,
};

export const restaurant = {
  name: 'Parasol',
  url: 'https://parasol.sf',
  cuisine: 'Californian',
  address: { street: '2298 Market St', city: 'San Francisco', region: 'CA', zip: '94114' },
};
