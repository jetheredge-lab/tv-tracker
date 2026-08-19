import axios from 'axios';
import { TVmazeEpisode, TVmazeSearchResult, TVmazeShow } from '../types/index.js';
import prisma from './prisma.js';
import { watchmodeService } from './watchmode.js';
import { refreshAvailability } from './availability.js';

const TVMAZE_BASE_URL = 'https://api.tvmaze.com';

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export class TVmazeService {
  private client = axios.create({
    baseURL: TVMAZE_BASE_URL,
    timeout: 10000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'TVTracker/1.0',
    },
  });

  /**
   * Search shows by text query
   */
  async searchShows(query: string): Promise<TVmazeShow[]> {
    if (!query || query.trim().length === 0) return [];
    try {
      const response = await this.client.get<TVmazeSearchResult[]>(
        `/search/shows?q=${encodeURIComponent(query.trim())}`
      );
      return response.data.map(item => item.show);
    } catch (error) {
      console.error(`[TVmazeService] searchShows error for "${query}":`, error);
      throw new Error(`Failed to search shows on TVmaze: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch full show details with embedded episodes
   */
  async getShowDetails(tvmazeId: number): Promise<TVmazeShow> {
    try {
      const response = await this.client.get<TVmazeShow>(
        `/shows/${tvmazeId}?embed[]=episodes&embed[]=nextepisode&embed[]=previousepisode`
      );
      return response.data;
    } catch (error) {
      console.error(`[TVmazeService] getShowDetails error for id ${tvmazeId}:`, error);
      throw new Error(`Failed to fetch show details from TVmaze: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch all episodes for a show
   */
  async getEpisodes(tvmazeId: number): Promise<TVmazeEpisode[]> {
    try {
      const response = await this.client.get<TVmazeEpisode[]>(
        `/shows/${tvmazeId}/episodes`
      );
      return response.data;
    } catch (error) {
      console.error(`[TVmazeService] getEpisodes error for id ${tvmazeId}:`, error);
      throw new Error(`Failed to fetch episodes from TVmaze: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch daily schedule (country code or global)
   */
  async getSchedule(date: string, country = 'US'): Promise<TVmazeEpisode[]> {
    try {
      const url = country
        ? `/schedule?date=${date}&country=${country}`
        : `/schedule/full`;
      const response = await this.client.get<TVmazeEpisode[]>(url);
      return response.data;
    } catch (error) {
      console.error(`[TVmazeService] getSchedule error for ${date}:`, error);
      return [];
    }
  }

  /**
   * Synchronize a show and its full episode list into the local PostgreSQL database
   */
  async syncShowWithDb(tvmazeId: number, region = 'US') {
    const rawShow = await this.getShowDetails(tvmazeId);
    const networkName = rawShow.network?.name || rawShow.webChannel?.name || null;
    const cleanSummary = stripHtml(rawShow.summary);
    const posterUrl = rawShow.image?.original || rawShow.image?.medium || null;
    const backdropUrl = rawShow.image?.original || null;
    const premieredDate = rawShow.premiered ? new Date(rawShow.premiered) : null;
    const ratingValue = rawShow.rating?.average ? Number(rawShow.rating.average) : null;

    // Upsert Show
    const show = await prisma.show.upsert({
      where: { tvmazeId: rawShow.id },
      update: {
        title: rawShow.name,
        summary: cleanSummary,
        posterUrl,
        backdropUrl,
        status: rawShow.status || 'Running',
        genres: rawShow.genres || [],
        network: networkName,
        premiered: premieredDate,
        rating: ratingValue,
      },
      create: {
        tvmazeId: rawShow.id,
        title: rawShow.name,
        summary: cleanSummary,
        posterUrl,
        backdropUrl,
        status: rawShow.status || 'Running',
        genres: rawShow.genres || [],
        network: networkName,
        premiered: premieredDate,
        rating: ratingValue,
      },
    });

    // Upsert Episodes
    const episodes = rawShow._embedded?.episodes || (await this.getEpisodes(tvmazeId));
    if (episodes && episodes.length > 0) {
      for (const ep of episodes) {
        await prisma.episode.upsert({
          where: { tvmazeEpisodeId: ep.id },
          update: {
            season: ep.season,
            number: ep.number,
            title: ep.name || `Episode ${ep.number}`,
            airdate: ep.airdate || null,
            airtime: ep.airtime || null,
            summary: stripHtml(ep.summary),
            runtime: ep.runtime || null,
            image: ep.image?.original || ep.image?.medium || null,
          },
          create: {
            tvmazeEpisodeId: ep.id,
            showId: show.id,
            season: ep.season,
            number: ep.number,
            title: ep.name || `Episode ${ep.number}`,
            airdate: ep.airdate || null,
            airtime: ep.airtime || null,
            summary: stripHtml(ep.summary),
            runtime: ep.runtime || null,
            image: ep.image?.original || ep.image?.medium || null,
          },
        });
      }
    }

    // Refresh streaming providers
    try {
      await watchmodeService.syncStreamingProvidersForShow(show.id, show.title, networkName, region);
    } catch (err) {
      console.warn(`[TVmazeService] Streaming providers sync warning for "${show.title}":`, err);
    }

    // Real per-region availability, which the network heuristic above can only
    // approximate - it can guess "HBO means Max" but never that this series
    // left Max last month.
    try {
      await refreshAvailability(
        { id: show.id, tmdbId: show.tmdbId, mediaType: 'TV', title: show.title },
        region
      );
    } catch (err) {
      console.warn(`[TVmazeService] availability refresh failed for "${show.title}":`, (err as Error).message);
    }

    // Return complete populated show
    return prisma.show.findUnique({
      where: { id: show.id },
      include: {
        episodes: {
          orderBy: [{ season: 'asc' }, { number: 'asc' }],
        },
        streamingProviders: true,
      },
    });
  }
}

export const tvmazeService = new TVmazeService();
export default tvmazeService;
