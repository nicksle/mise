#!/usr/bin/env node
/**
 * studio.mjs — the editing UI. No terminal.
 *
 *   npm run studio        → http://localhost:4000
 *
 * Writes only to data/editorial.json, and commits each save if the repo is a
 * git checkout. Square stays read-only, which is the property that makes this
 * safe to point at a live restaurant.
 *
 * Sharing it with the GM or somm:
 *   STUDIO_PASSWORD=something npm run studio
 *   cloudflared tunnel --url http://localhost:4000
 * Send them the HTTPS URL and the password. See README for hosting it properly.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { ROOT, square as sq, site, publishing } from './config.mjs';
import { sync } from './sync.mjs';
import { build } from './build.mjs';

const PORT = Number(process.env.STUDIO_PORT || 4000);
const PASSWORD = process.env.STUDIO_PASSWORD || '';
const SECRET = randomBytes(32);          // sessions die with the process, by design
const EDITORIAL = join(ROOT, 'data', 'editorial.json');
const MENU = join(ROOT, 'out', 'menu.json');

/* fields the studio owns. Everything else comes from Square and is read-only. */
const EDITABLE = [
  'menu_name', 'description', 'allergens',
  'service_note', 'pairing', 'sort_index',
];

const readJson = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fb);
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

/* ---------- auth: one shared password, adequate behind a tunnel ---------- */

const tokenFor = () => createHmac('sha256', SECRET).update('ok').digest('hex');
const authed = req => {
  if (!PASSWORD) return true;                       // no password set = open
  const m = /studio=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(tokenFor());
  return a.length === b.length && timingSafeEqual(a, b);
};

/* ---------- git: every save is a commit, so history and reprints work ------ */

function commit(message) {
  try {
    execFileSync('git', ['add', 'data/editorial.json'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.email=studio@mise', '-c', 'user.name=Mise Studio',
      'commit', '-m', message], { cwd: ROOT, stdio: 'ignore' });
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  } catch { return null; }   // not a git checkout, or nothing changed
}

/* ---------- merge menu.json with the editorial layer for the UI ---------- */

function state() {
  const editorial = readJson(EDITORIAL, { sections: {}, items: {} });
  const menu = readJson(MENU, null);
  if (!menu) return { ready: false, items: [], stats: null, env: sq.env, siteDevUrl: site.devUrl };

  /* Which menus each section reaches. A section can be on more than one —
     that is the whole point of composition — so this is a list, not a value. */
  const menuSlugsBySection = new Map();
  for (const m of menu.menus || []) {
    for (const sec of m.sections) {
      if (!menuSlugsBySection.has(sec.name)) menuSlugsBySection.set(sec.name, []);
      menuSlugsBySection.get(sec.name).push(m.slug);
    }
  }

  const items = menu.sections.flatMap(s => s.items.map(i => ({
    id: i.id,
    section: s.name,
    /* The resolved guest-facing name, whichever layer supplied it. Food gets
       its copy from Square's custom attributes, so an editorial-only view of
       the name shows nothing for half the catalog. */
    menuName: i.menuName,
    menus: menuSlugsBySection.get(s.name) || [],
    isWine: !!i.isWine,
    /* from Square — shown, never written */
    square: {
      posName: i.posName,
      price: i.kind === 'pour' ? null : i.price,
      glass: i.glass ?? null,
      bottle: i.bottle ?? null,
      available: i.available,
      glassAvailable: i.glassAvailable ?? null,
      bottleAvailable: i.bottleAvailable ?? null,
      stock: i.stock,
      vintage: i.vintage,
      vintageConfirmed: i.vintageConfirmed,
      vintageAgeMonths: i.vintageAgeMonths,
      staleVintage: i.staleVintage,
      kind: i.kind,
    },
    /* the repo layer — this is what the studio writes */
    editorial: Object.fromEntries(EDITABLE.map(k => [k, editorial.items[i.id]?.[k] ?? ''])),
    /* What is live right now, whichever layer supplied it. The editor shows
       THIS, so the box you type in holds the words currently on the menu
       rather than sitting empty next to a name you can see on the page. */
    effective: { menu_name: i.menuName, description: i.description, allergens: i.allergens },
    needsReview: i.needsReview,
    /* Which layer actually supplied the guest-facing name, and whether the
       other one also holds a value — the studio should never let you type
       into a field that silently loses. */
    copyFrom: i.copyFrom || 'none',
    squareHasName: !!i.squareHasName,
    squareOwnsCopy: i.copyFrom === 'square',
  })));

  const menus = (menu.menus || []).map(m => ({
    slug: m.slug,
    name: m.name,
    sections: m.sections.map(sec => sec.name),
    count: m.sections.reduce((t, sec) => t + sec.items.length, 0),
  }));

  return { ready: true, env: sq.env, siteDevUrl: site.devUrl,
           copyOwner: publishing.copyOwner,
           stats: menu.stats, generatedAt: menu.generatedAt,
           warnings: menu.warnings || [], menus, items };
}

/* ---------- rebuild ---------- */

let mock = null;

const seedHash = () => createHash('md5')
  .update(readFileSync(join(ROOT, 'scripts', 'mock-catalog.json')))
  .digest('hex').slice(0, 12);

async function ensureMock() {
  if (sq.env !== 'mock' || mock) return;

  /* Something may already be on the port — a mock left over from an earlier
     session, holding the catalog as it was when IT booted. Syncing against
     that produces a menu that disagrees with your files for no visible
     reason, so check before trusting it. */
  const info = await fetch(`${sq.base}/_mock/info`)
    .then(r => r.json()).catch(() => null);

  if (info) {
    const want = seedHash();
    if (info.seedHash === want) return;             // same fixture — fine to reuse
    console.error(`\n  ✗ A mock server is already running on this port and it is STALE.`);
    console.error(`      it loaded : ${info.seedHash}  (started ${info.startedAt})`);
    console.error(`      on disk   : ${want}`);
    console.error(`    It will serve the old catalog and the menu will disagree with your files.`);
    console.error(`    Stop it and start again:  pkill -f mock-square.mjs\n`);
    process.exit(1);
  }

  mock = spawn(process.execPath, [join(ROOT, 'scripts', 'mock-square.mjs')],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () => { try { mock?.kill(); } catch {} };
  process.on('exit', stop);
  /* exit handlers don't run on a signal, which is how orphans accumulate. */
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(sig, () => { stop(); process.exit(0); });
}

async function rebuild() {
  await ensureMock();
  await new Promise(r => setTimeout(r, mock ? 700 : 0));
  const menu = await sync({ quiet: true });
  build();
  return menu.stats;
}

/* A stale studio is the single most confusing failure mode here: node holds
   the modules it loaded at boot, so edited source has no effect until restart,
   and the editor and the rendered menu drift apart. `npm run studio` runs
   under --watch so that cannot happen; this stamp makes it visible either way. */
function sourceStamp() {
  const dir = join(ROOT, 'src');
  const files = readdirSync(dir, { withFileTypes: true })
    .flatMap(d => d.isDirectory()
      ? readdirSync(join(dir, d.name)).map(n => join(dir, d.name, n))
      : [join(dir, d.name)]);
  const newest = Math.max(...files.map(f => statSync(f).mtimeMs));
  return new Date(newest).toISOString().replace('T', ' ').slice(0, 19);
}

/* ---------- server ---------- */

const UI = () => readFileSync(join(ROOT, 'src', 'studio-ui.html'), 'utf8');

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  /* login */
  if (p === '/login' && req.method === 'POST') {
    let raw = ''; for await (const c of req) raw += c;
    const { password } = JSON.parse(raw || '{}');
    if (!PASSWORD || password === PASSWORD) {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': `studio=${tokenFor()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      });
      return res.end('{"ok":true}');
    }
    return send(res, 401, { error: 'wrong password' });
  }

  if (p === '/' ) {
    if (!authed(req)) return send(res, 200, LOGIN_PAGE, 'text/html; charset=utf-8');
    return send(res, 200, UI(), 'text/html; charset=utf-8');
  }

  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });

  if (p === '/api/state') return send(res, 200, state());

  if (p === '/api/rebuild' && req.method === 'POST') {
    try { return send(res, 200, { ok: true, stats: await rebuild() }); }
    catch (e) { return send(res, 200, { ok: false, error: e.message, problems: e.problems || [] }); }
  }

  if (p.startsWith('/api/item/') && req.method === 'PUT') {
    let raw = ''; for await (const c of req) raw += c;
    const id = decodeURIComponent(p.slice('/api/item/'.length));
    const patch = JSON.parse(raw || '{}');

    const editorial = readJson(EDITORIAL, { sections: {}, items: {} });
    const entry = editorial.items[id] || {};
    for (const k of EDITABLE) {
      if (!(k in patch)) continue;
      const v = k === 'sort_index'
        ? (patch[k] === '' ? undefined : Number(patch[k]))
        : String(patch[k]).trim();
      if (v === '' || v === undefined || Number.isNaN(v)) delete entry[k];
      else entry[k] = v;
    }
    if (Object.keys(entry).length) editorial.items[id] = entry;
    else delete editorial.items[id];

    writeFileSync(EDITORIAL, JSON.stringify(editorial, null, 2) + '\n');
    const sha = commit(`studio: ${patch.menu_name || id}`);
    return send(res, 200, { ok: true, commit: sha });
  }

  /* preview the generated pages */
  if (p.startsWith('/preview/')) {
    const f = join(ROOT, 'out', p.slice('/preview/'.length).replace(/\.\./g, ''));
    if (!existsSync(f)) return send(res, 404, '<p>Not built yet — hit Rebuild.</p>', 'text/html');
    const type = extname(f) === '.json' ? 'application/json' : 'text/html; charset=utf-8';
    return send(res, 200, readFileSync(f, 'utf8'), type);
  }

  send(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`\n  Mise Studio  →  http://localhost:${PORT}`);
  console.log(`  source build: ${sourceStamp()}`);
  console.log(`  source: ${sq.env}${sq.env === 'mock' ? '  (mock POS starts automatically)' : ''}`);
  if (!PASSWORD) {
    console.log(`\n  ⚠  No STUDIO_PASSWORD set — anyone who can reach this port can edit.`);
    console.log(`     Before sharing it:  STUDIO_PASSWORD=something npm run studio`);
  }
  console.log(`\n  To let the GM in:  cloudflared tunnel --url http://localhost:${PORT}\n`);
});

const LOGIN_PAGE = `<!doctype html><meta charset="utf-8">
<title>Mise Studio</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 :root{--paper:#FAFAF7;--ink:#191A18;--ink2:#55584F;--rule:#DEE0D8;--accent:#2E4E6B}
 @media(prefers-color-scheme:dark){:root{--paper:#101210;--ink:#E9EBE5;--ink2:#AAB0A6;--rule:#2E332E;--accent:#86AECE}}
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);
      font-family:Archivo,system-ui,sans-serif}
 form{width:min(320px,86vw);display:grid;gap:12px}
 h1{margin:0 0 4px;font-size:1.4rem;letter-spacing:-.02em}
 p{margin:0 0 10px;color:var(--ink2);font-size:.88rem}
 input,button{font:inherit;padding:11px 13px;border-radius:3px;border:1px solid var(--rule)}
 input{background:transparent;color:var(--ink)}
 button{background:var(--accent);color:var(--paper);border:none;font-weight:600;cursor:pointer}
 .err{color:#A83A26;font-size:.85rem;min-height:1.2em}
</style>
<form onsubmit="go(event)">
 <div><h1>Mise Studio</h1><p>Parasol menu editor</p></div>
 <input id=p type=password placeholder="Password" autofocus>
 <button>Enter</button>
 <div class=err id=e></div>
</form>
<script>
async function go(ev){ev.preventDefault();
 const r=await fetch('/login',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({password:document.getElementById('p').value})});
 if(r.ok) location.reload(); else document.getElementById('e').textContent='Wrong password.';}
</script>`;
