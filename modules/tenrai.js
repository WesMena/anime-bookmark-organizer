const TENRAI_BASE = 'https://api.tenrai.org/v1';
const DEFAULT_MIN_GAP_MS = 350;
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Rate-limited Tenrai API client.
 * Queues requests with a minimum gap between them.
 * On 429, pauses the entire queue for retryDelayMs before retrying (max 3 times).
 */
export class TenraiClient {
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
   * Fetches series metadata from Tenrai. Rate-limited via an internal queue.
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
      const item = this._queue[0];
      const result = await this._searchWithRetry(item.seriesName, 0);
      this._queue.shift();
      item.resolve(result);
    }

    this._running = false;
  }

  // Enforces the per-request rate limit gap before every individual fetch call.
  async _rateLimitedFetch(url) {
    const elapsed = Date.now() - this._lastRequestTime;
    if (elapsed < this._minGapMs) await _sleep(this._minGapMs - elapsed);
    this._lastRequestTime = Date.now();
    return fetch(url);
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
    const r1 = await this._rateLimitedFetch(`${TENRAI_BASE}/anime?q=${q}&limit=1&type=tv`);
    if (r1.status === 429) throw { is429: true };
    const d1 = await r1.json();
    if (d1.data?.length > 0) return _extractMeta(d1.data[0]);

    // Fallback: no type filter (catches ONAs like "Cyberpunk: Edgerunners")
    const r2 = await this._rateLimitedFetch(`${TENRAI_BASE}/anime?q=${q}&limit=1`);
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
