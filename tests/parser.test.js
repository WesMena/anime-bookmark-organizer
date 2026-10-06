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

  test('strips episode number after ordinal season (e.g. "2nd Season 1")', () => {
    expect(parseSeriesName('Frieren: Beyond Journey\'s End 2nd Season 1'))
      .toBe('Frieren: Beyond Journey\'s End 2nd Season');
  });

  test('strips episode number after named season modifier (e.g. "FINAL SEASON 1")', () => {
    expect(parseSeriesName('My Hero Academia FINAL SEASON 1'))
      .toBe('My Hero Academia FINAL SEASON');
  });

  test('strips parenthetical containing "Anime" added by streaming sites', () => {
    expect(parseSeriesName('Pokemon (Shinsaku Anime) 142 Sub Español Online gratis — JkAnime'))
      .toBe('Pokemon');
  });
});
