/**
 * One genre vocabulary for television and film.
 *
 * TVmaze and TMDB disagree, and the disagreement is quiet rather than loud:
 * TVmaze writes "Science-Fiction", TMDB writes "Science Fiction". Left
 * unnormalised, nothing breaks and no error is raised - a user with a shelf of
 * sci-fi television simply never gets recommended a sci-fi film, because the
 * two strings never compare equal. That failure is invisible, and it defeats
 * the single thing a unified watchlist exists to do.
 *
 * TVmaze's vocabulary is canonical here, for one practical reason: ~89k rows in
 * catalog_shows already carry it, so mapping TMDB onto TVmaze rewrites nothing.
 * The 28 names below are the real distinct values in that table, not a guess
 * from documentation.
 */

/** The 28 genres actually present in catalog_shows, plus the two film-only additions. */
export const CANONICAL_GENRES = [
  'Action', 'Adult', 'Adventure', 'Animation', 'Anime', 'Children', 'Comedy', 'Crime',
  'DIY', 'Documentary', 'Drama', 'Espionage', 'Family', 'Fantasy', 'Food', 'History',
  'Horror', 'Legal', 'Medical', 'Music', 'Mystery', 'Nature', 'Romance', 'Science-Fiction',
  'Sports', 'Supernatural', 'Thriller', 'Travel', 'War', 'Western',
] as const;

export type CanonicalGenre = (typeof CANONICAL_GENRES)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_GENRES);

/**
 * TMDB movie genre ids -> canonical names.
 *
 * Note two deliberate calls:
 *   - Animation is NOT folded into Anime. Pixar is not anime, and TVmaze's
 *     "Anime" carries a specific meaning worth keeping. Animation therefore
 *     enters the vocabulary as a new canonical genre; it will not cross-match
 *     TV taste until TVmaze rows acquire it, which is correct but weak.
 *   - "TV Movie" (10770) is dropped. It describes a distribution channel, not a
 *     taste, and would pollute genre affinity with noise.
 *
 * TMDB's *television* genre list differs again (10765 "Sci-Fi & Fantasy" and
 * friends). It is deliberately absent: TV comes from TVmaze, and TMDB is only
 * ever asked about films.
 */
export const TMDB_MOVIE_GENRE_MAP: Record<number, CanonicalGenre | null> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science-Fiction',
  10770: null, // TV Movie - a channel, not a taste
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

/**
 * Loose spellings seen in the wild, mapped onto the canonical form. Keyed
 * lowercase with punctuation stripped, so "Sci-Fi", "sci fi" and "Science
 * Fiction" all land on "Science-Fiction".
 */
const ALIASES: Record<string, CanonicalGenre> = {
  'science fiction': 'Science-Fiction',
  'sci fi': 'Science-Fiction',
  'scifi': 'Science-Fiction',
  'kids': 'Children',
  'children s': 'Children',
  'docu': 'Documentary',
  'documentaries': 'Documentary',
  'biography': 'History',
  'musical': 'Music',
  'romantic': 'Romance',
  'suspense': 'Thriller',
  'do it yourself': 'DIY',
};

const loosen = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Map one genre string onto the canonical vocabulary, or null when it has no
 * equivalent. Exact canonical matches short-circuit, so TVmaze input is free.
 */
export const normalizeGenre = (name: string): CanonicalGenre | null => {
  if (!name) return null;
  if (CANONICAL_SET.has(name)) return name as CanonicalGenre;

  const loose = loosen(name);
  if (ALIASES[loose]) return ALIASES[loose];

  // Last resort: match a canonical name under the same loosening, which catches
  // casing and punctuation drift ("science-fiction", "SCIENCE FICTION").
  for (const canonical of CANONICAL_GENRES) {
    if (loosen(canonical) === loose) return canonical;
  }
  return null;
};

/** Map a TMDB movie payload's genres onto canonical names, deduped. */
export const normalizeTmdbMovieGenres = (
  input: Array<{ id: number; name?: string }> | number[] | undefined | null
): CanonicalGenre[] => {
  if (!input) return [];
  const out = new Set<CanonicalGenre>();

  for (const entry of input) {
    const id = typeof entry === 'number' ? entry : entry.id;
    if (typeof id === 'number' && id in TMDB_MOVIE_GENRE_MAP) {
      const mapped = TMDB_MOVIE_GENRE_MAP[id];
      if (mapped) out.add(mapped);
      continue;
    }
    // Fall back to the name when TMDB adds a genre id we do not know yet.
    const name = typeof entry === 'number' ? null : entry.name;
    if (name) {
      const mapped = normalizeGenre(name);
      if (mapped) out.add(mapped);
    }
  }

  return [...out];
};

/** Normalise a list of arbitrary genre strings, dropping anything unmappable. */
export const normalizeGenreList = (names: string[] | undefined | null): CanonicalGenre[] => {
  if (!names) return [];
  const out = new Set<CanonicalGenre>();
  for (const n of names) {
    const mapped = normalizeGenre(n);
    if (mapped) out.add(mapped);
  }
  return [...out];
};
