export interface TVmazeShow {
  id: number;
  url: string;
  name: string;
  type: string;
  language: string;
  genres: string[];
  status: string;
  runtime: number | null;
  averageRuntime: number | null;
  premiered: string | null;
  ended: string | null;
  officialSite: string | null;
  schedule?: {
    time: string;
    days: string[];
  };
  rating?: {
    average: number | null;
  };
  network?: {
    id: number;
    name: string;
    country: {
      name: string;
      code: string;
      timezone: string;
    };
  } | null;
  webChannel?: {
    id: number;
    name: string;
    country: string | null;
    officialSite: string | null;
  } | null;
  image?: {
    medium: string;
    original: string;
  } | null;
  summary: string | null;
  _embedded?: {
    episodes?: TVmazeEpisode[];
    nextepisode?: TVmazeEpisode | null;
    previousepisode?: TVmazeEpisode | null;
  };
}

export interface TVmazeEpisode {
  id: number;
  url: string;
  name: string;
  season: number;
  number: number;
  type: string;
  airdate: string;
  airtime: string;
  airstamp: string;
  runtime: number | null;
  rating?: {
    average: number | null;
  };
  image?: {
    medium: string;
    original: string;
  } | null;
  summary: string | null;
  _links?: {
    self: { href: string };
    show: { href: string };
  };
  show?: TVmazeShow;
}

export interface TVmazeSearchResult {
  score: number;
  show: TVmazeShow;
}

export interface TMDBShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  origin_country?: string[];
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface WatchmodeSource {
  source_id: number;
  name: string;
  type: 'sub' | 'buy' | 'rent' | 'free' | 'tve';
  region: string;
  ios_url?: string;
  android_url?: string;
  web_url: string;
  format: string;
  price?: number | null;
  seasons?: number;
  episodes?: number;
}

export interface StreamingProviderInfo {
  providerName: string;
  logoUrl?: string;
  deepLink?: string;
  type: string;
  region: string;
}

export interface AddWatchlistDto {
  userId: string;
  tvmazeId: number;
  status?: 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH' | 'DROPPED' | 'ENDED';
  rating?: number | null;
  isFavorite?: boolean;
  preferredRegion?: string;
}

export interface UpdateWatchlistDto {
  status?: 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH' | 'DROPPED' | 'ENDED';
  rating?: number | null;
  isFavorite?: boolean;
  preferredRegion?: string;
}

export interface DismissRecommendationDto {
  userId: string;
  tvmazeId?: number;
  showId?: string;
}

export interface RecommendationSection {
  id: string;
  title: string;
  subtitle?: string;
  sourceShow?: {
    id: string;
    tvmazeId: number;
    title: string;
  };
  shows: Array<{
    id?: string;
    tvmazeId: number;
    tmdbId?: number | null;
    title: string;
    summary: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    status: string;
    genres: string[];
    network: string | null;
    premiered: string | null;
    rating: number | null;
    streamingProviders?: StreamingProviderInfo[];
  }>;
}

export interface UserSyncDto {
  userId?: string;
  email?: string;
  pushToken?: string;
  preferredRegion?: string;
}

export interface UpdateUserPreferencesDto {
  email?: string;
  pushToken?: string;
  pushAlertsEnabled?: boolean;
  emailAlertsEnabled?: boolean;
  preferredRegion?: string;
}
