# Mise

The Square POS catalog is the single source of truth for every menu Parasol
publishes. The website, the printed list, the service reference and the
structured data Google reads are all renderings of it.

**It runs right now, with no Square account:**

```bash
npm run demo
```

That starts a local mock POS, syncs, builds all four outputs, then simulates a
service — a manager 86s a glass pour, the kitchen adds a dish with no copy —
and shows what each view does about it. Open `out/guest.html`,
`out/service.html`, `out/print.html`.

Node 18+. **Zero dependencies** — plain `fetch` against Square's REST API, so
there is no SDK version to rot.

---

## Why the POS

Every restaurant runs several versions of its menu and they disagree. What
makes the POS different isn't better software — it's that the catalog is tied
to money. A wrong price there loses revenue on every ticket and somebody
notices within one service. That economic pressure does maintenance work for
free, forever. Nothing else in the building has that property.

So: take the dataset that maintains itself, and make everything else a function
of it. **Do not build a second database.** A second store means two sources of
truth and a reconciliation problem you own for as long as the site exists.

## The three views

One model, three projections, differing only in which fields are visible and
when.

| | POS | Guest menu | Service reference |
|---|---|---|---|
| POS button name | ✓ | — | ✓ (so staff can find it on the terminal) |
| Menu name, description | — | ✓ | ✓ |
| Price | ✓ | ✓ | ✓ |
| Allergens, prep notes, pairing | — | partial | ✓ |
| Stock, importer, vintage age | ✓ | partial | ✓ |
| Items with no copy yet | ✓ | **held back** | ✓ (flagged) |

That last row is the interesting one. When an item appears in the POS that we
have never seen, the sync worker auto-creates a stub with `needs_review: true`.
It shows in **Service** immediately — staff are selling it tonight — and is
**held back from the guest menu** until someone writes the copy. Guests never
see `SPRING PEA TST`.

## Layout

```
src/
  config.mjs        every opinion in one file: curation rules, price display,
                    publishing rules, sanity checks
  square.mjs        REST client (read-only — it never writes to the catalog)
  enrich.mjs        the three-layer join + stub lifecycle
  sync.mjs          fetch → curate → enrich → normalize → validate → menu.json
  build.mjs         render every output from menu.json
  webhook.mjs       catalog.version.updated → debounce → rebuild
  render/
    guest.mjs       the public menu
    service.mjs     internal reference, mobile-first (read on a phone, in the dark)
    print.mjs       print draft, with overset detection
    jsonld.mjs      schema.org Restaurant → Menu → MenuSection → MenuItem
data/
  editorial.json    the repo layer: producer, region, sort order, service notes
  stubs.json        auto-created, do not hand-edit
scripts/
  mock-square.mjs   local fake Square so this runs with no account
  seed-sandbox.mjs  build a mock Parasol in a real Square sandbox
  inspect-catalog.mjs  the Phase 00 spike — read-only, works against anything
out/                generated; safe to delete
```

## Where each field lives

Three layers, joined on `catalog_object_id`. The test for which layer a field
belongs to is simply *who changes it, and how fast.*

| Layer | Lives in | Edited by | Examples |
|---|---|---|---|
| Canonical | Square catalog | Kitchen/managers, mid-service | price, category, `sold_out`, stock |
| Presentation | Square custom attributes | GM/somm, in the Square dashboard | `menu_name`, `menu_description`, `allergens`, `vintage` |
| Editorial | `data/editorial.json` | You | producer, region, grape, sort order, service notes |

Square caps catalog custom attributes per account (docs say 10 seller-visible,
10 hidden). That cap is why the third layer exists. **Vintage stays in Square**
because it rolls without warning and the somm must be able to fix it from the
floor; producer and region are stable enough to live in version control.

## Wine

The by-the-glass list is the case that justifies the build — it turns over
weekly where food turns over seasonally, and most restaurant websites have no
wine list at all because maintaining one by hand is impossible.

- Glass and bottle are two `ITEM_VARIATION`s under one item, **each with its
  own `sold_out` flag**. When the open bottle blows, the pour goes and the
  cellar bottle stays: the guest menu tags the row `bottle only` and dashes out
  the glass price.
- Bottle counts come from the Inventory API. One remaining renders `last bottle`.
- **Vintage drift** is the failure mode nobody sees coming. When the 2021 becomes
  the 2022 the somm does not make a new POS button — same wine, same price, the
  line is six deep. Square never registers a change, so no webhook fires and the
  pipeline publishes a vintage that is now wrong everywhere. The only fix is the
  `vintage_confirmed` date plus a nag; `npm run sync` reports how many wines are
  stale.

## Print

The pipeline generates a **draft**, not a final. A printed menu is a fixed
physical object — add four dishes and it doesn't reflow, it overflows. So
`print.html` flows current copy and prices into the trim size, estimates
whether it fits, and tells you when it's overset so you find out before the PDF
reaches the printer. You make the typographic call.

What it does kill is the retyping and the proofreading, which is most of the
labour and all of the risk of a wrong price on a physical menu.

Because `menu.json` is committed, **every print run maps to a commit.** Tag the
run (`print/2026-08-29-wine`), and a reprint is a checkout plus regenerate —
identical months later. Diff two tags to answer "what changed since the last
printing?", which for a weekly wine list nobody can currently answer.

## Editing without the terminal

```bash
npm run studio          # → http://localhost:4000
```

A browser UI over `data/editorial.json`. Left: every item, with the ones that
need copy pinned at the top as a work queue. Middle: the editor. Right: a live
preview of the guest menu, service reference and print draft. **Sync & rebuild**
is a button.

Fields are grouped by who owns them, which is the point:

- **From Square** — POS name, prices, availability, stock, vintage. Shown, never
  written. Those belong to the restaurant and get changed on the terminal or in
  the Square dashboard.
- **Menu copy** — menu name, description, allergens. If someone sets these in
  Square they win; what you type here is the fallback. That precedence is
  deliberate: the restaurant can always correct its own menu.
- **Wine detail** — producer, cuvée, grape, region, importer.
- **Service only** — notes, pairing, sort order. Never reaches a guest.

Every save is a git commit, so you get history for free and the reprint
guarantee holds.

### Letting the GM or somm in

```bash
STUDIO_PASSWORD=something npm run studio
cloudflared tunnel --url http://localhost:4000
```

Send them the HTTPS URL and the password. One shared password, session dies
with the process — adequate for a few trusted people behind a tunnel, not a
substitute for real accounts. The catch is that it only works while your laptop
is on.

For something always-on, deploy it to Fly or Render with the repo mounted and
`STUDIO_PASSWORD` set. Before that's worth doing, find out whether the GM
actually edits anything — most restaurants say they will and then don't, and
the answer decides whether this stays a tool for you or becomes a product you
maintain.

**Note the division of labour.** The GM does not need this app to edit menu
names and descriptions — those live in Square custom attributes with
`SELLER_VISIBILITY_READ_WRITE_VALUES`, so they appear in the Square dashboard
item editor he already uses for prices. The studio exists for the fields Square
has no room for.

## Connecting real Square

```bash
cp .env.example .env      # add your sandbox token
npm run seed              # build a mock Parasol in the sandbox
npm run inspect           # see what's actually there
npm run sync && npm run build
```

`SQUARE_ENV` switches `mock` → `sandbox` → `production`. Nothing else changes.

**Sandbox is free** — no business, no bank account, no verification. Sign up at
developer.squareup.com, create an app, copy the Sandbox Access Token. Note that
Square for Restaurants is unavailable in sandbox, so `MENU_CATEGORY` can be set
via API but not through the Restaurants UI; `curation.menuCategoryNames` in
`config.mjs` is the fallback rule, and `inspect-catalog.mjs` warns when it finds
no menu categories.

For Parasol's real catalog, **use OAuth, not a personal access token.** A
personal token is unrestricted access to their whole Square account, payments
included. Request `ITEMS_READ`, `INVENTORY_READ`, `MERCHANT_PROFILE_READ` — read
only, scoped, revocable. "Authorize read-only access to your item catalog" is a
much easier yes than "give me your API token."

## Webhooks

```bash
npm run webhook
cloudflared tunnel --url http://localhost:3000
```

Register the HTTPS URL in Developer Console → Webhooks, subscribe to
`catalog.version.updated`, and put the signature key in `.env`.

Three things the handler gets right: it verifies Square's HMAC signature in
constant time; it responds `2xx` immediately and rebuilds afterwards (Square
retries for 24 hours, so a slow handler looks like a failure); and it debounces,
because a manager editing five items fires five events and un-debounced they
race each other.

The payload deliberately does not say *what* changed — only that something did —
so the correct response is always to re-sync from your own stored timestamp.

## Safety

`sync.mjs` refuses to publish rather than publishing garbage. An empty section,
a zero price, or more than half the items missing copy fails the build and
leaves the last good output in place. Once the site mirrors the POS, a typo in
the catalog becomes a public typo in about a minute — these checks and a preview
build are what stand between you and that.

The pipeline is read-only against Square. It never writes to the catalog, which
is what makes it safe to point at a live restaurant.

## Next

1. `npm run demo` — see it work.
2. `npm run studio` — edit without the terminal.
3. Get a sandbox token (15 minutes), `npm run seed`, run it against real Square.
4. `npm run inspect` against **Parasol's** account when you have read access.
   That's the Phase 00 spike and every estimate depends on it: how many items
   need copy, whether wine is one item with two variations or two items, and
   how many custom-attribute slots are already spent.
