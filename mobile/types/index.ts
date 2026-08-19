/** WATCHED is the film equivalent of COMPLETED: a movie is watched in one
 *  sitting, and "completed" describes finishing a run of episodes. */
export type WatchlistStatus =
  | 'WATCHING'
  | 'COMPLETED'
  | 'WATCHED'
  | 'PLAN_TO_WATCH'
  | 'DROPPED'
  | 'ENDED';

export type MediaType = 'TV' | 'MOVIE';

/** flatrate = included with a subscription; ads/free need no subscription. */
export type OfferType = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';

export interface TitleAvailability {
  providerId: number;
  providerName: string;
  offerType: OfferType;
  region: string;
  deepLink?: string | null;
  /**
   * null means the viewer has never told us their services - which renders as a
   * plain badge, NOT a greyed one. Silence is not evidence of subscribing to
   * nothing.
   */
  owned: boolean | null;
}

export interface ProviderOption {
  name: string;
  providerIds: number[];
  logoUrl?: string | null;
  priority: number;
}

export interface UserSubscriptions {
  configured: boolean;
  region: string;
  subscriptions: Array<{ providerId: number; providerName: string }>;
}

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
  /** Which kind of title this is. Absent on older payloads, so treat it as TV. */
  mediaType?: MediaType | null;
  /** Null for movies - TVmaze indexes television only. */
  tvmazeId: number | null;
  tmdbId?: number | null;
  title: string;
  summary?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  status: string;
  genres: string[];
  network?: string | null;
  premiered?: string | null;
  /** Movies: theatrical release date. */
  releaseDate?: string | null;
  /** Movies: feature length in minutes. */
  runtime?: number | null;
  rating?: number | null;
  /** Set on recommendation cards: why this show was picked. */
  reason?: string;
  availability?: TitleAvailability[] | null;
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
  /** A film contributes a release date, not an episode. */
  kind?: 'episode' | 'movie_release';
  releaseKind?: 'theatrical' | 'digital' | null;
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
    mediaType?: MediaType | null;
    tvmazeId: number | null;
    tmdbId?: number | null;
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
