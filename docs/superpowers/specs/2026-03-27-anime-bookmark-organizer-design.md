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

- `getSelectedFolderId()` → `string | null`
- `setSelectedFolderId(id)` → `void`
- `getSeriesCache()` → `Record<string, SeriesEntry>`
- `setSeriesCache(cache)` → `void`
- `getCacheStale()` → `boolean`
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

- **Rate limiting:** Jikan allows 3 requests/second. The client queues requests and enforces a minimum 350ms gap between calls.
- **Cache-first:** always checks `seriesCache` before making a network request.
- **Search endpoint:** `GET /anime?q={query}&limit=1` — takes the top result.
- **On no results:** returns `null`; the series is placed in the `Unmatched` group.

Fetches only: `malId`, `title`, `imageUrl` (from `images.jpg.image_url`).

Exports: `fetchSeriesMeta(seriesName: string): Promise<SeriesMeta | null>`

### `bookmarks.js`

- `getFolders()` → list of top-level bookmark folders for the dropdown
- `getBookmarksInFolder(folderId)` → flat list of all bookmark nodes in the folder (recursive)
- `groupBySeriesName(bookmarks)` → `Record<string, BookmarkNode[]>` using `parser.js`

### `background.js` (service worker)

Listens to:
- `chrome.bookmarks.onCreated`
- `chrome.bookmarks.onRemoved`
- `chrome.bookmarks.onChanged`
- `chrome.bookmarks.onMoved`

On any event: checks if the affected bookmark is inside the currently selected folder. If yes, sets `cacheStale = true` in storage. The new tab page reads this flag on load and re-processes any new or changed series names (clearing only stale cache entries rather than the full cache).

---

## Data Model

All data stored in `chrome.storage.local`.

```typescript
// Persisted keys
selectedFolderId: string                     // Chrome bookmark folder ID
seriesCache: Record<string, SeriesEntry>     // keyed by parsed series name
cacheStale: boolean                          // true when bookmarks changed since last load

interface SeriesEntry {
  malId: number | null        // null for Unmatched
  title: string               // MAL title (or parsed series name if unmatched)
  imageUrl: string | null
  bookmarks: BookmarkItem[]
}

interface BookmarkItem {
  id: string
  title: string   // original bookmark title
  url: string
}
```

The `Unmatched` group uses the key `"__unmatched__"` and holds bookmarks for which Jikan returned no results.

---

## UI

### New tab page layout

**Top bar:**
- App title
- Folder dropdown (all Chrome bookmark folders; persists selection via `chrome.storage.local`)
- Bookmark count summary (e.g., "14 bookmarks · 6 series")

**Sidebar (left, ~260px):**
- One row per series: cover art thumbnail, series name, pending episode count
- Active series highlighted with a left border accent
- `Unmatched` group shown at the bottom in amber if any unmatched bookmarks exist
- Scrollable when series list exceeds viewport height

**Detail panel (right, flex):**
- Series cover art (larger) + title
- "N pending episodes" pill
- Scrollable list of episode bookmarks, each as a clickable row showing the cleaned episode title and streaming site name
- Clicking an episode opens it in the current tab (new tab page is replaced)

### States

- **Loading:** spinner/shimmer while Jikan fetches are in progress; already-cached series render immediately
- **Unmatched:** amber warning row in sidebar; episodes still accessible in the detail panel
- **Empty folder:** friendly empty state prompting the user to select a different folder

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
