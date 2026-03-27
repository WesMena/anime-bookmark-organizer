export async function getSelectedFolderId() {
  const result = await chrome.storage.local.get('selectedFolderId');
  return result.selectedFolderId ?? null;
}

export async function setSelectedFolderId(id) {
  await chrome.storage.local.set({ selectedFolderId: id });
}

export async function getSeriesCache() {
  const result = await chrome.storage.local.get('seriesCache');
  return result.seriesCache ?? {};
}

export async function setSeriesCache(cache) {
  await chrome.storage.local.set({ seriesCache: cache });
}

export async function getCacheStale() {
  const result = await chrome.storage.local.get('cacheStale');
  return result.cacheStale ?? false;
}

export async function setCacheStale(stale) {
  await chrome.storage.local.set({ cacheStale: stale });
}
