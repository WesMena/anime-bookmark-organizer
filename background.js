import { getSelectedFolderId, setCacheStale } from './modules/storage.js';

async function markStale() {
  await setCacheStale(true);
}

async function isWatchedFolder(parentId) {
  const folderId = await getSelectedFolderId();
  return folderId !== null && parentId === folderId;
}

chrome.bookmarks.onCreated.addListener(async (id, node) => {
  if (await isWatchedFolder(node.parentId)) await markStale();
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  if (await isWatchedFolder(removeInfo.parentId)) await markStale();
});

chrome.bookmarks.onChanged.addListener(async (id) => {
  try {
    const [node] = await chrome.bookmarks.get(id);
    if (await isWatchedFolder(node.parentId)) await markStale();
  } catch {
    // Node deleted or lookup failed — conservatively mark stale
    await markStale();
  }
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  const folderId = await getSelectedFolderId();
  if (folderId === null) return;
  if (moveInfo.parentId === folderId || moveInfo.oldParentId === folderId) await markStale();
});
