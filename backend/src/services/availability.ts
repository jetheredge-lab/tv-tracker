import prisma from './prisma.js';
import { tmdbGet } from './tmdbClient.js';
import { canonicalProviderName } from './providers.js';

/**
 * Where a title can actually be watched, per region, from TMDB's JustWatch feed.
 *
 * This replaces the network -> provider heuristic for films, which had nothing
 * to key on (a movie has no broadcast network), and is a straight upgrade for
 * television too: the heuristic could only ever guess "HBO means Max", never
 * that a specific series left Max last month.
 *
 * Attribution to JustWatch is required wherever this is displayed.
 */

/** Ordered by how useful the offer is to someone deciding what to watch tonight. */
const OFFER_TYPES = ['flatrate', 'free', 'ads', 'rent', 'buy'] as const;
type OfferType = (typeof OFFER_TYPES)[number];

interface ProviderEntry {
  provider_id: number;
  provider_name: string;
  display_priority?: number;
}

type RegionBlock = { link?: string } & Partial<Record<OfferType, ProviderEntry[]>>;

interface TitleRef {
  id: string;
  tmdbId: number | null;
  mediaType: 'TV' | 'MOVIE';
  title: string;
}

/**
 * TV rows come from TVmaze and carry no TMDB id, but availability is a TMDB
 * lookup - so resolve the series once by title and keep it.
 *
 * Only safe now that uniqueness on tmdbId is per media type: before that, a
 * series resolving to id 550 would have collided with Fight Club.
 */
export const ensureTmdbId = async (show: TitleRef): Promise<number | null> => {
  if (show.tmdbId) return show.tmdbId;
  if (show.mediaType !== 'TV') return null;

  try {
    const found = await tmdbGet<{ results: Array<{ id: number }> }>('/search/tv', {
      query: show.title,
      include_adult: false,
    });
    const resolved = found.results?.[0]?.id ?? null;
    if (!resolved) return null;

    await prisma.show.update({ where: { id: show.id }, data: { tmdbId: resolved } });
    return resolved;
  } catch (err) {
    // Two series can resolve to one TMDB id, which the composite unique will
    // reject. Availability is enrichment - never fail the caller over it.
    console.warn(`[availability] could not resolve a TMDB id for "${show.title}":`, (err as Error).message);
    return null;
  }
};

/**
 * Refresh one title's availability for one region. Returns the row count.
 *
 * Variants are collapsed to one row per brand per offer type: TMDB lists
 * "Paramount Plus Premium", "Paramount Plus Essential" and "Paramount+ Amazon
 * Channel" separately, and four identical badges is not information.
 */
export const refreshAvailability = async (show: TitleRef, region = 'US'): Promise<number> => {
  const tmdbId = await ensureTmdbId(show);
  if (!tmdbId) return 0;

  const path =
    show.mediaType === 'MOVIE'
      ? `/movie/${tmdbId}/watch/providers`
      : `/tv/${tmdbId}/watch/providers`;

  let block: RegionBlock | undefined;
  try {
    const data = await tmdbGet<{ results: Record<string, RegionBlock> }>(path);
    block = data.results?.[region.toUpperCase()];
  } catch (err) {
    console.warn(`[availability] lookup failed for "${show.title}":`, (err as Error).message);
    return 0;
  }

  // Keep the most mainstream variant of each brand for each offer type.
  const best = new Map<string, { providerId: number; providerName: string; offerType: OfferType; priority: number }>();
  for (const offerType of OFFER_TYPES) {
    for (const entry of block?.[offerType] ?? []) {
      const providerName = canonicalProviderName(entry.provider_name);
      if (!providerName) continue;
      const key = `${providerName}::${offerType}`;
      const priority = entry.display_priority ?? 999;
      const existing = best.get(key);
      if (!existing || priority < existing.priority) {
        best.set(key, { providerId: entry.provider_id, providerName, offerType, priority });
      }
    }
  }

  const rows = [...best.values()].map(v => ({
    showId: show.id,
    providerId: v.providerId,
    providerName: v.providerName,
    offerType: v.offerType,
    region: region.toUpperCase(),
    // TMDB publishes one JustWatch link per title and region, not per provider.
    deepLink: block?.link ?? null,
  }));

  await prisma.$transaction([
    prisma.titleAvailability.deleteMany({ where: { showId: show.id, region: region.toUpperCase() } }),
    ...(rows.length ? [prisma.titleAvailability.createMany({ data: rows, skipDuplicates: true })] : []),
  ]);

  return rows.length;
};

/**
 * Decorate availability rows with whether the user actually subscribes.
 *
 * `owned: null` is load-bearing and means "the user has never told us", which
 * MUST render differently from `false`. An unstated preference is not evidence
 * that someone subscribes to nothing, and greying out every badge for a user
 * who simply skipped a settings screen would make the app look broken.
 */
export const markOwnership = <T extends { providerName: string; offerType: string }>(
  rows: T[],
  subscribed: Set<string> | null
): Array<T & { owned: boolean | null }> =>
  rows.map(row => ({
    ...row,
    owned:
      subscribed === null
        ? null
        : // Rent and buy are never "owned" - no subscription makes them free,
          // so they are presented as a price rather than as a service you have.
          row.offerType === 'rent' || row.offerType === 'buy'
          ? false
          : subscribed.has(row.providerName),
  }));

/** The user's services, or null when they have never saved the setting. */
export const getSubscribedNames = async (
  userId: string,
  region = 'US'
): Promise<Set<string> | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionsSetAt: true },
  });
  if (!user?.subscriptionsSetAt) return null;

  const rows = await prisma.userSubscription.findMany({
    where: { userId, region: region.toUpperCase() },
    select: { providerName: true },
  });
  return new Set(rows.map(r => canonicalProviderName(r.providerName)));
};


/**
 * Which films are currently included with a given set of services.
 *
 * Availability for a whole 26k-title pool cannot be fetched per title - that is
 * 26,000 requests. TMDB's discover endpoint answers the inverse question
 * directly ("what is on Netflix and Max right now, most popular first"), which
 * costs a handful of calls and is exactly what a "included with your
 * subscriptions" row needs.
 *
 * Deliberately shallow: this feeds a twelve-item row and a ranking nudge, not
 * an exhaustive index.
 */
const AVAILABLE_TTL_MS = 6 * 60 * 60 * 1000;
const AVAILABLE_PAGES = 10;

const availableCache = new Map<string, { expires: number; value: Set<number> }>();

export const getAvailableMovieIds = async (
  providerIds: number[],
  region = 'US'
): Promise<Set<number>> => {
  if (providerIds.length === 0) return new Set();

  const key = `${region}:${[...providerIds].sort((a, b) => a - b).join(',')}`;
  const hit = availableCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const ids = new Set<number>();
  for (let page = 1; page <= AVAILABLE_PAGES; page++) {
    try {
      const data = await tmdbGet<{ results: Array<{ id: number }>; total_pages: number }>(
        '/discover/movie',
        {
          watch_region: region.toUpperCase(),
          // "|" is OR in TMDB's filter syntax: on ANY of these services.
          with_watch_providers: providerIds.join('|'),
          with_watch_monetization_types: 'flatrate',
          sort_by: 'popularity.desc',
          include_adult: false,
          page,
        }
      );
      for (const m of data.results ?? []) ids.add(m.id);
      if (page >= (data.total_pages ?? 0)) break;
    } catch (err) {
      console.warn('[availability] discover-by-provider failed:', (err as Error).message);
      break;
    }
  }

  availableCache.set(key, { expires: Date.now() + AVAILABLE_TTL_MS, value: ids });
  return ids;
};

/** The TMDB provider ids behind the user's saved services. */
export const getSubscriptionProviderIds = async (
  userId: string,
  region = 'US'
): Promise<number[]> => {
  const rows = await prisma.userSubscription.findMany({
    where: { userId, region: region.toUpperCase() },
    select: { providerId: true },
  });
  return rows.map(r => r.providerId);
};
