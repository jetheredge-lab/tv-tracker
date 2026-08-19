import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { api, API_BASE_URL, setAuthReady } from '../services/api';
import { UserProfile } from '../types';

const USER_ID_STORAGE_KEY = '@tvtracker_user_id';
const REGION_STORAGE_KEY = '@tvtracker_region';
const DEVICE_SECRET_KEY = '@tvtracker_device_secret';
const ICS_TOKEN_KEY = '@tvtracker_ics_token';
const AUTH_TOKEN_KEY = '@tvtracker_auth_token';
const AUTH_USER_KEY = '@tvtracker_auth_user';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * The credential for an anonymous account.
 *
 * The userId travels in request paths, logs and the odd screenshot, so it can
 * never be the thing that authenticates. This secret never leaves the device
 * except to prove ownership at /api/users/sync, and the server stores only a
 * bcrypt hash of it.
 */
const getOrCreateDeviceSecret = async (): Promise<string> => {
  const existing = await AsyncStorage.getItem(DEVICE_SECRET_KEY);
  if (existing) return existing;

  const secret = toHex(await Crypto.getRandomBytesAsync(32));
  await AsyncStorage.setItem(DEVICE_SECRET_KEY, secret);
  return secret;
};

interface UserState {
  userId: string | null;
  email: string | null;
  pushToken: string | null;
  icsToken: string | null;
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
  adoptAccount: (accountId: string) => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  getIcsFeedUrl: () => string;
}

export const useUserStore = create<UserState>((set, get) => ({
  userId: null,
  email: null,
  pushToken: null,
  icsToken: null,
  pushAlertsEnabled: true,
  emailAlertsEnabled: true,
  preferredRegion: 'US',
  isInitialized: false,

  initializeUser: async () => {
    try {
      let storedUserId = await AsyncStorage.getItem(USER_ID_STORAGE_KEY);
      const storedRegion = (await AsyncStorage.getItem(REGION_STORAGE_KEY)) || 'US';

      if (!storedUserId) {
        storedUserId = `usr_${Crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        await AsyncStorage.setItem(USER_ID_STORAGE_KEY, storedUserId);
      }

      const deviceSecret = await getOrCreateDeviceSecret();

      set({
        userId: storedUserId,
        preferredRegion: storedRegion,
        isInitialized: true,
      });

      // Sync claims the account and returns the JWT that authorises every
      // other call. The axios interceptor reads it from AUTH_TOKEN_KEY.
      //
      // The promise handed to setAuthReady has to resolve *after* the token is
      // on disk, not when the POST resolves - otherwise a request unblocked by
      // the gate can still read AsyncStorage before the setItem lands.
      const sync = (async () => {
        const response = await api.post<{
          user: UserProfile & { icsToken?: string | null };
          token: string;
        }>('/api/users/sync', {
          userId: storedUserId,
          deviceSecret,
          preferredRegion: storedRegion,
        });

        const { user, token } = response.data;

        if (token) {
          await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
        }
        if (user?.icsToken) {
          await AsyncStorage.setItem(ICS_TOKEN_KEY, user.icsToken);
        }

        return user;
      })();

      setAuthReady(sync);

      try {
        const user = await sync;

        if (user) {
          set({
            email: user.email,
            pushToken: user.pushToken,
            pushAlertsEnabled: user.pushAlertsEnabled,
            emailAlertsEnabled: user.emailAlertsEnabled,
            preferredRegion: user.preferredRegion || storedRegion,
            icsToken: user.icsToken ?? null,
          });
        }
      } catch (backendErr) {
        console.warn('[useUserStore] Offline or backend sync skipped:', backendErr);
        // Fall back to the last known feed token so the calendar section
        // still renders something useful while offline.
        const cachedIcs = await AsyncStorage.getItem(ICS_TOKEN_KEY);
        if (cachedIcs) set({ icsToken: cachedIcs });
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

  /**
   * Signing in replaces the device identity with the account's, so the userId
   * used in request paths always matches the userId inside the token. Without
   * this the server would (correctly) answer 403 to every request after login.
   */
  adoptAccount: async (accountId: string) => {
    if (!accountId) return;
    await AsyncStorage.setItem(USER_ID_STORAGE_KEY, accountId);
    set({ userId: accountId });
  },

  /**
   * Permanent deletion. Google Play requires this for any app that offers
   * account creation. The server cascades watchlists and dismissed
   * recommendations; here we drop every local credential so the next launch
   * starts as a genuinely new account.
   */
  deleteAccount: async () => {
    const { userId } = get();
    if (!userId) return { success: false, error: 'No account to delete.' };

    try {
      await api.delete(`/api/users/${userId}`);
    } catch (error: any) {
      return {
        success: false,
        error:
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          'Could not delete the account. Please try again.',
      };
    }

    await AsyncStorage.multiRemove([
      USER_ID_STORAGE_KEY,
      DEVICE_SECRET_KEY,
      ICS_TOKEN_KEY,
      AUTH_TOKEN_KEY,
      AUTH_USER_KEY,
      REGION_STORAGE_KEY,
    ]);

    set({
      userId: null,
      email: null,
      pushToken: null,
      icsToken: null,
      pushAlertsEnabled: true,
      emailAlertsEnabled: true,
      preferredRegion: 'US',
      isInitialized: false,
    });

    return { success: true };
  },

  getIcsFeedUrl: () => {
    // Keyed on the opaque feed token, never the userId - this URL gets pasted
    // into third-party calendar services.
    const { icsToken } = get();
    if (!icsToken) return '';
    return `${API_BASE_URL}/api/calendar/feed/${icsToken}.ics`;
  },
}));
