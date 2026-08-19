/**
 * One language vocabulary across sources.
 *
 * TVmaze writes "English"; TMDB writes "en". This looks harmless and is not:
 * baseScore awards +0.3 when a candidate matches the viewer's dominant language
 * and -0.9 when it does not. Unnormalised, EVERY film would score "en" against
 * a dominant language of "English", miss, and take the penalty - which is large
 * enough to bury the entire movie catalogue beneath the TV catalogue with no
 * error and no obvious cause.
 *
 * Same failure shape as the genre vocabularies, in a different dimension.
 */
const ISO_TO_NAME: Record<string, string> = {
  en: 'English', ja: 'Japanese', ko: 'Korean', es: 'Spanish', fr: 'French',
  de: 'German', it: 'Italian', pt: 'Portuguese', zh: 'Chinese', cn: 'Chinese',
  hi: 'Hindi', ru: 'Russian', ar: 'Arabic', sv: 'Swedish', da: 'Danish',
  no: 'Norwegian', nb: 'Norwegian', nn: 'Norwegian', fi: 'Finnish', nl: 'Dutch',
  pl: 'Polish', tr: 'Turkish', he: 'Hebrew', th: 'Thai', id: 'Indonesian',
  vi: 'Vietnamese', cs: 'Czech', hu: 'Hungarian', el: 'Greek', ro: 'Romanian',
  uk: 'Ukrainian', fa: 'Persian', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
  bn: 'Bengali', mr: 'Marathi', pa: 'Punjabi', tl: 'Tagalog', ms: 'Malay',
  is: 'Icelandic', ca: 'Catalan', sr: 'Serbian', hr: 'Croatian', bg: 'Bulgarian',
  sk: 'Slovak', sl: 'Slovenian', et: 'Estonian', lv: 'Latvian', lt: 'Lithuanian',
};

/** Accepts either an ISO 639-1 code or an English language name. */
export const normalizeLanguage = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const mapped = ISO_TO_NAME[trimmed.toLowerCase()];
  if (mapped) return mapped;

  // Already a name (TVmaze's form) - normalise casing only.
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};
