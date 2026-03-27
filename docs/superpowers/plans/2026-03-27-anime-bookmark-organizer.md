# Anime Bookmark Organizer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Extension (Manifest V3) that overrides the new tab page to display anime bookmarks organized by series, with cover art from MyAnimeList via the Jikan API.

**Architecture:** Vanilla JS ES modules, no bundler. Four domain modules (`parser`, `storage`, `bookmarks`, `jikan`) plus `newtab.js` (orchestration + DOM rendering) and `background.js` (service worker). Vitest with jsdom and a global Chrome API mock handles all unit tests.

**Tech Stack:** Vanilla JavaScript (ES modules), Chrome Extension Manifest V3, Jikan API v4, Vitest 2.x, jsdom.

---

## File Map

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config; declares new tab override and background service worker |
| `newtab.html` | New tab page shell; minimal HTML anchors for JS to populate |
| `newtab.js` | Orchestration entry point and all DOM rendering |
| `background.js` | Service worker; watches bookmark events, sets `cacheStale` flag |
| `modules/parser.js` | Pure function: strips noise from bookmark title → clean series name |
| `modules/storage.js` | Async wrappers over `chrome.storage.local` |
| `modules/bookmarks.js` | `getFolders`, `getBookmarksInFolder`, `groupBySeriesName` |
| `modules/jikan.js` | `JikanClient`: rate-limited fetch, retries, tv/ONA fallback search |
| `styles/newtab.css` | New tab page styles |
| `tests/setup.js` | Global Chrome API mock for Vitest |
| `tests/parser.test.js` | Unit tests for `parser.js` |
| `tests/storage.test.js` | Unit tests for `storage.js` |
| `tests/bookmarks.test.js` | Unit tests for `bookmarks.js` |
| `tests/jikan.test.js` | Unit tests for `jikan.js` |
| `tests/background.test.js` | Unit tests for `background.js` |
| `tests/newtab.test.js` | Unit tests for `newtab.js` logic (stale cache, site name, entry building) |
| `package.json` | devDependencies: vitest, jsdom |
| `vitest.config.js` | Vitest config: jsdom env, global Chrome mock setup file |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `tests/setup.js`
- Create: `manifest.json`
- Create: `newtab.html`
- Create: all placeholder source files

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "anime-bookmark-organizer",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/wesmena/anime-bookmark-organizer && npm install`

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
  },
});
```

- [ ] **Step 4: Create `tests/setup.js`** — global Chrome API mock

```js
import { vi, beforeEach } from 'vitest';

let _storageData = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  bookmarks: {
    getTree: vi.fn(),
    getChildren: vi.fn(),
    get: vi.fn(),
    onCreated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
    onChanged: { addListener: vi.fn() },
    onMoved: { addListener: vi.fn() },
  },
};

function attachStorageImpl() {
  chromeMock.storage.local.get.mockImplementation(async (keys) => {
    if (typeof keys === 'string') return { [keys]: _storageData[keys] };
    const result = {};
    const keyList = Array.isArray(keys) ? keys : Object.keys(keys);
    for (const key of keyList) result[key] = _storageData[key];
    return result;
  });
  chromeMock.storage.local.set.mockImplementation(async (items) => {
    Object.assign(_storageData, items);
  });
}

globalThis.chrome = chromeMock;
attachStorageImpl();

beforeEach(() => {
  _storageData = {};
  vi.clearAllMocks();
  attachStorageImpl();
});
```

- [ ] **Step 5: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Anime Bookmark Organizer",
  "version": "0.1.0",
  "description": "Organize your anime bookmarks by series using MyAnimeList",
  "permissions": ["bookmarks", "storage"],
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

- [ ] **Step 6: Create `newtab.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Anime</title>
  <link rel="stylesheet" href="styles/newtab.css">
</head>
<body>
  <header id="topbar">
    <span class="app-title">Anime</span>
    <select id="folder-select"></select>
    <span id="bookmark-count"></span>
  </header>
  <div id="main">
    <nav id="sidebar"></nav>
    <main id="detail"></main>
  </div>
  <script type="module" src="newtab.js"></script>
</body>
</html>
```

- [ ] **Step 7: Create placeholder source files**

Run:
```bash
mkdir -p modules styles tests
touch modules/parser.js modules/storage.js modules/bookmarks.js modules/jikan.js
touch newtab.js background.js styles/newtab.css
touch tests/parser.test.js tests/storage.test.js tests/bookmarks.test.js
touch tests/jikan.test.js tests/background.test.js tests/newtab.test.js
```

- [ ] **Step 8: Verify test runner starts with zero errors**

Run: `npm test`

Expected: 0 tests collected, no import errors. If there are errors, ensure all files from Step 7 exist.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: project scaffold — vitest, manifest, html shell, placeholder modules"
```

---

## Task 2: `modules/parser.js`

**Files:**
- Modify: `tests/parser.test.js`
- Modify: `modules/parser.js`

- [ ] **Step 1: Write failing tests**

File: `tests/parser.test.js`

```js
import { parseSeriesName } from '../modules/parser.js';

describe('parseSeriesName', () => {
  test('strips English episode marker and site name after dash', () => {
    expect(parseSeriesName('One Piece Episode 1100 - Crunchyroll')).toBe('One Piece');
  });

  test('strips English site name after pipe', () => {
    expect(parseSeriesName('Demon Slayer: Kimetsu no Yaiba S03E04 | Crunchyroll'))
      .toBe('Demon Slayer: Kimetsu no Yaiba');
  });

  test('strips Sub Español tag and site name', () => {
    expect(parseSeriesName('Sakamoto Days Part 2 4 Sub Español Online gratis — JkAnime'))
      .toBe('Sakamoto Days Part 2');
  });

  test('strips Sub Latino tag', () => {
    expect(parseSeriesName('Naruto 200 Sub Latino — JkAnime')).toBe('Naruto');
  });

  test('strips Episodio marker', () => {
    expect(parseSeriesName('Yofukashi no Uta Season 2 Episodio 8 Sub Español - AnimeFLV'))
      .toBe('Yofukashi no Uta Season 2');
  });

  test('strips compact SxxExx format', () => {
    expect(parseSeriesName('Attack on Titan S04E28')).toBe('Attack on Titan');
  });

  test('strips trailing standalone number', () => {
    expect(parseSeriesName('Rascal Does Not Dream of Santa Claus 1'))
      .toBe('Rascal Does Not Dream of Santa Claus');
  });

  test('preserves Season N', () => {
    expect(parseSeriesName('Yofukashi no Uta Season 2 Episode 5'))
      .toBe('Yofukashi no Uta Season 2');
  });

  test('preserves Part N', () => {
    expect(parseSeriesName('Sakamoto Days Part 2 Episode 4')).toBe('Sakamoto Days Part 2');
  });

  test('handles title with no noise', () => {
    expect(parseSeriesName('One Piece')).toBe('One Piece');
  });

  test('trims trailing punctuation', () => {
    expect(parseSeriesName('One Piece - ')).toBe('One Piece');
  });

  test('strips Ep. format', () => {
    expect(parseSeriesName('One Piece Ep. 1100')).toBe('One Piece');
  });

  test('strips AnimeFLV site name after Sub Español', () => {
    expect(parseSeriesName('One Piece Episodio 1100 Sub Español - AnimeFLV')).toBe('One Piece');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/parser.test.js`

Expected: FAIL with "parseSeriesName is not a function" or similar.

- [ ] **Step 3: Implement `modules/parser.js`**

```js
const SITE_NAMES = [
  'Crunchyroll', 'Funimation', 'HiDive', 'Netflix', 'Bilibili', 'AnimeFLV', 'JkAnime',
];

const sitePattern = new RegExp(
  `\\s*[–—\\-|]\\s*(${SITE_NAMES.join('|')}).*`,
  'i'
);

/**
 * Strips streaming site tags and episode markers from a bookmark title,
 * returning a clean series name suitable for MAL/Jikan search.
 * "Season N" and "Part N" are preserved — MAL treats these as distinct entries.
 *
 * @param {string} title
 * @returns {string}
 */
export function parseSeriesName(title) {
  let s = title;

  // 1. Strip Spanish streaming tags (everything from "Sub Español/Latino" onward)
  s = s.replace(/\s+Sub\s+(Español|Latino).*/i, '');

  // 2. Strip known English site names after a dash, pipe, or em-dash
  s = s.replace(sitePattern, '');

  // 3. Strip episode markers: "Episode N", "Ep. N", "Ep N" (English)
  s = s.replace(/\s+Ep(?:isode)?\.?\s+\d+/i, '');

  // 4. Strip episode markers: "Episodio N" (Spanish)
  s = s.replace(/\s+Episodio\s+\d+/i, '');

  // 5. Strip compact format S##E##
  s = s.replace(/\s+S\d{1,2}E\d{1,2}/i, '');

  // 6. Strip trailing standalone number
  s = s.replace(/\s+\d+\s*$/, '');

  // 7. Trim trailing punctuation and whitespace
  s = s.replace(/[\s\-|–—:]+$/, '').trim();

  return s;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/parser.test.js`

Expected: PASS — all 13 tests green.

- [ ] **Step 5: Commit**

```bash
git add modules/parser.js tests/parser.test.js
git commit -m "feat: implement parser — strip episode markers and site names from bookmark titles"
```

---

## Task 3: `modules/storage.js`

**Files:**
- Modify: `tests/storage.test.js`
- Modify: `modules/storage.js`

- [ ] **Step 1: Write failing tests**

File: `tests/storage.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/storage.test.js`

Expected: FAIL

- [ ] **Step 3: Implement `modules/storage.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/storage.test.js`

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add modules/storage.js tests/storage.test.js
git commit -m "feat: implement storage — chrome.storage.local wrappers"
```

---

## Task 4: `modules/bookmarks.js`

**Files:**
- Modify: `tests/bookmarks.test.js`
- Modify: `modules/bookmarks.js`

- [ ] **Step 1: Write failing tests**

File: `tests/bookmarks.test.js`

```js
import { getFolders, getBookmarksInFolder, groupBySeriesName, FolderNotFoundError } from '../modules/bookmarks.js';

const mockTree = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks bar',
        children: [
          { id: '10', title: 'Anime Pendiente', children: [] },
          { id: '11', title: 'Work', children: [] },
        ],
      },
      {
        id: '2',
        title: 'Other bookmarks',
        children: [
          { id: '20', title: 'Misc', children: [] },
        ],
      },
      { id: '3', title: 'Mobile bookmarks', children: [] },
    ],
  },
];

describe('getFolders', () => {
  test('returns first-level subfolders from root node IDs 1, 2, 3', async () => {
    chrome.bookmarks.getTree.mockResolvedValue(mockTree);
    const folders = await getFolders();
    expect(folders).toEqual([
      { id: '10', title: 'Anime Pendiente' },
      { id: '11', title: 'Work' },
      { id: '20', title: 'Misc' },
    ]);
  });

  test('does not include the root nodes themselves (IDs 1, 2, 3)', async () => {
    chrome.bookmarks.getTree.mockResolvedValue(mockTree);
    const ids = (await getFolders()).map(f => f.id);
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('2');
    expect(ids).not.toContain('3');
  });
});

describe('getBookmarksInFolder', () => {
  const mockChildren = [
    { id: 'b1', title: 'One Piece Episode 1100 - Crunchyroll', url: 'https://crunchyroll.com/1100' },
    { id: 'b2', title: 'Sakamoto Days Part 2 4 Sub Español — JkAnime', url: 'https://jkanime.net/sakamoto/4' },
    { id: 'sf', title: 'Subfolder', children: [] }, // no url → excluded
  ];

  test('returns BookmarkItems with id, title, url', async () => {
    chrome.bookmarks.getChildren.mockResolvedValue(mockChildren);
    const items = await getBookmarksInFolder('10');
    expect(items).toEqual([
      { id: 'b1', title: 'One Piece Episode 1100 - Crunchyroll', url: 'https://crunchyroll.com/1100' },
      { id: 'b2', title: 'Sakamoto Days Part 2 4 Sub Español — JkAnime', url: 'https://jkanime.net/sakamoto/4' },
    ]);
  });

  test('excludes subfolder nodes (no url property)', async () => {
    chrome.bookmarks.getChildren.mockResolvedValue(mockChildren);
    const items = await getBookmarksInFolder('10');
    expect(items.every(i => i.url)).toBe(true);
  });

  test('throws FolderNotFoundError when getChildren rejects', async () => {
    chrome.bookmarks.getChildren.mockRejectedValue(new Error('No node with id'));
    await expect(getBookmarksInFolder('deleted-id')).rejects.toBeInstanceOf(FolderNotFoundError);
  });
});

describe('groupBySeriesName', () => {
  test('groups bookmarks under their lowercased parsed series name', () => {
    const bookmarks = [
      { id: 'b1', title: 'One Piece Episode 1100 - Crunchyroll', url: 'https://crunchyroll.com/1' },
      { id: 'b2', title: 'One Piece Episode 1101 - Crunchyroll', url: 'https://crunchyroll.com/2' },
      { id: 'b3', title: 'Demon Slayer S03E04 | Crunchyroll', url: 'https://crunchyroll.com/3' },
    ];
    const grouped = groupBySeriesName(bookmarks);
    expect(Object.keys(grouped)).toContain('one piece');
    expect(Object.keys(grouped)).toContain('demon slayer');
    expect(grouped['one piece']).toHaveLength(2);
    expect(grouped['demon slayer']).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/bookmarks.test.js`

Expected: FAIL

- [ ] **Step 3: Implement `modules/bookmarks.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/bookmarks.test.js`

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add modules/bookmarks.js tests/bookmarks.test.js
git commit -m "feat: implement bookmarks module — getFolders, getBookmarksInFolder, groupBySeriesName"
```

---

## Task 5: `modules/jikan.js`

**Files:**
- Modify: `tests/jikan.test.js`
- Modify: `modules/jikan.js`

- [ ] **Step 1: Write failing tests**

File: `tests/jikan.test.js`

```js
import { vi } from 'vitest';
import { JikanClient } from '../modules/jikan.js';

// Use minGapMs: 0 and retryDelayMs: 0 so tests don't incur real delays
function makeClient() {
  return new JikanClient({ minGapMs: 0, retryDelayMs: 0 });
}

function stubFetch(responses) {
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const r = responses[i] ?? responses[responses.length - 1];
    i++;
    return r;
  }));
}

function jsonResp(data, status = 200) {
  return { status, json: async () => data };
}

afterEach(() => vi.unstubAllGlobals());

describe('JikanClient.fetchSeriesMeta', () => {
  test('returns meta from type=tv result', async () => {
    stubFetch([jsonResp({
      data: [{ mal_id: 21, title: 'One Piece', images: { jpg: { image_url: 'https://cdn.mal.net/op.jpg' } } }],
    })]);
    const result = await makeClient().fetchSeriesMeta('One Piece');
    expect(result).toEqual({ malId: 21, title: 'One Piece', imageUrl: 'https://cdn.mal.net/op.jpg' });
  });

  test('falls back to typeless search when type=tv returns empty', async () => {
    stubFetch([
      jsonResp({ data: [] }),
      jsonResp({ data: [{ mal_id: 999, title: 'Cyberpunk: Edgerunners', images: { jpg: { image_url: 'https://cdn.mal.net/cp.jpg' } } }] }),
    ]);
    const result = await makeClient().fetchSeriesMeta('Cyberpunk: Edgerunners');
    expect(result).toEqual({ malId: 999, title: 'Cyberpunk: Edgerunners', imageUrl: 'https://cdn.mal.net/cp.jpg' });
  });

  test('returns null when both searches return empty', async () => {
    stubFetch([jsonResp({ data: [] }), jsonResp({ data: [] })]);
    expect(await makeClient().fetchSeriesMeta('Unknown XYZ')).toBeNull();
  });

  test('retries on 429 and succeeds', async () => {
    stubFetch([
      jsonResp({}, 429),
      jsonResp({ data: [{ mal_id: 21, title: 'One Piece', images: { jpg: { image_url: null } } }] }),
    ]);
    const result = await makeClient().fetchSeriesMeta('One Piece');
    expect(result).not.toBeNull();
    expect(result.malId).toBe(21);
  });

  test('returns null after MAX_RETRIES consecutive 429 responses', async () => {
    stubFetch([jsonResp({}, 429), jsonResp({}, 429), jsonResp({}, 429), jsonResp({}, 429)]);
    expect(await makeClient().fetchSeriesMeta('One Piece')).toBeNull();
  });

  test('handles missing imageUrl gracefully', async () => {
    stubFetch([jsonResp({ data: [{ mal_id: 50, title: 'Some Anime', images: {} }] })]);
    const result = await makeClient().fetchSeriesMeta('Some Anime');
    expect(result.imageUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/jikan.test.js`

Expected: FAIL

- [ ] **Step 3: Implement `modules/jikan.js`**

```js
const JIKAN_BASE = 'https://api.jikan.moe/v4';
const DEFAULT_MIN_GAP_MS = 350;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Rate-limited Jikan API client.
 * Queues requests with a minimum gap between them.
 * On 429, pauses the entire queue for retryDelayMs before retrying (max 3 times).
 */
export class JikanClient {
  /**
   * @param {{ minGapMs?: number, retryDelayMs?: number }} options
   */
  constructor({ minGapMs = DEFAULT_MIN_GAP_MS, retryDelayMs = DEFAULT_RETRY_DELAY_MS } = {}) {
    this._minGapMs = minGapMs;
    this._retryDelayMs = retryDelayMs;
    this._queue = [];
    this._running = false;
    this._lastRequestTime = 0;
  }

  /**
   * Fetches series metadata from Jikan. Rate-limited via an internal queue.
   * First tries type=tv; falls back to no type filter (catches ONAs).
   * Returns null if no results or after MAX_RETRIES 429 responses.
   *
   * @param {string} seriesName
   * @returns {Promise<{malId: number, title: string, imageUrl: string|null}|null>}
   */
  fetchSeriesMeta(seriesName) {
    return new Promise((resolve) => {
      this._queue.push({ seriesName, resolve });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this._running) return;
    this._running = true;

    while (this._queue.length > 0) {
      const elapsed = Date.now() - this._lastRequestTime;
      if (elapsed < this._minGapMs) await _sleep(this._minGapMs - elapsed);

      const item = this._queue[0];
      const result = await this._searchWithRetry(item.seriesName, 0);
      this._queue.shift();
      this._lastRequestTime = Date.now();
      item.resolve(result);
    }

    this._running = false;
  }

  async _searchWithRetry(seriesName, attempt) {
    if (attempt >= MAX_RETRIES) return null;
    try {
      return await this._search(seriesName);
    } catch (err) {
      if (err?.is429) {
        await _sleep(this._retryDelayMs);
        return this._searchWithRetry(seriesName, attempt + 1);
      }
      return null;
    }
  }

  async _search(seriesName) {
    const q = encodeURIComponent(seriesName);

    // First attempt: type=tv
    const r1 = await fetch(`${JIKAN_BASE}/anime?q=${q}&limit=1&type=tv`);
    if (r1.status === 429) throw { is429: true };
    const d1 = await r1.json();
    if (d1.data?.length > 0) return _extractMeta(d1.data[0]);

    // Fallback: no type filter (catches ONAs like "Cyberpunk: Edgerunners")
    const r2 = await fetch(`${JIKAN_BASE}/anime?q=${q}&limit=1`);
    if (r2.status === 429) throw { is429: true };
    const d2 = await r2.json();
    if (d2.data?.length > 0) return _extractMeta(d2.data[0]);

    return null;
  }
}

function _extractMeta(anime) {
  return {
    malId: anime.mal_id,
    title: anime.title,
    imageUrl: anime.images?.jpg?.image_url ?? null,
  };
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/jikan.test.js`

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add modules/jikan.js tests/jikan.test.js
git commit -m "feat: implement JikanClient — rate-limited MAL search with tv/ONA fallback and retry"
```

---

## Task 6: `background.js`

**Files:**
- Modify: `tests/background.test.js`
- Modify: `background.js`

- [ ] **Step 1: Write failing tests**

File: `tests/background.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/background.test.js`

Expected: FAIL

- [ ] **Step 3: Implement `background.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/background.test.js`

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add background.js tests/background.test.js
git commit -m "feat: implement background service worker — bookmark change listener sets cacheStale"
```

---

## Task 7: `newtab.js` — orchestration logic

**Files:**
- Modify: `tests/newtab.test.js`
- Modify: `newtab.js`

This task implements and tests the three pure logic functions exported from `newtab.js`: `getSiteName`, `buildSeriesEntries`, and `resolveStaleCache`. DOM rendering is added in Task 8.

- [ ] **Step 1: Write failing tests**

File: `tests/newtab.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/newtab.test.js`

Expected: FAIL

- [ ] **Step 3: Implement exported logic functions in `newtab.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/newtab.test.js`

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add newtab.js tests/newtab.test.js
git commit -m "feat: implement newtab orchestration logic — getSiteName, buildSeriesEntries, resolveStaleCache"
```

---

## Task 8: `newtab.js` — UI rendering + `styles/newtab.css`

**Files:**
- Modify: `newtab.js` (append rendering functions and `init()`)
- Modify: `styles/newtab.css`

- [ ] **Step 1: Run all tests to confirm a clean baseline**

Run: `npm test`

Expected: All tests pass, 0 failures.

- [ ] **Step 2: Write `styles/newtab.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0d1117;
  color: #c9d1d9;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Top bar ─── */
#topbar {
  background: #161b22;
  border-bottom: 1px solid #21262d;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.app-title { font-size: 15px; font-weight: 600; color: #e6edf3; }
#folder-select {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
  padding: 5px 10px;
  cursor: pointer;
}
#folder-select:focus { outline: none; border-color: #58a6ff; }
#bookmark-count { font-size: 12px; color: #7d8590; margin-left: auto; }

/* ─── Main layout ─── */
#main { display: flex; flex: 1; overflow: hidden; }

/* ─── Sidebar ─── */
#sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #161b22;
  border-right: 1px solid #21262d;
  overflow-y: auto;
  padding: 8px 0;
}
.series-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
}
.series-row:hover { background: #1c2128; }
.series-row.active { background: #1c2128; border-left-color: #58a6ff; }
.series-row.unmatched .series-name { color: #d29922; }
.series-row.unmatched.active { border-left-color: #d29922; }
.series-cover {
  width: 36px;
  height: 50px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: #21262d;
}
.series-info { flex: 1; min-width: 0; }
.series-name {
  font-size: 13px;
  font-weight: 500;
  color: #e6edf3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.series-row.active .series-name { color: #58a6ff; }
.series-ep-count { font-size: 11px; color: #7d8590; margin-top: 2px; }

/* ─── Detail panel ─── */
#detail { flex: 1; overflow-y: auto; padding: 24px 32px; }
.detail-header { display: flex; gap: 20px; margin-bottom: 24px; align-items: flex-start; }
.detail-cover {
  width: 80px;
  height: 112px;
  border-radius: 6px;
  object-fit: cover;
  background: #21262d;
  flex-shrink: 0;
}
.detail-title { font-size: 22px; font-weight: 700; color: #e6edf3; margin-bottom: 4px; }
.detail-subtitle { font-size: 13px; color: #7d8590; }
.ep-pill {
  display: inline-block;
  background: #1f3a5c;
  color: #58a6ff;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 20px;
  margin-top: 8px;
}
.ep-pill.unmatched { background: #3d2b1f; color: #d29922; }
.episodes-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7d8590;
  margin-bottom: 10px;
}
.episode-list { display: flex; flex-direction: column; gap: 6px; max-width: 680px; }
.episode-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 10px 14px;
  text-decoration: none;
  color: inherit;
}
.episode-item:hover { background: #1c2128; border-color: #30363d; }
.play-icon {
  width: 28px;
  height: 28px;
  background: #1f3a5c;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #58a6ff;
  font-size: 11px;
}
.episode-title { font-size: 13px; color: #c9d1d9; flex: 1; }
.episode-site { font-size: 11px; color: #7d8590; }

/* ─── Empty / error states ─── */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #7d8590;
  font-size: 14px;
  text-align: center;
  padding: 32px;
}
```

- [ ] **Step 3: Append rendering functions and `init()` to `newtab.js`**

Append below the exported logic functions:

```js
// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pluralize(count, word) {
  return `${count} ${word}${count !== 1 ? 's' : ''}`;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderEmptyState(message) {
  document.getElementById('sidebar').innerHTML = '';
  document.getElementById('detail').innerHTML =
    `<div class="empty-state">${escapeHtml(message)}</div>`;
  document.getElementById('bookmark-count').textContent = '';
}

function renderSidebar(entries, unmatchedBookmarks, onSelect) {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';
  const allKeys = Object.keys(entries);

  allKeys.forEach((key, i) => {
    const entry = entries[key];
    const row = document.createElement('div');
    row.className = 'series-row' + (i === 0 ? ' active' : '');
    row.dataset.key = key;

    const img = document.createElement('img');
    img.className = 'series-cover';
    img.alt = entry.title;
    if (entry.imageUrl) {
      img.src = entry.imageUrl;
      img.onerror = () => img.removeAttribute('src');
    }

    const info = document.createElement('div');
    info.className = 'series-info';
    info.innerHTML = `
      <div class="series-name">${escapeHtml(entry.title)}</div>
      <div class="series-ep-count">${pluralize(entry.bookmarks.length, 'episode')}</div>
    `;

    row.appendChild(img);
    row.appendChild(info);
    row.addEventListener('click', () => {
      sidebar.querySelectorAll('.series-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      onSelect(key);
    });
    sidebar.appendChild(row);
  });

  if (unmatchedBookmarks.length > 0) {
    const row = document.createElement('div');
    row.className = 'series-row unmatched';
    row.innerHTML = `
      <div class="series-cover" style="background:#271e1a;display:flex;align-items:center;justify-content:center;font-size:20px;">⚠️</div>
      <div class="series-info">
        <div class="series-name">Unmatched</div>
        <div class="series-ep-count">${pluralize(unmatchedBookmarks.length, 'episode')}</div>
      </div>
    `;
    row.addEventListener('click', () => {
      sidebar.querySelectorAll('.series-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      onSelect('__unmatched__');
    });
    sidebar.appendChild(row);
  }
}

function renderDetail(entry) {
  const isUnmatched = entry.malId === null;
  const detail = document.getElementById('detail');

  detail.innerHTML = `
    <div class="detail-header">
      ${entry.imageUrl
        ? `<img class="detail-cover" src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(entry.title)}">`
        : `<div class="detail-cover"></div>`}
      <div>
        <div class="detail-title">${escapeHtml(entry.title)}</div>
        ${isUnmatched ? `<div class="detail-subtitle">These bookmarks couldn't be matched to a MyAnimeList series.</div>` : ''}
        <div class="ep-pill ${isUnmatched ? 'unmatched' : ''}">${pluralize(entry.bookmarks.length, 'pending episode')}</div>
      </div>
    </div>
    <div class="episodes-label">Pending Episodes</div>
    <div class="episode-list">
      ${entry.bookmarks.map(b => `
        <a class="episode-item" href="${escapeHtml(b.url)}">
          <div class="play-icon">▶</div>
          <span class="episode-title">${escapeHtml(b.title)}</span>
          <span class="episode-site">${escapeHtml(getSiteName(b.url))}</span>
        </a>
      `).join('')}
    </div>
  `;
}

// ─── Folder dropdown ──────────────────────────────────────────────────────────

async function populateFolderDropdown(selectedId) {
  const select = document.getElementById('folder-select');
  const folders = await getFolders();
  select.innerHTML = folders
    .map(f => `<option value="${escapeHtml(f.id)}"${f.id === selectedId ? ' selected' : ''}>${escapeHtml(f.title)}</option>`)
    .join('');
  select.addEventListener('change', async () => {
    const newId = select.value;
    await storage.setSelectedFolderId(newId);
    await loadAndRender(newId);
  });
}

// ─── Main load ────────────────────────────────────────────────────────────────

async function loadAndRender(folderId) {
  let bookmarkItems;
  try {
    bookmarkItems = await getBookmarksInFolder(folderId);
  } catch (e) {
    if (e instanceof FolderNotFoundError) {
      renderEmptyState('The selected folder was deleted. Please choose another one above.');
      return;
    }
    throw e;
  }

  if (bookmarkItems.length === 0) {
    renderEmptyState('No bookmarks found in this folder. Try selecting a different one.');
    document.getElementById('bookmark-count').textContent = '0 bookmarks';
    return;
  }

  const grouped = groupBySeriesName(bookmarkItems);
  const cache = await storage.getSeriesCache();
  const isStale = await storage.getCacheStale();

  if (isStale) {
    await resolveStaleCache(grouped, cache, (key) => jikan.fetchSeriesMeta(key));
  }

  // Fetch Jikan meta for any series not yet in cache (new series or unmatched retries)
  const missingKeys = Object.keys(grouped).filter(k => !cache[k]);
  await Promise.all(
    missingKeys.map(async (key) => {
      const searchName = parseSeriesName(grouped[key][0].title);
      const meta = await jikan.fetchSeriesMeta(searchName);
      if (meta) cache[key] = { ...meta, bookmarks: grouped[key] };
    })
  );
  await storage.setSeriesCache(cache);

  const entries = buildSeriesEntries(grouped, cache);
  const unmatchedBookmarks = Object.keys(grouped)
    .filter(k => !cache[k])
    .flatMap(k => grouped[k]);

  const seriesCount = Object.keys(entries).length + (unmatchedBookmarks.length > 0 ? 1 : 0);
  document.getElementById('bookmark-count').textContent =
    `${bookmarkItems.length} bookmarks · ${seriesCount} series`;

  // Build combined entries map including unmatched sentinel for detail rendering
  const allEntries = { ...entries };
  if (unmatchedBookmarks.length > 0) {
    allEntries['__unmatched__'] = { malId: null, title: 'Unmatched', imageUrl: null, bookmarks: unmatchedBookmarks };
  }

  const firstKey = Object.keys(allEntries)[0];
  renderSidebar(entries, unmatchedBookmarks, (key) => renderDetail(allEntries[key]));
  if (firstKey) renderDetail(allEntries[firstKey]);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function init() {
  const folderId = await storage.getSelectedFolderId();
  await populateFolderDropdown(folderId);

  if (!folderId) {
    renderEmptyState('Select a bookmarks folder above to get started.');
    return;
  }

  await loadAndRender(folderId);
}

init();
```

- [ ] **Step 4: Run all tests to confirm nothing broke**

Run: `npm test`

Expected: All tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add newtab.js styles/newtab.css
git commit -m "feat: implement newtab UI rendering, CSS, and init flow"
```

---

## Task 9: Load in Chrome and smoke-test

**No new files.**

- [ ] **Step 1: Load the unpacked extension in Chrome**

1. Navigate to `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" → select `/Users/wesmena/anime-bookmark-organizer`

Expected: Extension card appears with no error badges.

- [ ] **Step 2: Open a new tab**

Expected: The new tab page loads. With no folder selected yet, you should see "Select a bookmarks folder above to get started."

- [ ] **Step 3: Select your anime bookmarks folder from the dropdown**

Expected:
- Sidebar populates with series grouped by name
- Cover art loads from MAL (may be staggered due to rate limiting)
- Detail panel shows the first series and its episode list
- Episodes with unrecognized titles appear in an amber "Unmatched" row at the bottom

- [ ] **Step 4: Click an episode link**

Expected: The URL opens, replacing the new tab page.

- [ ] **Step 5: Add a test bookmark to your anime folder, then open a new tab**

Expected: The new bookmark appears under the correct series (the background service worker set `cacheStale`, triggering a diff on load).

- [ ] **Step 6: Final commit**

```bash
git add -A && git commit -m "feat: extension smoke-tested end-to-end"
```
