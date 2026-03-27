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
