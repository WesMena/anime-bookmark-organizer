import * as storage from './modules/storage.js';
import {
  getBookmarksInFolder, getFolders, groupBySeriesName, FolderNotFoundError,
} from './modules/bookmarks.js';
import { parseSeriesName } from './modules/parser.js';
import { JikanClient } from './modules/jikan.js';

const jikan = new JikanClient();

const KNOWN_SITES = {
  'crunchyroll.com': 'Crunchyroll',
  'funimation.com': 'Funimation',
  'hidive.com': 'HiDive',
  'netflix.com': 'Netflix',
  'jkanime.net': 'JkAnime',
  'animeflv.net': 'AnimeFLV',
  'bilibili.com': 'Bilibili',
};

/**
 * Returns a human-readable site name from a bookmark URL.
 * Falls back to the bare hostname for unknown sites.
 *
 * @param {string} url
 * @returns {string}
 */
export function getSiteName(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return KNOWN_SITES[hostname] ?? hostname;
  } catch {
    return '';
  }
}

/**
 * Merges grouped bookmarks with the cache to produce render-ready entries.
 * Only returns entries for series already in the cache (matched series).
 *
 * @param {Record<string, Array>} grouped
 * @param {Record<string, object>} cache
 * @returns {Record<string, object>}
 */
export function buildSeriesEntries(grouped, cache) {
  const entries = {};
  for (const key of Object.keys(grouped)) {
    if (cache[key]) entries[key] = { ...cache[key], bookmarks: grouped[key] };
  }
  return entries;
}

/**
 * Reconciles the cache with the current folder contents:
 * removes stale series, updates bookmark arrays for unchanged series,
 * fetches Jikan meta for new series, then persists and clears cacheStale.
 *
 * @param {Record<string, Array>} grouped  Live grouped bookmarks from folder
 * @param {Record<string, object>} cache   Current cache (mutated in place)
 * @param {(key: string) => Promise<object|null>} fetchFn  Called with the series key for new series
 */
export async function resolveStaleCache(grouped, cache, fetchFn) {
  const liveKeys = new Set(Object.keys(grouped));
  const cachedKeys = new Set(Object.keys(cache).filter(k => k !== '__unmatched__'));

  // Remove series no longer in folder
  for (const key of cachedKeys) {
    if (!liveKeys.has(key)) delete cache[key];
  }

  // Update bookmarks for unchanged series
  for (const key of liveKeys) {
    if (cachedKeys.has(key)) cache[key] = { ...cache[key], bookmarks: grouped[key] };
  }

  // Fetch Jikan meta for new series
  for (const key of liveKeys) {
    if (!cachedKeys.has(key)) {
      const meta = await fetchFn(key);
      if (meta) cache[key] = { ...meta, bookmarks: grouped[key] };
    }
  }

  delete cache['__unmatched__'];
  await storage.setSeriesCache(cache);
  await storage.setCacheStale(false);
}
