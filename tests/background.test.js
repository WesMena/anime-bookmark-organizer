import { vi } from 'vitest';

describe('background.js', () => {
  let listeners;

  beforeEach(async () => {
    listeners = {};
    ['onCreated', 'onRemoved', 'onChanged', 'onMoved'].forEach((event) => {
      chrome.bookmarks[event].addListener.mockImplementation((fn) => {
        listeners[event] = fn;
      });
    });

    await chrome.storage.local.set({ selectedFolderId: 'folder-10' });

    // Re-import so addListener calls fire fresh each test
    vi.resetModules();
    await import('../background.js');
  });

  test('sets cacheStale=true when a bookmark is created in the watched folder', async () => {
    await listeners.onCreated('b1', { id: 'b1', parentId: 'folder-10', title: 'Test', url: 'https://example.com' });
    const { cacheStale } = await chrome.storage.local.get('cacheStale');
    expect(cacheStale).toBe(true);
  });

  test('does not set cacheStale when a bookmark is created in a different folder', async () => {
    await listeners.onCreated('b2', { id: 'b2', parentId: 'other-folder', title: 'Test', url: 'https://example.com' });
    const { cacheStale } = await chrome.storage.local.get('cacheStale');
    expect(cacheStale).toBeUndefined();
  });

  test('sets cacheStale=true when a bookmark is removed from the watched folder', async () => {
    await listeners.onRemoved('b1', { parentId: 'folder-10', index: 0 });
    const { cacheStale } = await chrome.storage.local.get('cacheStale');
    expect(cacheStale).toBe(true);
  });

  test('sets cacheStale=true when a bookmark is moved into the watched folder', async () => {
    await listeners.onMoved('b1', { parentId: 'folder-10', oldParentId: 'other', index: 0, oldIndex: 0 });
    const { cacheStale } = await chrome.storage.local.get('cacheStale');
    expect(cacheStale).toBe(true);
  });

  test('sets cacheStale=true when a bookmark is moved out of the watched folder', async () => {
    await listeners.onMoved('b1', { parentId: 'other', oldParentId: 'folder-10', index: 0, oldIndex: 0 });
    const { cacheStale } = await chrome.storage.local.get('cacheStale');
    expect(cacheStale).toBe(true);
  });

  test('sets cacheStale=true on onChanged node lookup failure (conservative fallback)', async () => {
    chrome.bookmarks.get.mockRejectedValue(new Error('not found'));
    await listeners.onChanged('b-gone', {});
    const { cacheStale } = await chrome.storage.local.get('cacheStale');
    expect(cacheStale).toBe(true);
  });
});
