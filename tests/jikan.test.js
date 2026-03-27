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
