import axios, { AxiosInstance } from 'axios';
import { TMDBResponse, TMDBShow } from '../types/index.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const SIMILAR_TTL_MS = 24 * 60 * 60 * 1000;
const TRENDING_TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry<T> {
  expires: number;
  value: T;
}

/**
 * TMDB supplies the editorial "viewers also watched" signal. It is optional:
 * with no credentials the recommender falls back to content-based scoring over
 * the local TVmaze catalog, which is why there are no hardcoded title lists
 * here any more - those were what made every user see the same five shows.
 */
export class TmdbService {
  private similarCache = new Map<string, CacheEntry<string[]>>();
  private trendingCache: CacheEntry<string[]> | null = null;
  private client: AxiosInstance = axios.create({ baseURL: TMDB_BASE_URL, timeout: 6000 });

  // Read at call time, never at construction: this module is imported before
  // index.ts runs dotenv.config(), so a field initializer would capture the
  // env as empty and silently disable TMDB forever.
  private get apiKey(): string | null {
    return process.env.TMDB_API_KEY?.trim() || null;
  }

  // v3 query-param key and v4 bearer token are both accepted; either works.
  private get accessToken(): string | null {
    return process.env.TMDB_ACCESS_TOKEN?.trim() || null;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey || this.accessToken);
  }

  private get headers() {
    const token = this.accessToken;
    return token
      ? { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      : { Accept: 'application/json' };
  }

  private params(extra: Record<string, unknown> = {}) {
    // The bearer token authenticates via header; the v3 key rides on the query.
    return this.accessToken ? extra : { api_key: this.apiKey, ...extra };
  }

  async searchShow(title: string): Promise<TMDBShow | null> {
    if (!this.isConfigured) return null;
    try {
      const res = await this.client.get<TMDBResponse<TMDBShow>>('/search/tv', {
        params: this.params({ query: title, include_adult: false }),
        headers: this.headers,
      });
      return res.data.results?.[0] || null;
    } catch (err) {
      console.warn(`[TmdbService] searchShow error for "${title}":`, (err as Error).message);
      return null;
    }
  }

  private async titlesFrom(path: string): Promise<string[]> {
    try {
      const res = await this.client.get<TMDBResponse<TMDBShow>>(path, {
        params: this.params(),
        headers: this.headers,
      });
      return (res.data.results || []).map(s => s.name).filter(Boolean);
    } catch (err) {
      console.warn(`[TmdbService] ${path} error:`, (err as Error).message);
      return [];
    }
  }

  /**
   * Titles TMDB associates with a show, best first. `/recommendations` is the
   * behavioural signal, `/similar` the metadata one - merged, dedup'd.
   */
  async getSimilarTitlesForShow(title: string, _genres: string[] = []): Promise<string[]> {
    if (!this.isConfigured) return [];

    const key = title.toLowerCase().trim();
    const hit = this.similarCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const show = await this.searchShow(title);
    if (!show) {
      this.similarCache.set(key, { expires: Date.now() + SIMILAR_TTL_MS, value: [] });
      return [];
    }

    const [recs, similar] = await Promise.all([
      this.titlesFrom(`/tv/${show.id}/recommendations`),
      this.titlesFrom(`/tv/${show.id}/similar`),
    ]);

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const t of [...recs, ...similar]) {
      const k = t.toLowerCase().trim();
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(t);
    }

    this.similarCache.set(key, { expires: Date.now() + SIMILAR_TTL_MS, value: merged });
    return merged;
  }

  async getTrendingTitles(): Promise<string[]> {
    if (!this.isConfigured) return [];
    if (this.trendingCache && this.trendingCache.expires > Date.now()) return this.trendingCache.value;

    const titles = await this.titlesFrom('/trending/tv/week');
    this.trendingCache = { expires: Date.now() + TRENDING_TTL_MS, value: titles };
    return titles;
  }

  /**
   * Highly rated shows in a genre, used to widen thin rows when TMDB is on.
   */
  async discoverByGenre(genreId: number, page = 1): Promise<string[]> {
    if (!this.isConfigured) return [];
    try {
      const res = await this.client.get<TMDBResponse<TMDBShow>>('/discover/tv', {
        params: this.params({
          with_genres: genreId,
          sort_by: 'vote_average.desc',
          'vote_count.gte': 200,
          page,
        }),
        headers: this.headers,
      });
      return (res.data.results || []).map(s => s.name);
    } catch (err) {
      console.warn('[TmdbService] discoverByGenre error:', (err as Error).message);
      return [];
    }
  }
}

export const tmdbService = new TmdbService();
export default tmdbService;
