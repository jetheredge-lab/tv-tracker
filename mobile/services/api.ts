import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MediaType,
  CalendarEpisode,
  RecommendationSection,
  Show,
  UserProfile,
  WatchlistItem,
  WatchlistStatus,
} from '../types';

const AUTH_TOKEN_KEY = '@tvtracker_auth_token';

// Automatically resolve localhost for Android Emulator (10.0.2.2) vs iOS Simulator (localhost) or Cloudflare Tunnel
const getBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Check if EAS/Expo config has tunnel URL
  const customApiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (customApiUrl) {
    return customApiUrl;
  }
  
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0];
    return `http://${ip}:4000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }
  return 'http://localhost:4000';
};

export const API_BASE_URL = getBaseUrl();

// Nothing may go out before /api/users/sync has persisted the JWT: screens
// gate their queries on `userId`, which the store publishes as soon as the id
// is known, so the very first watchlist fetch would otherwise race the token
// and come back 401. useUserStore registers the in-flight sync here.
let authReady: Promise<void> | null = null;

export const setAuthReady = (pending: Promise<unknown>): void => {
  // Swallow the rejection: a failed sync (offline) must let requests through
  // rather than wedge every later call on a permanently pending gate.
  authReady = pending.then(
    () => undefined,
    () => undefined
  );
};

// The sync call itself must not wait on the gate it is opening.
const AUTH_GATE_EXEMPT = ['/api/users/sync'];

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Automatic JWT Authorization Header Interceptor
api.interceptors.request.use(
  async (config) => {
    if (authReady && !AUTH_GATE_EXEMPT.some((path) => config.url?.startsWith(path))) {
      await authReady;
    }

    try {
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Proceed without token if storage is unavailable
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/** Enough of a title to address it: exactly one of the two ids is meaningful. */
export type TitleRef = {
  mediaType?: MediaType | null;
  tvmazeId?: number | null;
  tmdbId?: number | null;
};

const isMovieRef = (t: TitleRef): boolean =>
  t.mediaType === 'MOVIE' || (!t.tvmazeId && Boolean(t.tmdbId));

export const apiService = {
  // Shows
  searchShows: async (query: string): Promise<Show[]> => {
    const response = await api.get<{ results: Show[] }>(`/api/shows/search`, {
      params: { q: query },
    });
    return response.data.results;
  },

  getTrendingShows: async (): Promise<Show[]> => {
    const response = await api.get<{ results: Show[] }>('/api/shows/trending');
    return response.data.results;
  },

  getShowDetails: async (idOrTvmazeId: string | number): Promise<Show> => {
    const response = await api.get<{ show: Show }>(`/api/shows/${idOrTvmazeId}`);
    return response.data.show;
  },

  getSimilarShows: async (idOrTvmazeId: string | number): Promise<Show[]> => {
    const response = await api.get<{ results: Show[] }>(`/api/shows/${idOrTvmazeId}/similar`);
    return response.data.results;
  },

  // Movies
  searchMovies: async (query: string): Promise<Show[]> => {
    const response = await api.get<{ results: Show[] }>('/api/movies/search', {
      params: { q: query },
    });
    return response.data.results;
  },

  getTrendingMovies: async (): Promise<Show[]> => {
    const response = await api.get<{ results: Show[] }>('/api/movies/trending');
    return response.data.results;
  },

  getMovieDetails: async (tmdbId: string | number): Promise<Show> => {
    const response = await api.get<{ show: Show }>(`/api/movies/${tmdbId}`);
    return response.data.show;
  },

  // Watchlist
  getUserWatchlist: async (userId?: string): Promise<WatchlistItem[]> => {
    const endpoint = userId ? `/api/watchlist/${userId}` : '/api/watchlist';
    const response = await api.get<{ watchlist: WatchlistItem[] }>(endpoint);
    return response.data.watchlist;
  },

  /**
   * One watchlist, both media. Pass the title itself - a Show satisfies
   * TitleRef - and the right id is sent for whichever catalogue owns it.
   */
  addToWatchlist: async (
    userId: string,
    title: TitleRef,
    status: WatchlistStatus = 'WATCHING',
    rating?: number | null,
    isFavorite = false,
    preferredRegion = 'US'
  ): Promise<WatchlistItem> => {
    const response = await api.post<{ item: WatchlistItem }>('/api/watchlist', {
      userId,
      ...(isMovieRef(title) ? { tmdbId: title.tmdbId } : { tvmazeId: title.tvmazeId }),
      status,
      rating,
      isFavorite,
      preferredRegion,
    });
    return response.data.item;
  },

  updateWatchlist: async (
    id: string,
    status?: WatchlistStatus,
    rating?: number | null,
    isFavorite?: boolean,
    preferredRegion?: string
  ): Promise<WatchlistItem> => {
    const response = await api.patch<{ item: WatchlistItem }>(`/api/watchlist/${id}`, {
      status,
      rating,
      isFavorite,
      preferredRegion,
    });
    return response.data.item;
  },

  removeFromWatchlist: async (id: string): Promise<void> => {
    await api.delete(`/api/watchlist/${id}`);
  },

  // Recommendations
  getPersonalizedRecommendations: async (userId?: string): Promise<RecommendationSection[]> => {
    const endpoint = userId ? `/api/recommendations/${userId}` : '/api/recommendations';
    const response = await api.get<{ sections: RecommendationSection[] }>(endpoint);
    return response.data.sections;
  },

  dismissRecommendation: async (
    userId?: string,
    tvmazeId?: number,
    showId?: string
  ): Promise<void> => {
    await api.post(`/api/recommendations/dismiss`, {
      userId,
      tvmazeId,
      showId,
    });
  },

  // Calendar
  getCalendarEpisodes: async (
    userId: string,
    month?: number,
    year?: number
  ): Promise<CalendarEpisode[]> => {
    const response = await api.get<{ episodes: CalendarEpisode[] }>(`/api/calendar/${userId}/episodes`, {
      params: { month, year },
    });
    return response.data.episodes;
  },

  // Users & Preferences
  syncUser: async (
    userId: string,
    email?: string,
    pushToken?: string,
    preferredRegion = 'US'
  ): Promise<UserProfile> => {
    const response = await api.post<{ user: UserProfile }>('/api/users/sync', {
      userId,
      email,
      pushToken,
      preferredRegion,
    });
    return response.data.user;
  },

  updateUserPreferences: async (
    userId: string,
    data: Partial<UserProfile>
  ): Promise<UserProfile> => {
    const response = await api.patch<{ user: UserProfile }>(`/api/users/${userId}`, data);
    return response.data.user;
  },
};
