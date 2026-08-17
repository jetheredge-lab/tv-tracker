import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { api, API_BASE_URL } from '../services/api';
import { UserProfile } from '../types';

const USER_ID_STORAGE_KEY = '@tvtracker_user_id';
const REGION_STORAGE_KEY = '@tvtracker_region';

interface UserState {
  userId: string | null;
  email: string | null;
  pushToken: string | null;
  pushAlertsEnabled: boolean;
  emailAlertsEnabled: boolean;
  preferredRegion: string;
  isInitialized: boolean;
  initializeUser: () => Promise<string>;
  setPushToken: (token: string) => Promise<void>;
  updatePreferences: (updates: Partial<{
    email: string | null;
    pushAlertsEnabled: boolean;
    emailAlertsEnabled: boolean;
    preferredRegion: string;
  }>) => Promise<void>;
  getIcsFeedUrl: () => string;
}

export const useUserStore = create<UserState>((set, get) => ({
  userId: null,
  email: null,
  pushToken: null,
  pushAlertsEnabled: true,
  emailAlertsEnabled: true,
  preferredRegion: 'US',
  isInitialized: false,

  initializeUser: async () => {
    try {
      let storedUserId = await AsyncStorage.getItem(USER_ID_STORAGE_KEY);
      let storedRegion = await AsyncStorage.getItem(REGION_STORAGE_KEY) || 'US';

      if (!storedUserId) {
        storedUserId = `usr_${Crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        await AsyncStorage.setItem(USER_ID_STORAGE_KEY, storedUserId);
      }

      set({
        userId: storedUserId,
        preferredRegion: storedRegion,
        isInitialized: true,
      });

      // Sync user with backend
      try {
        const response = await api.post<{ user: UserProfile }>('/api/users/sync', {
          userId: storedUserId,
          preferredRegion: storedRegion,
        });

        if (response.data?.user) {
          const user = response.data.user;
          set({
            email: user.email,
            pushToken: user.pushToken,
            pushAlertsEnabled: user.pushAlertsEnabled,
            emailAlertsEnabled: user.emailAlertsEnabled,
            preferredRegion: user.preferredRegion || storedRegion,
          });
        }
      } catch (backendErr) {
        console.warn('[useUserStore] Offline or backend sync skipped:', backendErr);
      }

      return storedUserId;
    } catch (error) {
      console.error('[useUserStore] Failed to initialize user:', error);
      const fallbackId = `usr_fallback_${Date.now()}`;
      set({ userId: fallbackId, isInitialized: true });
      return fallbackId;
    }
  },

  setPushToken: async (token: string) => {
    const { userId, preferredRegion } = get();
    if (!userId) return;

    set({ pushToken: token });

    try {
      await api.patch(`/api/users/${userId}`, {
        pushToken: token,
        preferredRegion,
      });
    } catch (err) {
      console.error('[useUserStore] Failed to sync push token:', err);
    }
  },

  updatePreferences: async (updates) => {
    const { userId } = get();
    if (!userId) return;

    set((state) => ({ ...state, ...updates }));

    if (updates.preferredRegion) {
      await AsyncStorage.setItem(REGION_STORAGE_KEY, updates.preferredRegion);
    }

    try {
      await api.patch(`/api/users/${userId}`, updates);
    } catch (err) {
      console.error('[useUserStore] Failed to update backend preferences:', err);
    }
  },

  getIcsFeedUrl: () => {
    const { userId } = get();
    if (!userId) return '';
    return `${API_BASE_URL}/api/calendar/${userId}/feed.ics`;
  },
}));
