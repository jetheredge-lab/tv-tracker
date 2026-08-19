import { CandidateShow } from './catalog.js';

/**
 * A user's taste distilled from their watchlist. Everything the recommender
 * scores against lives here - genres, networks, era, language and the seed
 * shows that anchor the "Because you watched..." rows.
 */
export interface TasteProfile {
  genreWeights: Map<string, number>; // normalized to roughly -1..1
  providerWeights: Map<string, number>;
  dominantLanguage: string;
  allowedTypes: Set<string>;
  meanYear: number | null;
  positiveCount: number;
  totalCount: number;
  topGenres: string[]; // strongest positive genres, best first
  topProviders: string[];
  seeds: SeedShow[]; // ranked "because you watched" candidates, best first
  watchedTitles: Set<string>;
}

export interface SeedShow {
  showId: string;
  tvmazeId: number;
  title: string;
  genres: string[];
  provider: string | null;
  premieredYear: number | null;
  weight: number; // how strongly the user likes it
  reasonLabel: string;
}

export interface WatchlistLike {
  status: string;
  rating: number | null;
  isFavorite: boolean;
  show: {
    id: string;
    tvmazeId: number;
    title: string;
    genres: string[];
    network: string | null;
    premiered: Date | null;
    rating: number | null;
  };
}

const STATUS_WEIGHT: Record<string, number> = {
  WATCHING: 1.5,
  COMPLETED: 1.2,
  ENDED: 1.0,
  PLAN_TO_WATCH: 0.5,
  DROPPED: -1.2,
};

const RATING_WEIGHT: Record<number, number> = {
  5: 1.6,
  4: 0.8,
  3: 0.0,
  2: -0.9,
  1: -1.6,
};

// Types worth recommending. Anything else (Talk Show, Sports, News, Game Show)
// only makes the cut if the user actually watches that type.
const DEFAULT_TYPES = ['Scripted', 'Animation', 'Documentary'];

export function buildTasteProfile(
  watchlists: WatchlistLike[],
  catalogById: (tvmazeId: number) => CandidateShow | undefined
): TasteProfile {
  const genreRaw = new Map<string, number>();
  const providerRaw = new Map<string, number>();
  const languageCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const watchedTitles = new Set<string>();
  const seeds: SeedShow[] = [];

  let yearSum = 0;
  let yearCount = 0;
  let positiveCount = 0;

  for (const w of watchlists) {
    const weight = entryWeight(w);
    const show = w.show;
    watchedTitles.add(show.title.toLowerCase().trim());

    const genres = show.genres || [];
    // sqrt-normalize so a 5-genre show does not outvote a 2-genre show
    const perGenre = weight / Math.sqrt(Math.max(genres.length, 1));
    for (const g of genres) {
      genreRaw.set(g, (genreRaw.get(g) || 0) + perGenre);
    }

    const catalogEntry = catalogById(show.tvmazeId);
    const provider = show.network || catalogEntry?.provider || null;
    if (provider) providerRaw.set(provider, (providerRaw.get(provider) || 0) + weight);

    if (catalogEntry?.language) {
      languageCounts.set(catalogEntry.language, (languageCounts.get(catalogEntry.language) || 0) + 1);
    }
    if (catalogEntry?.type && weight > 0) {
      typeCounts.set(catalogEntry.type, (typeCounts.get(catalogEntry.type) || 0) + 1);
    }

    const year = show.premiered ? show.premiered.getUTCFullYear() : catalogEntry?.premieredYear ?? null;
    if (year && weight > 0) {
      yearSum += year * weight;
      yearCount += weight;
    }

    if (weight > 0) positiveCount++;

    // Seed eligibility: only shows the user demonstrably likes, and only ones
    // with genres to match against.
    if (weight >= 1.5 && genres.length > 0) {
      seeds.push({
        showId: show.id,
        tvmazeId: show.tvmazeId,
        title: show.title,
        genres,
        provider,
        premieredYear: year,
        weight,
        reasonLabel: w.isFavorite
          ? 'Based on your favorites'
          : w.rating
          ? `Based on your ${w.rating}-star rating`
          : w.status === 'WATCHING'
          ? "Because you're watching it now"
          : 'Similar themes and genre',
      });
    }
  }

  const genreWeights = normalizeMap(genreRaw);
  const providerWeights = normalizeMap(providerRaw);

  const topGenres = [...genreWeights.entries()]
    .filter(([, v]) => v > 0.2)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);

  const topProviders = [...providerWeights.entries()]
    .filter(([, v]) => v > 0.3)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  const allowedTypes = new Set(DEFAULT_TYPES);
  for (const [t, n] of typeCounts.entries()) {
    if (n >= 1) allowedTypes.add(t);
  }

  const dominantLanguage =
    [...languageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'English';

  seeds.sort((a, b) => b.weight - a.weight);

  return {
    genreWeights,
    providerWeights,
    dominantLanguage,
    allowedTypes,
    meanYear: yearCount > 0 ? Math.round(yearSum / yearCount) : null,
    positiveCount,
    totalCount: watchlists.length,
    topGenres,
    topProviders,
    seeds,
    watchedTitles,
  };
}

function entryWeight(w: WatchlistLike): number {
  let weight = STATUS_WEIGHT[w.status] ?? 0.5;
  if (w.isFavorite) weight += 1.5;
  if (w.rating && RATING_WEIGHT[w.rating] !== undefined) weight += RATING_WEIGHT[w.rating];
  return clamp(weight, -2, 4);
}

function normalizeMap(raw: Map<string, number>): Map<string, number> {
  const max = Math.max(1e-6, ...[...raw.values()].map(v => Math.abs(v)));
  const out = new Map<string, number>();
  for (const [k, v] of raw.entries()) out.set(k, v / max);
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Deterministic 0..1 hash - used for daily rotation so a user's rows change
 * day to day but stay stable within a day (and across a refresh).
 */
export function seededUnit(...parts: (string | number)[]): number {
  const str = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const x of a) if (setB.has(x)) shared++;
  return shared / (a.length + b.length - shared);
}
