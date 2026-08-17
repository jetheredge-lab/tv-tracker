import axios from 'axios';
import { TMDBResponse, TMDBShow } from '../types/index.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Curated high-fidelity similarity graph for intelligent heuristic recommendations
const SHOW_SIMILARITY_GRAPH: Record<string, string[]> = {
  'severance': ['Silo', 'Dark', 'Black Mirror', 'Mr. Robot', 'Devs', 'Maniac', 'Counterpart'],
  'the bear': ['Succession', 'Beef', 'Boiling Point', 'Industry', 'Fleabag', 'Atlanta', 'Ramy'],
  'house of the dragon': ['Game of Thrones', 'The Lord of the Rings: The Rings of Power', 'The Witcher', 'Succession', 'The Last of Us'],
  'the last of us': ['Fallout', 'Station Eleven', 'The Walking Dead', 'Sweet Tooth', 'Silo', 'Chernobyl'],
  'fallout': ['The Last of Us', 'Silo', 'Twisted Metal', 'The Boys', 'Westworld', 'Severance'],
  'stranger things': ['Dark', 'Locke & Key', 'Wednesday', 'The Umbrella Academy', 'Paper Girls'],
  'the boys': ['Invincible', 'Peacemaker', 'Gen V', 'Watchmen', 'Fallout', 'Preacher'],
  'shogun': ['Blue Eye Samurai', 'Marco Polo', 'Tokyo Vice', 'Vikings', 'Kingdom', 'The Last Kingdom'],
  'ted lasso': ['Shrinking', 'Schitt\'s Creek', 'Parks and Recreation', 'The Good Place', 'Trying', 'Hacks'],
  'succession': ['The Bear', 'Industry', 'Billions', 'Mad Men', 'House of the Dragon', 'White Lotus'],
  'silo': ['Severance', 'Fallout', 'The Last of Us', 'Foundation', 'Snowpiercer', 'Dark'],
  'yellowstone': ['1883', '1923', 'Mayor of Kingstown', 'Tulsa King', 'Justified', 'Longmire'],
  'poker face': ['Columbo', 'Only Murders in the Building', 'Knives Out', 'Monk', 'Elsbeth', 'The Flight Attendant'],
};

export class TmdbService {
  private apiKey = process.env.TMDB_API_KEY || null;

  /**
   * Search for TV show on TMDB by title
   */
  async searchShow(title: string): Promise<TMDBShow | null> {
    if (!this.apiKey) return null;
    try {
      const res = await axios.get<TMDBResponse<TMDBShow>>(`${TMDB_BASE_URL}/search/tv`, {
        params: {
          api_key: this.apiKey,
          query: title,
        },
        timeout: 5000,
      });

      if (res.data.results && res.data.results.length > 0) {
        return res.data.results[0];
      }
      return null;
    } catch (err) {
      console.warn(`[TmdbService] searchShow error for "${title}":`, err);
      return null;
    }
  }

  /**
   * Get TMDB recommendations for a show
   */
  async getRecommendations(tmdbId: number): Promise<string[]> {
    if (!this.apiKey) return [];
    try {
      const res = await axios.get<TMDBResponse<TMDBShow>>(
        `${TMDB_BASE_URL}/tv/${tmdbId}/recommendations`,
        {
          params: { api_key: this.apiKey },
          timeout: 5000,
        }
      );
      return (res.data.results || []).map(s => s.name);
    } catch (err) {
      console.warn(`[TmdbService] getRecommendations error for tmdbId ${tmdbId}:`, err);
      return [];
    }
  }

  /**
   * Get similar shows by show title (using TMDB or similarity graph heuristic)
   */
  async getSimilarTitlesForShow(title: string, genres: string[] = []): Promise<string[]> {
    const normalized = title.toLowerCase().trim();

    // 1. Try real TMDB if key available
    if (this.apiKey) {
      const tmdbShow = await this.searchShow(title);
      if (tmdbShow) {
        const recs = await this.getRecommendations(tmdbShow.id);
        if (recs.length > 0) return recs;
      }
    }

    // 2. Check Curated Similarity Graph
    if (SHOW_SIMILARITY_GRAPH[normalized]) {
      return SHOW_SIMILARITY_GRAPH[normalized];
    }

    // Fuzzy matching in graph
    for (const [key, similarList] of Object.entries(SHOW_SIMILARITY_GRAPH)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return similarList;
      }
    }

    // 3. Fallback based on genre match
    if (genres.includes('Drama') && genres.includes('Mystery')) {
      return ['Severance', 'Dark', 'Black Mirror', 'Mr. Robot', 'Devs'];
    }
    if (genres.includes('Comedy')) {
      return ['Ted Lasso', 'Shrinking', 'The Bear', 'Hacks', 'Schitt\'s Creek'];
    }
    if (genres.includes('Sci-Fi') || genres.includes('Science-Fiction')) {
      return ['Silo', 'Fallout', 'The Last of Us', 'Severance', 'Foundation'];
    }

    return ['Severance', 'The Bear', 'House of the Dragon', 'Fallout', 'Stranger Things'];
  }

  /**
   * Get weekly trending TV show titles
   */
  async getTrendingTitles(): Promise<string[]> {
    if (this.apiKey) {
      try {
        const res = await axios.get<TMDBResponse<TMDBShow>>(`${TMDB_BASE_URL}/trending/tv/week`, {
          params: { api_key: this.apiKey },
          timeout: 5000,
        });
        if (res.data.results && res.data.results.length > 0) {
          return res.data.results.map(s => s.name);
        }
      } catch (err) {
        console.warn('[TmdbService] getTrendingTitles API error, fallback to curated trending:', err);
      }
    }

    return [
      'Severance',
      'The Bear',
      'House of the Dragon',
      'The Last of Us',
      'Fallout',
      'Stranger Things',
      'The Boys',
      'Shogun',
      'Ted Lasso',
      'Silo',
    ];
  }
}

export const tmdbService = new TmdbService();
export default tmdbService;
