import { vi } from 'vitest';
import { TenraiClient } from '../modules/tenrai.js';

// Use minGapMs: 0 and retryDelayMs: 0 so tests don't incur real delays
function makeClient() {
  return new TenraiClient({ minGapMs: 0, retryDelayMs: 0 });
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

describe('TenraiClient.fetchSeriesMeta', () => {
  test('returns meta from type=tv result', async () => {
    stubFetch([jsonResp({
      data: [{ mal_id: 21, title: 'One Piece', images: { jpg: { image_url: 'https://cdn.mal.net/op.jpg' } }, score: 8.7, aired: { from: '1999-10-20T00:00:00+00:00' }, rating: 'PG-13 - Teens 13 or older' }],
    })]);
    const result = await makeClient().fetchSeriesMeta('One Piece');
    expect(result).toEqual({ malId: 21, title: 'One Piece', imageUrl: 'https://cdn.mal.net/op.jpg', score: 8.7, airedFrom: '1999-10-20T00:00:00+00:00', rating: 'PG-13' });
  });

  test('falls back to typeless search when type=tv returns empty', async () => {
    stubFetch([
      jsonResp({ data: [] }),
      jsonResp({ data: [{ mal_id: 999, title: 'Cyberpunk: Edgerunners', images: { jpg: { image_url: 'https://cdn.mal.net/cp.jpg' } }, score: 8.4, aired: { from: '2022-09-13T00:00:00+00:00' }, rating: 'R+ - Mild Nudity' }] }),
    ]);
    const result = await makeClient().fetchSeriesMeta('Cyberpunk: Edgerunners');
    expect(result).toEqual({ malId: 999, title: 'Cyberpunk: Edgerunners', imageUrl: 'https://cdn.mal.net/cp.jpg', score: 8.4, airedFrom: '2022-09-13T00:00:00+00:00', rating: 'R+' });
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

  test('retries without season suffix when result title does not match search', async () => {
    // First two searches return "GG Dou 2nd Season" (wrong match for "Dorohedoro 2nd Season").
    // After both mismatches, strips "2nd Season" and retries — the retry finds "Dorohedoro".
    stubFetch([
      jsonResp({ data: [{ mal_id: 42, title: 'GG Dou 2nd Season', images: { jpg: { image_url: null } }, score: 7.1, aired: { from: '2021-01-01T00:00:00+00:00' }, rating: 'PG-13 - Teens 13 or older' }] }),
      jsonResp({ data: [{ mal_id: 42, title: 'GG Dou 2nd Season', images: { jpg: { image_url: null } }, score: 7.1, aired: { from: '2021-01-01T00:00:00+00:00' }, rating: 'PG-13 - Teens 13 or older' }] }),
      jsonResp({ data: [{ mal_id: 37, title: 'Dorohedoro', images: { jpg: { image_url: 'https://cdn.mal.net/doro.jpg' } }, score: 8.2, aired: { from: '2020-01-12T00:00:00+00:00' }, rating: 'R+ - Mild Nudity' }] }),
    ]);
    const result = await makeClient().fetchSeriesMeta('Dorohedoro 2nd Season');
    expect(result).not.toBeNull();
    expect(result.title).toBe('Dorohedoro');
  });

  test('handles missing imageUrl, score, airedFrom, and rating gracefully', async () => {
    stubFetch([jsonResp({ data: [{ mal_id: 50, title: 'Some Anime', images: {} }] })]);
    const result = await makeClient().fetchSeriesMeta('Some Anime');
    expect(result.imageUrl).toBeNull();
    expect(result.score).toBeNull();
    expect(result.airedFrom).toBeNull();
    expect(result.rating).toBeNull();
  });
});
