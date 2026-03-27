# Anime Bookmark Organizer — Design Spec
**Date:** 2026-03-27

## Overview

A Chrome Extension (Manifest V3) that overrides the new tab page to display the user's anime bookmarks organized by series, using MyAnimeList metadata fetched via the Jikan API. The user watches anime on Spanish streaming sites (JkAnime, AnimeFLV) as well as English ones (Crunchyroll, Funimation), and keeps pending episodes bookmarked in a Chrome folder. The extension reads that folder, groups bookmarks by series, and presents them in a sidebar + detail panel layout for easy access.

---

## Architecture

### Extension structure

```
anime-bookmark-organizer/
├── manifest.json
├── newtab.html              # New tab override
├── newtab.js                # Entry point for new tab page
├── background.js            # Service worker — bookmark change listener
├── modules/
│   ├── storage.js           # chrome.storage.local wrapper
│   ├── bookmarks.js         # Read + group bookmarks from selected folder
│   ├── parser.js            # Strip site/episode tags, extract series name
│   └── jikan.js             # Jikan API client with rate limiting + cache
└── styles/
    └── newtab.css
```

### Manifest V3 permissions

- `bookmarks` — read and watch the user's bookmark tree
- `storage` — persist folder selection and series cache

### Data flow on new tab open

1. Load `selectedFolderId` from `chrome.storage.local`
2. Populate folder dropdown with all top-level bookmark folders; pre-select saved folder
3. Read all bookmarks from the selected folder
4. Run each bookmark title through the parser to extract a series name
5. Group bookmarks by series name
6. For each series: check `seriesCache` in storage → cache hit renders immediately; cache miss queues a Jikan search
7. Render sidebar (all series) + detail panel (first series selected by default)

---

## Modules

### `storage.js`

Thin wrapper around `chrome.storage.local`.

- `getSelectedFolderId()` → `string | null` (returns `null` if never set)
- `setSelectedFolderId(id)` → `void`
- `getSeriesCache()` → `Record<string, SeriesEntry>` (returns `{}` if never set)
- `setSeriesCache(cache)` → `void`
- `getCacheStale()` → `boolean` (returns `false` if never set)
- `setCacheStale(stale)` → `void`

### `parser.js`

Strips noise from bookmark titles to extract a clean MAL search query. Applied in order:

1. **Spanish streaming tags** — strip everything from `Sub Español` or `Sub Latino` onward (e.g., `Sub Español Online gratis — JkAnime`, `Sub Español - AnimeFLV`)
2. **English site names** — strip trailing `- Crunchyroll`, `| Funimation`, `- HiDive`, `- Netflix`, `- Bilibili`, etc.
3. **Episode markers (English)** — strip `Episode N`, `Ep. N`, `Ep N`
4. **Episode markers (Spanish)** — strip `Episodio N`
5. **Compact format** — strip `S\d+E\d+` patterns
6. **Trailing standalone number** — strip a lone number at the end of the string
7. **Trim** — remove leftover punctuation (dashes, pipes, colons) and whitespace

`Season N` and `Part N` are **intentionally preserved** — MAL treats these as distinct series entries.

Examples:
```
"One Piece Episode 1100 - Crunchyroll"                        → "One Piece"
"Rascal Does Not Dream of Santa Claus 1"                      → "Rascal Does Not Dream of Santa Claus"
"Sakamoto Days Part 2 4 Sub Español Online gratis — JkAnime"  → "Sakamoto Days Part 2"
"Yofukashi no Uta Season 2 Episodio 8 Sub Español - AnimeFLV" → "Yofukashi no Uta Season 2"
"Demon Slayer: Kimetsu no Yaiba S03E04 | Crunchyroll"         → "Demon Slayer: Kimetsu no Yaiba"
```

Exports: `parseSeriesName(title: string): string`

### `jikan.js`

Wraps the Jikan v4 REST API (`https://api.jikan.moe/v4`).

- **Rate limiting:** Jikan allows 3 requests/second. The client queues requests and enforces a minimum 350ms gap between calls. On a 429 response, pause the entire request queue for 1 second before resuming; maximum 3 retries per request before giving up.
- **Cache-first:** always checks `seriesCache` before making a network request.
- **Search endpoint:** first attempt `GET /anime?q={query}&limit=1&type=tv`. `type=tv` filters out movies and OVAs for most series. However, some legitimate anime are classified as ONA on MAL (e.g., "Cyberpunk: Edgerunners") and will not appear in `type=tv` results. If the `type=tv` query returns no results, retry without the `type` filter: `GET /anime?q={query}&limit=1`. Takes the top result from whichever query succeeds.
- **On no results (both attempts):** returns `null`; the series is placed in the `Unmatched` group. A `null` result is **not** persisted to storage — it will be retried on the next page load.

Fetches only: `malId`, `title`, `imageUrl` (from `images.jpg.image_url`).

Exports: `fetchSeriesMeta(seriesName: string): Promise<SeriesMeta | null>`

### `bookmarks.js`

- `getFolders()` → returns all direct-child folders of Chrome's three root nodes ("Bookmarks Bar", "Other Bookmarks", "Mobile Bookmarks"). Does not recurse deeper — only the first level of subfolders is shown in the dropdown.
- `getBookmarksInFolder(folderId)` → flat list of all `BookmarkItem` objects in the folder (non-recursive; the folder is treated as flat). If `chrome.bookmarks.getChildren(folderId)` rejects (e.g., the folder was deleted), this function throws a `FolderNotFoundError`. `newtab.js` catches this error and renders the folder-deleted error state, prompting the user to re-select a folder.
- `groupBySeriesName(bookmarks: BookmarkItem[])` → `Record<string, BookmarkItem[]>` using `parser.js`. The record key is the lowercased, trimmed parsed series name (for cache consistency). `BookmarkItem` conversion (picking `id`, `title`, `url` from the raw `chrome.bookmarks.BookmarkTreeNode`) happens inside this module.

### `background.js` (service worker)

Listens to:
- `chrome.bookmarks.onCreated` — `parentId` is on the node directly
- `chrome.bookmarks.onRemoved` — `parentId` is on the `removeInfo` parameter (the node is already gone)
- `chrome.bookmarks.onChanged` — bookmark `id` is available; call `chrome.bookmarks.get(id)` to retrieve the node and check its `parentId`. If this async lookup fails for any reason (race condition, node already deleted), conservatively set `cacheStale = true` anyway.
- `chrome.bookmarks.onMoved` — check both `moveInfo.parentId` and `moveInfo.oldParentId`

On any event: if the affected bookmark's parent folder matches the stored `selectedFolderId`, set `cacheStale = true` in storage.

**Stale cache resolution (in `newtab.js` on load):**

When `cacheStale` is `true`, the new tab page:
1. Calls `getBookmarksInFolder` and `groupBySeriesName` to get the current `Record<string, BookmarkItem[]>` from the live folder
2. Computes the diff against the keys in `seriesCache`:
   - **New keys** (series not in cache): fetch from Jikan and add to cache
   - **Removed keys** (series no longer in folder): delete from cache
   - **Unchanged keys**: keep cached `malId`/`title`/`imageUrl`; replace the `bookmarks` array with the corresponding `BookmarkItem[]` from the freshly-read live folder data (step 1)
3. Before writing back to storage, ensure the `__unmatched__` key is not included — unmatched entries exist only in the runtime render, never in persisted storage
4. Writes the updated cache back to storage and sets `cacheStale = false`

This avoids re-fetching Jikan for series that haven't changed.

---

## Data Model

All data stored in `chrome.storage.local`.

```typescript
// Persisted keys
selectedFolderId: string                     // Chrome bookmark folder ID
seriesCache: Record<string, SeriesEntry>     // keyed by lowercased, trimmed parsed series name
cacheStale: boolean                          // true when bookmarks changed since last load; default false

interface SeriesEntry {
  malId: number | null        // null for Unmatched
  title: string               // MAL title (or parsed series name if unmatched)
  imageUrl: string | null
  bookmarks: BookmarkItem[]
}

interface BookmarkItem {
  id: string
  title: string   // original, unmodified bookmark title (used as display label in the episode list)
  url: string
}
```

**Cache key strategy:** keys are the lowercased, trimmed output of `parseSeriesName`. This prevents case-variant duplicates (e.g., `"one piece"` and `"One Piece"` map to the same entry). The human-readable `title` field on `SeriesEntry` stores the MAL-returned title.

**Unmatched group:** bookmarks for which Jikan returned no results are collected at runtime in a separate variable (not in `seriesCache`), represented as a `SeriesEntry` with `malId: null` and `title` set to the un-lowercased output of `parseSeriesName` for display. The `"__unmatched__"` key is a reserved sentinel used only for UI rendering — it is **never written to `seriesCache`** or persisted to storage. Unmatched entries are rebuilt fresh on every load.

**Cache TTL:** Jikan metadata (cover art, title) is cached permanently — it does not expire. Since the user is watching known ongoing series, metadata rarely changes in meaningful ways. If a user notices stale cover art, clearing the extension's storage resets it.

---

## UI

### New tab page layout

**Top bar:**
- App title
- Folder dropdown (all Chrome bookmark folders; persists selection via `chrome.storage.local`)
- Bookmark count summary (e.g., "14 bookmarks · 6 series") — counts are derived from the live folder read (`getBookmarksInFolder` result), not from the cache sum

**Sidebar (left, ~260px):**
- One row per series: cover art thumbnail, series name, pending episode count
- Active series highlighted with a left border accent
- `Unmatched` group shown at the bottom in amber if any unmatched bookmarks exist
- Scrollable when series list exceeds viewport height

**Detail panel (right, flex):**
- Series cover art (larger) + title
- "N pending episodes" pill
- Scrollable list of episode bookmarks, each as a clickable row:
  - **Episode label:** the raw `BookmarkItem.title` (original bookmark title, unmodified)
  - **Site name:** derived from the bookmark URL hostname using a known-sites map (e.g., `crunchyroll.com` → "Crunchyroll", `jkanime.net` → "JkAnime", `animeflv.net` → "AnimeFLV", `funimation.com` → "Funimation", `hidive.com` → "HiDive"); falls back to the bare hostname if not in the map
- Clicking an episode opens it in the current tab (the new tab page is replaced). Standard modifier-key behavior is preserved — Ctrl+click / middle-click opens in a new tab per browser defaults; no custom handling required.

### States

- **No folder selected (first install):** when `selectedFolderId` is null, show an empty state in the detail panel with a prompt ("Select a bookmarks folder above to get started") and no sidebar content
- **Loading:** spinner/shimmer while Jikan fetches are in progress; already-cached series render immediately
- **Unmatched:** amber warning row at the bottom of the sidebar; episodes still accessible in the detail panel
- **Empty folder:** friendly empty state with prompt "No bookmarks found in this folder. Try selecting a different one."

---

## Error Handling

- Jikan network failure: show cached data if available; show an inline error if no cache exists for that series
- Jikan rate limit (429): back off and retry after 1 second
- Bookmark folder deleted: detect missing folder on load, prompt user to re-select

---

## Out of Scope

- Progress tracking / marking episodes as watched
- Manual series assignment (auto-detect only, with Unmatched fallback)
- Syncing across devices (`chrome.storage.sync`)
- Support for nested bookmark folders (flat folder only)
