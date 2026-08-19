import axios from 'axios';
import { StreamingProviderInfo, WatchmodeSource } from '../types/index.js';
import prisma from './prisma.js';

const WATCHMODE_BASE_URL = 'https://api.watchmode.com/v1';

// Catalog of known popular show providers and fallback mappings.
// No logoUrl anywhere: images.watchmode.com fails the TLS handshake for every
// client, so a logo URL here only renders a broken image. StreamingBadge draws
// the provider as a brand-coloured text pill instead.
const POPULAR_SHOW_PROVIDERS: Record<string, StreamingProviderInfo[]> = {
  severance: [
    { providerName: 'Apple TV+', deepLink: 'https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zpqvq6xwnqnxq', type: 'sub', region: 'US' },
  ],
  'house of the dragon': [
    { providerName: 'Max', deepLink: 'https://play.max.com', type: 'sub', region: 'US' },
  ],
  'the last of us': [
    { providerName: 'Max', deepLink: 'https://play.max.com', type: 'sub', region: 'US' },
  ],
  'stranger things': [
    { providerName: 'Netflix', deepLink: 'https://www.netflix.com', type: 'sub', region: 'US' },
  ],
  'the bear': [
    { providerName: 'Hulu', deepLink: 'https://www.hulu.com', type: 'sub', region: 'US' },
    { providerName: 'Disney+', deepLink: 'https://www.disneyplus.com', type: 'sub', region: 'US' },
  ],
  'the boys': [
    { providerName: 'Prime Video', deepLink: 'https://www.amazon.com/primevideo', type: 'sub', region: 'US' },
  ],
  fallout: [
    { providerName: 'Prime Video', deepLink: 'https://www.amazon.com/primevideo', type: 'sub', region: 'US' },
  ],
  shogun: [
    { providerName: 'Hulu', deepLink: 'https://www.hulu.com', type: 'sub', region: 'US' },
    { providerName: 'Disney+', deepLink: 'https://www.disneyplus.com', type: 'sub', region: 'US' },
  ],
  'the mandalorian': [
    { providerName: 'Disney+', deepLink: 'https://www.disneyplus.com', type: 'sub', region: 'US' },
  ],
  'ted lasso': [
    { providerName: 'Apple TV+', deepLink: 'https://tv.apple.com', type: 'sub', region: 'US' },
  ],
  'yellowstone': [
    { providerName: 'Peacock', deepLink: 'https://www.peacocktv.com', type: 'sub', region: 'US' },
    { providerName: 'Paramount+', deepLink: 'https://www.paramountplus.com', type: 'sub', region: 'US' },
  ],
  'poker face': [
    { providerName: 'Peacock', deepLink: 'https://www.peacocktv.com', type: 'sub', region: 'US' },
  ]
};

const NETWORK_TO_PROVIDER: Record<string, { providerName: string; deepLink: string }> = {
  'apple tv+': { providerName: 'Apple TV+', deepLink: 'https://tv.apple.com' },
  'netflix': { providerName: 'Netflix', deepLink: 'https://www.netflix.com' },
  'hbo': { providerName: 'Max', deepLink: 'https://play.max.com' },
  'max': { providerName: 'Max', deepLink: 'https://play.max.com' },
  'disney+': { providerName: 'Disney+', deepLink: 'https://www.disneyplus.com' },
  'hulu': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'fx': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'fx on hulu': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'amazon': { providerName: 'Prime Video', deepLink: 'https://www.amazon.com/primevideo' },
  'prime video': { providerName: 'Prime Video', deepLink: 'https://www.amazon.com/primevideo' },
  'peacock': { providerName: 'Peacock', deepLink: 'https://www.peacocktv.com' },
  'nbc': { providerName: 'Peacock', deepLink: 'https://www.peacocktv.com' },
  'paramount+': { providerName: 'Paramount+', deepLink: 'https://www.paramountplus.com' },
  'cbs': { providerName: 'Paramount+', deepLink: 'https://www.paramountplus.com' },
  'amc': { providerName: 'AMC+', deepLink: 'https://www.amcplus.com' },
  'amc+': { providerName: 'AMC+', deepLink: 'https://www.amcplus.com' },
  'showtime': { providerName: 'Paramount+ with Showtime', deepLink: 'https://www.paramountplus.com' },
  'starz': { providerName: 'Starz', deepLink: 'https://www.starz.com' },
  // Recommendation cards are resolved by network alone, so the map has to
  // cover the long tail - anything missing shows a generic "buy / rent" badge.
  'abc': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'freeform': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'fxx': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'fox': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'the cw': { providerName: 'The CW', deepLink: 'https://www.cwtv.com' },
  'usa network': { providerName: 'Peacock', deepLink: 'https://www.peacocktv.com' },
  'bravo': { providerName: 'Peacock', deepLink: 'https://www.peacocktv.com' },
  'syfy': { providerName: 'Peacock', deepLink: 'https://www.peacocktv.com' },
  'comedy central': { providerName: 'Paramount+', deepLink: 'https://www.paramountplus.com' },
  'mtv': { providerName: 'Paramount+', deepLink: 'https://www.paramountplus.com' },
  'nickelodeon': { providerName: 'Paramount+', deepLink: 'https://www.paramountplus.com' },
  'adult swim': { providerName: 'Max', deepLink: 'https://play.max.com' },
  'cartoon network': { providerName: 'Max', deepLink: 'https://play.max.com' },
  'cnn': { providerName: 'Max', deepLink: 'https://play.max.com' },
  'tbs': { providerName: 'Max', deepLink: 'https://play.max.com' },
  'tnt': { providerName: 'Max', deepLink: 'https://play.max.com' },
  'discovery': { providerName: 'Discovery+', deepLink: 'https://www.discoveryplus.com' },
  'hgtv': { providerName: 'Discovery+', deepLink: 'https://www.discoveryplus.com' },
  'food network': { providerName: 'Discovery+', deepLink: 'https://www.discoveryplus.com' },
  'tlc': { providerName: 'Discovery+', deepLink: 'https://www.discoveryplus.com' },
  'bbc one': { providerName: 'BritBox', deepLink: 'https://www.britbox.com' },
  'bbc two': { providerName: 'BritBox', deepLink: 'https://www.britbox.com' },
  'bbc three': { providerName: 'BritBox', deepLink: 'https://www.britbox.com' },
  'itv': { providerName: 'BritBox', deepLink: 'https://www.britbox.com' },
  'channel 4': { providerName: 'BritBox', deepLink: 'https://www.britbox.com' },
  'pbs': { providerName: 'PBS', deepLink: 'https://www.pbs.org' },
  'crunchyroll': { providerName: 'Crunchyroll', deepLink: 'https://www.crunchyroll.com' },
  'apple tv': { providerName: 'Apple TV+', deepLink: 'https://tv.apple.com' },
  'sundancetv': { providerName: 'AMC+', deepLink: 'https://www.amcplus.com' },
  'a&e': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
  'history': { providerName: 'Hulu', deepLink: 'https://www.hulu.com' },
};

export class WatchmodeService {
  // Read at call time: this module is imported before index.ts runs
  // dotenv.config(), so a field initializer captures an empty env.
  private get apiKey(): string | null {
    return process.env.WATCHMODE_API_KEY?.trim() || null;
  }

  /**
   * Resolve streaming providers for a given show
   */
  async getStreamingProviders(
    title: string,
    network: string | null = null,
    region = 'US'
  ): Promise<StreamingProviderInfo[]> {
    // If API key is provided, try real Watchmode API call
    if (this.apiKey) {
      try {
        const providers = await this.fetchFromWatchmodeApi(title, region);
        if (providers.length > 0) return providers;
      } catch (err) {
        console.warn(`[WatchmodeService] API lookup failed for "${title}", falling back to heuristics:`, err);
      }
    }

    return this.getProvidersFromHeuristics(title, network, region);
  }

  /**
   * Offline provider resolution: title catalog, then network mapping, then a
   * generic buy/rent link. No HTTP, so recommendation rows can badge dozens of
   * cards without burning Watchmode credits.
   */
  getProvidersFromHeuristics(
    title: string,
    network: string | null = null,
    region = 'US'
  ): StreamingProviderInfo[] {
    // Heuristic 1: Check known popular shows catalog
    const normalizedTitle = title.toLowerCase().trim();
    if (POPULAR_SHOW_PROVIDERS[normalizedTitle]) {
      return POPULAR_SHOW_PROVIDERS[normalizedTitle].map(p => ({ ...p, region }));
    }

    // Heuristic 2: Check matching network name. Exact match wins; substring
    // matching is only allowed for keys long enough not to collide (an
    // unbounded two-way `includes` let "fx" claim half the map).
    if (network) {
      const normalizedNetwork = network.toLowerCase().trim();
      const exact = NETWORK_TO_PROVIDER[normalizedNetwork];
      if (exact) {
        return [{ ...exact, type: 'sub', region }];
      }
      for (const [netKey, prov] of Object.entries(NETWORK_TO_PROVIDER)) {
        if (netKey.length >= 3 && normalizedNetwork.includes(netKey)) {
          return [
            {
              providerName: prov.providerName,
              deepLink: prov.deepLink,
              type: 'sub',
              region,
            },
          ];
        }
      }
    }

    // Fallback default: General streaming / purchase option
    return [
      {
        providerName: 'Buy / Rent (Apple / Prime / Google)',
        deepLink: `https://www.google.com/search?q=where+to+watch+${encodeURIComponent(title)}`,
        type: 'buy',
        region,
      },
    ];
  }

  /**
   * Real Watchmode API Integration
   */
  private async fetchFromWatchmodeApi(title: string, region: string): Promise<StreamingProviderInfo[]> {
    const searchRes = await axios.get(`${WATCHMODE_BASE_URL}/search/`, {
      params: {
        apiKey: this.apiKey,
        search_field: 'name',
        search_value: title,
        types: 'tv',
      },
      timeout: 5000,
    });

    const titleResults = searchRes.data?.title_results;
    if (!titleResults || titleResults.length === 0) {
      return [];
    }

    const titleId = titleResults[0].id;
    const sourcesRes = await axios.get<WatchmodeSource[]>(`${WATCHMODE_BASE_URL}/title/${titleId}/sources/`, {
      params: {
        apiKey: this.apiKey,
        regions: region,
      },
      timeout: 5000,
    });

    // Deduplicate and format sources
    const seen = new Set<string>();
    const providers: StreamingProviderInfo[] = [];

    for (const src of sourcesRes.data || []) {
      if (src.region === region && !seen.has(src.name)) {
        seen.add(src.name);
        providers.push({
          providerName: src.name,
          deepLink: src.web_url || src.ios_url || src.android_url,
          type: src.type || 'sub',
          region: src.region,
        });
      }
    }

    return providers;
  }

  /**
   * Synchronize streaming providers for a show in PostgreSQL
   */
  async syncStreamingProvidersForShow(
    showId: string,
    title: string,
    network: string | null = null,
    region = 'US'
  ) {
    const providers = await this.getStreamingProviders(title, network, region);

    // Delete existing providers for this show & region to avoid stale duplicates
    await prisma.streamingProvider.deleteMany({
      where: { showId, region },
    });

    // Upsert fresh providers
    for (const p of providers) {
      await prisma.streamingProvider.create({
        data: {
          showId,
          providerName: p.providerName,
          logoUrl: p.logoUrl,
          deepLink: p.deepLink,
          type: p.type,
          region: p.region,
        },
      });
    }
  }
}

export const watchmodeService = new WatchmodeService();
export default watchmodeService;
