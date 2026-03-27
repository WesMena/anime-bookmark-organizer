import { vi } from 'vitest';
import { getSiteName, buildSeriesEntries, resolveStaleCache } from '../newtab.js';
import * as storage from '../modules/storage.js';

const bm = (id, title, url) => ({ id, title, url });

describe('getSiteName', () => {
  test.each([
    ['https://crunchyroll.com/watch/xxx', 'Crunchyroll'],
    ['https://www.crunchyroll.com/watch/xxx', 'Crunchyroll'],
    ['https://jkanime.net/one-piece/1100', 'JkAnime'],
    ['https://animeflv.net/ver/one-piece-1100', 'AnimeFLV'],
    ['https://funimation.com/v/one-piece/ep-1100', 'Funimation'],
    ['https://hidive.com/stream/xxx', 'HiDive'],
  ])('%s → %s', (url, expected) => {
    expect(getSiteName(url)).toBe(expected);
  });

  test('falls back to bare hostname for unknown sites', () => {
    expect(getSiteName('https://somesite.net/anime/1')).toBe('somesite.net');
  });

  test('returns empty string for invalid URL', () => {
    expect(getSiteName('not-a-url')).toBe('');
  });
});

describe('buildSeriesEntries', () => {
  const grouped = {
    'one piece': [bm('b1', 'One Piece Episode 1100 - Crunchyroll', 'https://crunchyroll.com/1')],
    'demon slayer': [bm('b2', 'Demon Slayer S03E04', 'https://crunchyroll.com/2')],
  };
  const cache = {
    'one piece': { malId: 21, title: 'One Piece', imageUrl: 'https://cdn.mal.net/op.jpg', bookmarks: [] },
  };

  test('returns entry for cached series with bookmarks from grouped', () => {
    const entries = buildSeriesEntries(grouped, cache);
    expect(entries['one piece'].title).toBe('One Piece');
    expect(entries['one piece'].bookmarks).toHaveLength(1);
    expect(entries['one piece'].bookmarks[0].id).toBe('b1');
  });

  test('omits uncached series (those become unmatched)', () => {
    const entries = buildSeriesEntries(grouped, cache);
    expect(entries['demon slayer']).toBeUndefined();
  });
});

describe('resolveStaleCache', () => {
  const grouped = {
    'one piece': [bm('b1', 'One Piece Episode 1100 - Crunchyroll', 'https://crunchyroll.com/1')],
    'demon slayer': [bm('b2', 'Demon Slayer S03E04', 'https://crunchyroll.com/2')],
  };

  test('removes series no longer in the folder from cache', async () => {
    const cache = {
      'one piece': { malId: 21, title: 'One Piece', imageUrl: null, bookmarks: [] },
      'bleach': { malId: 269, title: 'Bleach', imageUrl: null, bookmarks: [] },
    };
    await resolveStaleCache(grouped, cache, async () => null);
    const updated = await storage.getSeriesCache();
    expect(updated['bleach']).toBeUndefined();
  });

  test('updates bookmarks array for series still present', async () => {
    const cache = {
      'one piece': { malId: 21, title: 'One Piece', imageUrl: null, bookmarks: [] },
    };
    await resolveStaleCache(grouped, cache, async () => null);
    const updated = await storage.getSeriesCache();
    expect(updated['one piece'].bookmarks).toHaveLength(1);
    expect(updated['one piece'].bookmarks[0].id).toBe('b1');
  });

  test('calls fetchFn for new series and adds meta to cache', async () => {
    const cache = {
      'one piece': { malId: 21, title: 'One Piece', imageUrl: null, bookmarks: [] },
    };
    const fetchFn = vi.fn().mockResolvedValue({ malId: 269, title: 'Demon Slayer', imageUrl: null });
    await resolveStaleCache(grouped, cache, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('demon slayer');
    const updated = await storage.getSeriesCache();
    expect(updated['demon slayer']?.malId).toBe(269);
  });

  test('does not persist __unmatched__ to storage', async () => {
    const cache = { '__unmatched__': { malId: null, title: 'Unmatched', imageUrl: null, bookmarks: [] } };
    await resolveStaleCache(grouped, cache, async () => null);
    const updated = await storage.getSeriesCache();
    expect(updated['__unmatched__']).toBeUndefined();
  });

  test('sets cacheStale to false after resolution', async () => {
    await storage.setCacheStale(true);
    await resolveStaleCache(grouped, {}, async () => null);
    expect(await storage.getCacheStale()).toBe(false);
  });
});
