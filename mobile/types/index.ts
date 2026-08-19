export type WatchlistStatus = 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH' | 'DROPPED' | 'ENDED';

export interface StreamingProvider {
  id?: string;
  providerName: string;
  logoUrl?: string | null;
  deepLink?: string | null;
  type?: string;
  region?: string;
}

export interface Episode {
  id: string;
  tvmazeEpisodeId?: number | null;
  season: number;
  number: number;
  title: string;
  airdate?: string | null;
  airtime?: string | null;
  summary?: string | null;
  runtime?: number | null;
  image?: string | null;
}

export interface Show {
  id: string;
  tvmazeId: number;
  tmdbId?: number | null;
  title: string;
  summary?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  status: string;
  genres: string[];
  network?: string | null;
  premiered?: string | null;
  rating?: number | null;
  /** Set on recommendation cards: why this show was picked. */
  reason?: string;
  streamingProviders?: StreamingProvider[];
  episodes?: Episode[];
  totalEpisodes?: number;
  nextEpisode?: Episode | null;
  latestAiredEpisode?: Episode | null;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  showId: string;
  status: WatchlistStatus;
  rating?: number | null; // User rating (1-5)
  isFavorite: boolean;
  preferredRegion: string;
  createdAt: string;
  updatedAt: string;
  show: Show;
}

export interface RecommendationSection {
  id: string;
  title: string;
  subtitle?: string;
  /** Row type, e.g. because_you_watched | genre | trending | hidden_gems. */
  kind?: string;
  sourceShow?: {
    id: string;
    tvmazeId: number;
    title: string;
  };
  shows: Show[];
}

export interface CalendarEpisode {
  id: string;
  season: number;
  number: number;
  title: string;
  airdate: string;
  airtime?: string | null;
  summary?: string | null;
  runtime?: number | null;
  image?: string | null;
  show: {
    id: string;
    tvmazeId: number;
    title: string;
    posterUrl?: string | null;
    network?: string | null;
    streamingProviders?: StreamingProvider[];
  };
}

export interface UserProfile {
  id: string;
  email?: string | null;
  name?: string | null;
  pushToken?: string | null;
  pushAlertsEnabled: boolean;
  emailAlertsEnabled: boolean;
  preferredRegion: string;
  createdAt: string;
  updatedAt: string;
}
