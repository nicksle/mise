/**
 * square.mjs — a small REST client. No SDK, so there is no SDK version to rot.
 *
 * Reads only. The pipeline never writes to the catalog; that is what keeps it
 * safe to point at a live restaurant.
 */

import { square as cfg } from './config.mjs';

export async function api(path, opts = {}) {
  const res = await fetch(cfg.base + path, {
    ...opts,
    headers: {
      'Square-Version': cfg.version,
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (body.errors || []).map(e => `${e.code}: ${e.detail}`).join('; ');
    const err = new Error(`Square ${res.status} on ${path} — ${detail || 'unknown error'}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function listLocations() {
  const { locations = [] } = await api('/v2/locations');
  return locations;
}

/** Resolve which location's sold_out overrides we care about. */
export async function resolveLocation() {
  if (cfg.locationId) return cfg.locationId;
  const locations = await listLocations();
  const active = locations.find(l => l.status === 'ACTIVE') || locations[0];
  if (!active) throw new Error('No locations on this Square account.');
  return active.id;
}

/**
 * Pull the whole catalog. For a restaurant this is small enough to fetch
 * entirely; the incremental path below is what the webhook uses.
 */
export async function listCatalog(types = 'ITEM,CATEGORY,CUSTOM_ATTRIBUTE_DEFINITION') {
  let cursor, all = [];
  do {
    const q = new URLSearchParams({ types });
    if (cursor) q.set('cursor', cursor);
    const page = await api(`/v2/catalog/list?${q}`);
    all = all.concat(page.objects || []);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

/**
 * Incremental fetch. The catalog.version.updated webhook deliberately does not
 * say WHAT changed — only that something did — so the correct response is to
 * ask for everything modified since the timestamp we last recorded ourselves.
 * Square's docs are explicit that you should trust your own stored value over
 * the webhook's, to avoid clock skew losing an update.
 */
export async function searchSince(beginTime, types = ['ITEM', 'CATEGORY']) {
  let cursor, all = [], latest = beginTime;
  do {
    const body = {
      object_types: types,
      include_deleted_objects: true,
      include_related_objects: true,
      ...(beginTime ? { begin_time: beginTime } : {}),
      ...(cursor ? { cursor } : {}),
    };
    const page = await api('/v2/catalog/search', { method: 'POST', body: JSON.stringify(body) });
    all = all.concat(page.objects || [], page.related_objects || []);
    if (page.latest_time) latest = page.latest_time;
    cursor = page.cursor;
  } while (cursor);
  return { objects: all, latestTime: latest };
}

/** In-stock counts, for bottle-only wines and anything with track_inventory. */
export async function inventoryCounts(variationIds, locationId) {
  if (!variationIds.length) return {};
  const out = {};
  for (let i = 0; i < variationIds.length; i += 100) {
    const body = {
      catalog_object_ids: variationIds.slice(i, i + 100),
      location_ids: [locationId],
      states: ['IN_STOCK'],
    };
    let res;
    try {
      res = await api('/v2/inventory/counts/batch-retrieve', {
        method: 'POST', body: JSON.stringify(body),
      });
    } catch {
      return out; // inventory not enabled on this account; not fatal
    }
    for (const c of res.counts || []) {
      out[c.catalog_object_id] = Number(c.quantity);
    }
  }
  return out;
}
