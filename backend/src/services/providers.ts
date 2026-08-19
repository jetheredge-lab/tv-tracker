import { tmdbGet, tmdbImage } from './tmdbClient.js';

/**
 * One name per streaming service.
 *
 * TMDB lists every commercial variant of a service separately: Paramount+ alone
 * comes back as "Paramount Plus Premium", "Paramount Plus Essential",
 * "Paramount+ Amazon Channel" and "Paramount+ Roku Premium Channel". A user who
 * ticks "Paramount+" in the picker would otherwise match none of them, and
 * every badge would render greyed out - the same silent mismatch the genre
 * vocabularies had, where nothing errors and the feature just quietly lies.
 *
 * Note what is deliberately NOT merged: "Apple TV" (id 350) is the Apple TV+
 * subscription, while "Apple TV Store" (id 2) is iTunes rentals. Those are
 * different products and a subscription to one buys nothing on the other.
 */

/** Resellers that carry someone else's service. The brand is what matters. */
const RESELLER_SUFFIXES = [
  ' Amazon Channel',
  ' Apple TV Channel',
  ' Roku Premium Channel',
  ' Verizon Channel',
];

/** Pricing tiers of one service, longest first so "Premium Plus" wins over "Premium". */
const TIER_SUFFIXES = [
  ' Premium Plus',
  ' Standard with Ads',
  ' with Ads',
  ' Ad-Free',
  ' Premium',
  ' Essential',
  ' Basic',
];

/** Services TMDB still lists under an old brand. */
const RENAMES: Record<string, string> = {
  'HBO Max': 'Max',
  'Amazon Prime Video': 'Prime Video',
};

export const canonicalProviderName = (raw: string): string => {
  let name = (raw || '').trim();
  if (!name) return '';

  // Case-insensitively: TMDB writes "Paramount+ Amazon Channel" but
  // "Paramount Plus Apple TV channel", and an exact match misses the second.
  const endsWithCI = (haystack: string, needle: string): boolean =>
    haystack.toLowerCase().endsWith(needle.toLowerCase());

  for (const suffix of RESELLER_SUFFIXES) {
    if (endsWithCI(name, suffix)) name = name.slice(0, -suffix.length);
  }
  // Tiers are stripped BEFORE "Plus" becomes "+", or "Peacock Premium Plus"
  // would turn into "Peacock Premium+" and never match "Peacock".
  for (const suffix of TIER_SUFFIXES) {
    if (endsWithCI(name, suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  name = name.replace(/\sPlus$/i, '+');
  name = name.trim();

  return RENAMES[name] || name;
};

export interface ProviderOption {
  /** The name shown in the picker and stored against the user. */
  name: string;
  /** Every TMDB provider id that resolves to this brand. */
  providerIds: number[];
  logoUrl: string | null;
  /** TMDB's own ordering hint - lower is more mainstream. */
  priority: number;
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
  /** Global ordering hint. */
  display_priority?: number;
  /** Per-region ordering, which is the one worth using. */
  display_priorities?: Record<string, number>;
}

const priorityFor = (p: TmdbProvider, region: string): number =>
  p.display_priorities?.[region] ?? p.display_priority ?? 999;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; value: ProviderOption[] }>();

/** Beyond this, TMDB's list is a long tail of regional niches nobody subscribes to. */
const PICKER_PRIORITY_LIMIT = 60;

/**
 * The list the subscriptions picker is built from: film and television provider
 * lists merged, collapsed to one entry per brand, most mainstream first.
 */
export const getProviderCatalog = async (region = 'US'): Promise<ProviderOption[]> => {
  const key = region.toUpperCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const [movie, tv] = await Promise.all([
    tmdbGet<{ results: TmdbProvider[] }>('/watch/providers/movie', { watch_region: key }),
    tmdbGet<{ results: TmdbProvider[] }>('/watch/providers/tv', { watch_region: key }),
  ]);

  const byBrand = new Map<string, ProviderOption>();
  for (const p of [...(movie.results ?? []), ...(tv.results ?? [])]) {
    const name = canonicalProviderName(p.provider_name);
    if (!name) continue;
    const priority = priorityFor(p, key);

    const existing = byBrand.get(name);
    if (existing) {
      if (!existing.providerIds.includes(p.provider_id)) existing.providerIds.push(p.provider_id);
      // Keep the most mainstream variant's ordering and artwork.
      if (priority < existing.priority) {
        existing.priority = priority;
        existing.logoUrl = tmdbImage(p.logo_path, 'w92');
      }
    } else {
      byBrand.set(name, {
        name,
        providerIds: [p.provider_id],
        logoUrl: tmdbImage(p.logo_path, 'w92'),
        priority,
      });
    }
  }

  const value = [...byBrand.values()]
    .filter(p => p.priority <= PICKER_PRIORITY_LIMIT)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
};
