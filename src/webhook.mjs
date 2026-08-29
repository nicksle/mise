#!/usr/bin/env node
/**
 * webhook.mjs — receives catalog.version.updated and rebuilds.
 *
 * Three things this gets right that a naive handler doesn't:
 *
 *  1. Signature verification. Square signs with HMAC-SHA256 over
 *     (notification URL + raw body). Verify before trusting anything, and
 *     compare in constant time.
 *
 *  2. Respond 2xx immediately, work afterwards. Square retries failures for
 *     24 hours with exponential backoff; a slow handler looks like a failure.
 *
 *  3. Debounce. A manager editing five items fires five events. Without a
 *     debounce you get five rebuilds, and they race each other.
 *
 * The payload deliberately does NOT say what changed — only that something
 * did — so the response is always "re-sync from my own last timestamp".
 */

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { webhook as cfg } from './config.mjs';
import { sync } from './sync.mjs';
import { build } from './build.mjs';

function verify(rawBody, signature) {
  if (!cfg.signatureKey) {
    console.warn('  ⚠ SQUARE_WEBHOOK_SIGNATURE_KEY unset — skipping verification (dev only)');
    return true;
  }
  if (!signature) return false;
  const expected = createHmac('sha256', cfg.signatureKey)
    .update(cfg.notificationUrl + rawBody)
    .digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

let timer = null;
let running = false;
let queued = false;

async function rebuild() {
  if (running) { queued = true; return; }
  running = true;
  try {
    await sync();
    build();
    await dispatchToGitHub();
  } catch (e) {
    // A failed sanity check must not publish. Keep the last good build.
    console.error(`  rebuild aborted: ${e.message}`);
    console.error('  the previously published output is untouched');
  } finally {
    running = false;
    if (queued) { queued = false; rebuild(); }
  }
}

/** Optional: hand off to CI so the static site actually redeploys. */
async function dispatchToGitHub() {
  if (!cfg.githubRepo || !cfg.githubToken) return;
  const res = await fetch(`https://api.github.com/repos/${cfg.githubRepo}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.githubToken}`,
      'Accept': 'application/vnd.github+json',
    },
    body: JSON.stringify({ event_type: 'menu-changed' }),
  });
  console.log(`  repository_dispatch → ${res.status}`);
}

createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    if (!verify(raw, req.headers['x-square-hmacsha256-signature'])) {
      console.warn('  ✗ bad signature — ignoring');
      res.writeHead(403).end();
      return;
    }

    let event = {};
    try { event = JSON.parse(raw); } catch {}

    // Acknowledge first. Always.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');

    if (event.type !== 'catalog.version.updated') return;
    console.log(`  ← ${event.type} at ${event.data?.object?.catalog_version?.updated_at || '?'}`);

    clearTimeout(timer);
    timer = setTimeout(rebuild, cfg.debounceMs);
    console.log(`    debouncing ${cfg.debounceMs}ms…`);
  });
}).listen(cfg.port, () => {
  console.log(`\n  webhook listener on :${cfg.port}`);
  console.log(`  expose it with:  cloudflared tunnel --url http://localhost:${cfg.port}`);
  console.log(`  then register that HTTPS URL in Developer Console → Webhooks`);
  console.log(`  and subscribe to catalog.version.updated\n`);
  if (!cfg.signatureKey) console.log('  (set SQUARE_WEBHOOK_SIGNATURE_KEY before pointing this at anything real)\n');
});
