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
  let result = title;

  // 1. Strip Spanish streaming tags (everything from "Sub Español/Latino" onward)
  result = result.replace(/\s+Sub\s+(Español|Latino).*/i, '');

  // 1b. Strip site-added parenthetical qualifiers that contain "Anime"
  // e.g. JkAnime appends "(Shinsaku Anime)" to disambiguate series versions;
  // this is never part of the MAL title.
  result = result.replace(/\s*\([^)]*\bAnime\b[^)]*\)/gi, '');

  // 2. Strip known English site names after a dash, pipe, or em-dash
  result = result.replace(sitePattern, '');

  // 3. Strip episode markers: "Episode N", "Ep. N", "Ep N" (English)
  result = result.replace(/\s+Ep(?:isode)?\.?\s+\d+/i, '');

  // 4. Strip episode markers: "Episodio N" (Spanish)
  result = result.replace(/\s+Episodio\s+\d+/i, '');

  // 5. Strip compact format S##E##
  result = result.replace(/\s+S\d{1,2}E\d{1,2}/i, '');

  // 6. Strip trailing standalone number, but preserve if it IS the season/part number.
  // Exception: when Season/Part is preceded by an ordinal ("2nd Season 1") or a named
  // modifier ("FINAL SEASON 1", "New Season 3"), the trailing number is an episode — strip it.
  // NOTE: This guard checks the string *at the end only* via the $ anchor.
  // Future steps must not change the trailing content, or this guard will silently fail.
  const namedSeasonAtEnd = /\b(?:\d+(?:st|nd|rd|th)|final|new|last|second|third|fourth|fifth|special)\s+(?:Season|Part)\s+\d+\s*$/i.test(result);
  if (namedSeasonAtEnd || !/(?:Season|Part)\s+\d+\s*$/.test(result)) {
    result = result.replace(/\s+\d+\s*$/, '');
  }

  // 7. Trim trailing punctuation and whitespace
  result = result.replace(/[\s\-|–—:]+$/, '').trim();

  return result;
}
