import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
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

  // Watchlist
  getUserWatchlist: async (userId?: string): Promise<WatchlistItem[]> => {
    const endpoint = userId ? `/api/watchlist/${userId}` : '/api/watchlist';
    const response = await api.get<{ watchlist: WatchlistItem[] }>(endpoint);
    return response.data.watchlist;
  },

  addToWatchlist: async (
    userId: string,
    tvmazeId: number,
    status: WatchlistStatus = 'WATCHING',
    rating?: number | null,
    isFavorite = false,
    preferredRegion = 'US'
  ): Promise<WatchlistItem> => {
    const response = await api.post<{ item: WatchlistItem }>('/api/watchlist', {
      userId,
      tvmazeId,
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
