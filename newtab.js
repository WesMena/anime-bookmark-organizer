import * as storage from './modules/storage.js';
import {
  getBookmarksInFolder, getFolders, groupBySeriesName, FolderNotFoundError,
} from './modules/bookmarks.js';
import { parseSeriesName } from './modules/parser.js';
import { TenraiClient } from './modules/tenrai.js';

const tenrai = new TenraiClient();

let currentView = 'list';
try { if (localStorage.getItem('viewMode') === 'grid') currentView = 'grid'; } catch {}
let currentSort = 'default';
try { currentSort = localStorage.getItem('sortMode') || 'default'; } catch {}
let currentNsfwFilter = 'all';
try { currentNsfwFilter = localStorage.getItem('nsfwFilter') || 'all'; } catch {}
let _lastRenderArgs = null;

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

const PLATFORM_BADGES = {
  AnimeFLV: { cls: 'flv', label: 'FLV' },
  Crunchyroll: { cls: 'cr', label: 'CR' },
  JkAnime: { cls: 'jk', label: 'JK' },
};

/**
 * Returns the platform badge (CSS class + label) for a bookmark URL.
 * Unknown sites get a "?" badge.
 *
 * @param {string} url
 * @returns {{cls: string, label: string}}
 */
export function getPlatformBadge(url) {
  return PLATFORM_BADGES[getSiteName(url)] ?? { cls: 'unknown', label: '?' };
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

const RATING_CLASS = { G: 'g', PG: 'pg', 'PG-13': 'pg13', R: 'r', 'R+': 'rplus', Rx: 'rx' };
function ratingBadgeHtml(rating) {
  if (!rating) return '';
  const cls = RATING_CLASS[rating] ?? 'unknown';
  return `<span class="rating-badge rating-${cls}">${escapeHtml(rating)}</span>`;
}

function scoreBadgeHtml(score) {
  if (score === null || score === undefined) return '';
  return `<span class="score-badge">★ ${score.toFixed(2)}</span>`;
}

function nsfwBadgeHtml(isNsfw) {
  return isNsfw ? `<span class="nsfw-badge">NSFW</span>` : '';
}

// ─── Filtering ───────────────────────────────────────────────────────────────

function applyNsfwFilter(entries, filter) {
  if (filter === 'all') return entries;
  return Object.fromEntries(
    Object.entries(entries).filter(([, e]) =>
      filter === 'nsfw' ? e.isNsfw : !e.isNsfw
    )
  );
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

function applySort(entries, mode) {
  if (mode === 'default') return entries;
  const keys = Object.keys(entries);
  const e = entries;
  const toTime = (d) => d ? new Date(d).getTime() : 0;
  const comparators = {
    'alpha-asc':     (a, b) => e[a].title.localeCompare(e[b].title),
    'alpha-desc':    (a, b) => e[b].title.localeCompare(e[a].title),
    'episodes-asc':  (a, b) => e[a].bookmarks.length - e[b].bookmarks.length,
    'episodes-desc': (a, b) => e[b].bookmarks.length - e[a].bookmarks.length,
    'score-asc':     (a, b) => (e[a].score ?? -1) - (e[b].score ?? -1),
    'score-desc':    (a, b) => (e[b].score ?? -1) - (e[a].score ?? -1),
    'aired-asc':     (a, b) => toTime(e[a].airedFrom) - toTime(e[b].airedFrom),
    'aired-desc':    (a, b) => toTime(e[b].airedFrom) - toTime(e[a].airedFrom),
  };
  keys.sort(comparators[mode] ?? (() => 0));
  return Object.fromEntries(keys.map(k => [k, e[k]]));
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderEmptyState(message) {
  document.getElementById('sidebar').innerHTML = '';
  document.getElementById('detail').innerHTML =
    `<div class="empty-state">${escapeHtml(message)}</div>`;
  document.getElementById('bookmark-count').textContent = '';
}

function renderSidebar(entries, unmatchedBookmarks, onSelect, selectedKey) {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';
  const allKeys = Object.keys(entries);

  allKeys.forEach((key) => {
    const entry = entries[key];
    const row = document.createElement('div');
    row.className = 'series-row' + (key === selectedKey ? ' active' : '');
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
      <div class="series-meta">
        <span class="series-ep-count">${pluralize(entry.bookmarks.length, 'episode')}</span>
        ${scoreBadgeHtml(entry.score)}
        ${ratingBadgeHtml(entry.rating)}
        ${nsfwBadgeHtml(entry.isNsfw)}
      </div>
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

function renderDetail(entry, container = document.getElementById('detail'), key = null) {
  const isUnmatched = entry.malId === null;
  const detail = container;

  detail.innerHTML = `
    <div class="detail-header">
      ${entry.imageUrl
        ? `<img class="detail-cover" src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(entry.title)}">`
        : `<div class="detail-cover"></div>`}
      <div>
        <div class="detail-title">${escapeHtml(entry.title)}</div>
        ${isUnmatched ? `<div class="detail-subtitle">These bookmarks couldn't be matched to a MyAnimeList series.</div>` : ''}
        <div class="detail-pills">
          <div class="ep-pill ${isUnmatched ? 'unmatched' : ''}">${pluralize(entry.bookmarks.length, 'pending episode')}</div>
          ${scoreBadgeHtml(entry.score)}
          ${ratingBadgeHtml(entry.rating)}
        </div>
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

  if (key && key !== '__unmatched__') {
    const btn = document.createElement('button');
    btn.className = `nsfw-toggle${entry.isNsfw ? ' nsfw-toggle--on' : ''}`;
    btn.textContent = entry.isNsfw ? '✓ Marked as NSFW' : 'Mark as NSFW';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!_lastRenderArgs) return;
      const newValue = !entry.isNsfw;
      _lastRenderArgs.cache[key] = { ..._lastRenderArgs.cache[key], isNsfw: newValue };
      await storage.setSeriesCache(_lastRenderArgs.cache);
      document.getElementById('series-modal')?.remove();
      const { grouped, cache, totalBookmarks } = _lastRenderArgs;
      renderPage(grouped, cache, totalBookmarks);
    });
    detail.querySelector('.detail-pills').appendChild(btn);
  }
}

function renderGrid(allEntries) {
  const detail = document.getElementById('detail');
  detail.innerHTML = '';
  for (const [key, entry] of Object.entries(allEntries)) {
    const card = document.createElement('div');
    card.className = 'grid-card' + (entry.malId === null ? ' unmatched' : '');
    card.dataset.key = key;

    const poster = document.createElement('div');
    poster.className = 'grid-card-poster';
    if (entry.imageUrl) {
      const img = document.createElement('img');
      img.src = entry.imageUrl;
      img.alt = entry.title;
      img.onerror = () => img.removeAttribute('src');
      poster.appendChild(img);
    }
    if (entry.bookmarks.length > 0) {
      const { cls, label } = getPlatformBadge(entry.bookmarks[0].url);
      const platform = document.createElement('div');
      platform.className = `platform-badge platform-${cls}`;
      platform.textContent = label;
      platform.title = getSiteName(entry.bookmarks[0].url) || 'Unknown platform';
      poster.appendChild(platform);
    }
    if (entry.isNsfw) {
      const badge = document.createElement('div');
      badge.className = 'nsfw-overlay';
      badge.textContent = 'NSFW';
      poster.appendChild(badge);
    }
    card.appendChild(poster);

    const info = document.createElement('div');
    info.className = 'grid-card-info';
    info.innerHTML = `
      <div class="grid-card-title">${escapeHtml(entry.title)}</div>
      <div class="series-meta">
        <span class="grid-card-count">${pluralize(entry.bookmarks.length, 'episode')}</span>
        ${scoreBadgeHtml(entry.score)}
        ${ratingBadgeHtml(entry.rating)}
      </div>
    `;
    card.appendChild(info);
    card.addEventListener('click', () => showModal(entry, key));
    detail.appendChild(card);
  }

  // Enlarge titles that fit on a single line so all info areas are the same height
  requestAnimationFrame(() => {
    detail.querySelectorAll('.grid-card-title').forEach(el => {
      const lineH = parseFloat(getComputedStyle(el).lineHeight);
      if (el.scrollHeight <= Math.ceil(lineH)) el.style.fontSize = '15px';
    });
  });
}

function showModal(entry, key = null) {
  document.getElementById('series-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'series-modal';
  overlay.className = 'modal-overlay';

  const content = document.createElement('div');
  content.className = 'modal-content';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  content.appendChild(closeBtn);

  renderDetail(entry, content, key);

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
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

function renderPage(grouped, cache, totalBookmarks) {
  _lastRenderArgs = { grouped, cache, totalBookmarks };

  const entries = buildSeriesEntries(grouped, cache);
  const unmatchedBookmarks = Object.keys(grouped)
    .filter(k => !cache[k])
    .flatMap(k => grouped[k]);

  const seriesCount = Object.keys(entries).length + (unmatchedBookmarks.length > 0 ? 1 : 0);
  document.getElementById('bookmark-count').textContent =
    `${totalBookmarks} bookmarks · ${seriesCount} series`;

  const sortedEntries = applySort(entries, currentSort);
  const filteredEntries = applyNsfwFilter(sortedEntries, currentNsfwFilter);
  const visibleUnmatched = currentNsfwFilter === 'nsfw' ? [] : unmatchedBookmarks;

  const allEntries = { ...filteredEntries };
  if (visibleUnmatched.length > 0) {
    allEntries['__unmatched__'] = { malId: null, title: 'Unmatched', imageUrl: null, bookmarks: visibleUnmatched };
  }

  const main = document.getElementById('main');
  if (currentView === 'grid') {
    main.classList.add('grid-view');
    document.getElementById('sidebar').innerHTML = '';
    renderGrid(allEntries);
  } else {
    main.classList.remove('grid-view');
    // Preserve the active selection across re-renders
    const activeRow = document.querySelector('#sidebar .series-row.active');
    const activeKey = activeRow?.dataset.key;
    const firstKey = Object.keys(allEntries)[0];
    const selectedKey = (activeKey && allEntries[activeKey]) ? activeKey : firstKey;
    renderSidebar(filteredEntries, visibleUnmatched, (key) => renderDetail(allEntries[key], undefined, key), selectedKey);
    if (selectedKey) renderDetail(allEntries[selectedKey], undefined, selectedKey);
  }
}

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
    await resolveStaleCache(grouped, cache, (key) => {
      const searchName = parseSeriesName(grouped[key][0].title);
      return tenrai.fetchSeriesMeta(searchName);
    });
  }

  // Render immediately with whatever is cached — fills in progressively
  renderPage(grouped, cache, bookmarkItems.length);

  // Fetch Tenrai meta for series not yet cached; re-render as each arrives.
  // Also refetch entries cached before score/airedFrom were added (score === undefined).
  const keysNeedingFetch = Object.keys(grouped).filter(
    k => !cache[k] || !('rating' in cache[k])
  );
  for (const key of keysNeedingFetch) {
    const searchName = parseSeriesName(grouped[key][0].title);
    tenrai.fetchSeriesMeta(searchName).then(async (meta) => {
      if (meta) {
        cache[key] = { ...cache[key], ...meta, bookmarks: grouped[key] };
        await storage.setSeriesCache(cache);
        renderPage(grouped, cache, bookmarkItems.length);
      }
    });
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const ICON_LIST = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor"/>
  <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor"/>
  <rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor"/>
</svg>`;

const ICON_GRID = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor"/>
  <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor"/>
  <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor"/>
  <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor"/>
</svg>`;

function updateViewToggleBtn() {
  const btn = document.getElementById('view-toggle');
  if (currentView === 'grid') {
    btn.innerHTML = ICON_LIST;
    btn.title = 'Switch to list view';
    btn.setAttribute('aria-label', 'Switch to list view');
  } else {
    btn.innerHTML = ICON_GRID;
    btn.title = 'Switch to grid view';
    btn.setAttribute('aria-label', 'Switch to grid view');
  }
}

async function init() {
  const sortSelect = document.getElementById('sort-select');
  sortSelect.value = currentSort;
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    try { localStorage.setItem('sortMode', currentSort); } catch {}
    if (_lastRenderArgs) {
      const { grouped, cache, totalBookmarks } = _lastRenderArgs;
      renderPage(grouped, cache, totalBookmarks);
    }
  });

  const nsfwSelect = document.getElementById('nsfw-filter');
  nsfwSelect.value = currentNsfwFilter;
  nsfwSelect.addEventListener('change', () => {
    currentNsfwFilter = nsfwSelect.value;
    try { localStorage.setItem('nsfwFilter', currentNsfwFilter); } catch {}
    if (_lastRenderArgs) {
      const { grouped, cache, totalBookmarks } = _lastRenderArgs;
      renderPage(grouped, cache, totalBookmarks);
    }
  });

  const btn = document.getElementById('view-toggle');
  updateViewToggleBtn();
  btn.addEventListener('click', () => {
    currentView = currentView === 'list' ? 'grid' : 'list';
    try { localStorage.setItem('viewMode', currentView); } catch {}
    updateViewToggleBtn();
    if (_lastRenderArgs) {
      const { grouped, cache, totalBookmarks } = _lastRenderArgs;
      renderPage(grouped, cache, totalBookmarks);
    }
  });

  const folderId = await storage.getSelectedFolderId();
  await populateFolderDropdown(folderId);

  if (!folderId) {
    renderEmptyState('Select a bookmarks folder above to get started.');
    return;
  }

  await loadAndRender(folderId);
}

// Only run in a real Chrome extension context — not in tests
if (chrome.runtime?.id) {
  init();
}
