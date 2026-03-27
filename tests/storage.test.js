import {
  getSelectedFolderId, setSelectedFolderId,
  getSeriesCache, setSeriesCache,
  getCacheStale, setCacheStale,
} from '../modules/storage.js';

describe('storage', () => {
  describe('selectedFolderId', () => {
    test('returns null when never set', async () => {
      expect(await getSelectedFolderId()).toBeNull();
    });

    test('returns stored value after set', async () => {
      await setSelectedFolderId('folder-123');
      expect(await getSelectedFolderId()).toBe('folder-123');
    });
  });

  describe('seriesCache', () => {
    test('returns empty object when never set', async () => {
      expect(await getSeriesCache()).toEqual({});
    });

    test('returns stored cache after set', async () => {
      const cache = { 'one piece': { malId: 21, title: 'One Piece', imageUrl: null, bookmarks: [] } };
      await setSeriesCache(cache);
      expect(await getSeriesCache()).toEqual(cache);
    });
  });

  describe('cacheStale', () => {
    test('returns false when never set', async () => {
      expect(await getCacheStale()).toBe(false);
    });

    test('returns true after being set to true', async () => {
      await setCacheStale(true);
      expect(await getCacheStale()).toBe(true);
    });
  });
});
