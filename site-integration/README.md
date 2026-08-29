# Wiring Mise into the Parasol site

Mise's product is `out/menu.json`. The React site consumes it at build time and
renders the guest menu. Print, the service reference and the structured data
stay in Mise — they aren't the site.

```
                       ┌─→  React site   <DrinkMenu>      the real guest menu
out/menu.json  ────────┼─→  print.mjs    fixed trim       a different medium
   (the contract)      ├─→  service.mjs  phone, on shift  internal
                       └─→  jsonld.mjs   data             for Google
```

## One rule

**The site owns the guest menu markup. Nothing else renders it.**

Mise's `out/guest.html` is a standalone preview — it exists so you can show the
GM the pipeline working without running the site, and so there's something to
turn into a PDF. It is not a second implementation to keep in sync. If you find
yourself editing both `DrinkMenu.jsx` and `src/render/guest.mjs` to make the
same change, delete one.

That's the same discipline the whole project is built on. Two renderers of one
dataset drift exactly like two copies of a menu drift.

## Three steps

**1. Copy the component in**

```bash
cp site-integration/DrinkMenu.jsx  ../parasol/src/components/
cp site-integration/DrinkMenu.css  ../parasol/src/components/
```

**2. Point Mise at the site and export**

In `.env`:

```
SITE_REPO=../parasol
```

Then:

```bash
npm run export:site
```

which copies `out/menu.json` to `$SITE_REPO/src/data/menu.json`. Commit it —
the data is part of the site's build, and committing it is what makes a rebuild
reproducible months later.

**3. Render it**

```jsx
import menu from '../data/menu.json';
import DrinkMenu from './DrinkMenu';

<section id="menu" className="page">
  <DrinkMenu
    menu={menu}
    heading="Drinks"
    sub="Wine, cocktails & more"
  />
</section>
```

## Styling

`DrinkMenu.css` reads the site's own tokens — `--ink`, `--ink-2`, `--line`,
`--accent`, `--font-display`, `--font-ui` — so it inherits the cream/ink
treatment instead of carrying a competing palette. The fallbacks in the file
only apply if it's mounted where those tokens don't exist.

It also uses the site's `.r-1` … `.r-6` reveal classes for the staggered entry,
so the menu animates in like every other section.

Two things worth checking against the existing menu section: the dotted leader
(`.dm-leader`) should match the rule weight already in use, and `--dm-col-w`
controls the Glass/Bottle column width — widen it if three-digit bottle prices
crowd.

## The JSON-LD

`out/head-snippet.html` is a ready `<script type="application/ld+json">` block.
Put it in the site's `index.html` head, or inject it with whatever head
management the site uses. Regenerate on every build.

## Keeping the preview honest

The studio's guest tab previews Mise's own `guest.html`, which approximates the
site rather than being it. Once the site exists, run its dev server and set:

```
SITE_DEV_URL=http://localhost:5173
```

The studio's guest tab then iframes the real site, so what you see while editing
copy is what ships.

## Why print isn't React

A printed menu has a fixed trim, type sized for candlelight, and no ability to
reflow. Its markup genuinely wants to be different from the web menu's — that's
not a compromise or a shortcut, it's the correct answer for a different medium.
`print.mjs` stays as it is.

Same for `service.mjs`: it's an internal reference read on a phone mid-shift.
There's no reason for it to carry a React runtime.
