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

  // 6. Strip trailing standalone number, but preserve if preceded by "Season" or "Part"
  // Only strip if the string does NOT end with "Season N" or "Part N"
  if (!/(?:Season|Part)\s+\d+\s*$/.test(s)) {
    s = s.replace(/\s+\d+\s*$/, '');
  }

  // 7. Trim trailing punctuation and whitespace
  s = s.replace(/[\s\-|–—:]+$/, '').trim();

  return s;
}
