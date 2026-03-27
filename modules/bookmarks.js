import { parseSeriesName } from './parser.js';

export class FolderNotFoundError extends Error {
  constructor(folderId) {
    super(`Bookmark folder not found: ${folderId}`);
    this.name = 'FolderNotFoundError';
  }
}

const ROOT_IDS = new Set(['1', '2', '3']);

/**
 * Returns all first-level subfolders from Chrome's three bookmark root nodes,
 * identified by their fixed IDs (locale-independent).
 *
 * @returns {Promise<Array<{id: string, title: string}>>}
 */
export async function getFolders() {
  const tree = await chrome.bookmarks.getTree();
  const folders = [];

  function walk(node) {
    if (ROOT_IDS.has(node.id)) {
      for (const child of (node.children ?? [])) {
        if (!child.url) folders.push({ id: child.id, title: child.title });
      }
    } else if (node.children) {
      for (const child of node.children) walk(child);
    }
  }

  for (const root of tree) walk(root);
  return folders;
}

/**
 * Returns all bookmark items directly inside folderId (non-recursive).
 * Throws FolderNotFoundError if the folder no longer exists.
 *
 * @param {string} folderId
 * @returns {Promise<Array<{id: string, title: string, url: string}>>}
 */
export async function getBookmarksInFolder(folderId) {
  let children;
  try {
    children = await chrome.bookmarks.getChildren(folderId);
  } catch {
    throw new FolderNotFoundError(folderId);
  }
  return children
    .filter(node => node.url)
    .map(node => ({ id: node.id, title: node.title, url: node.url }));
}

/**
 * Groups BookmarkItems by lowercased parsed series name.
 *
 * @param {Array<{id: string, title: string, url: string}>} bookmarks
 * @returns {Record<string, Array<{id: string, title: string, url: string}>>}
 */
export function groupBySeriesName(bookmarks) {
  const groups = {};
  for (const bookmark of bookmarks) {
    const key = parseSeriesName(bookmark.title).toLowerCase().trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(bookmark);
  }
  return groups;
}
