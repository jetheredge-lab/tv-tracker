import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { INVITE_CODE_KEY, useUserStore } from './useUserStore';
import { UserProfile } from '../types';

const AUTH_TOKEN_KEY = '@tvtracker_auth_token';
const AUTH_USER_KEY = '@tvtracker_auth_user';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    name?: string,
    preferredRegion?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  updateUserPreferences: (updates: Partial<UserProfile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  restoreSession: async () => {
    try {
      set({ isLoading: true });
      const [savedToken, savedUserJson] = await Promise.all([
        AsyncStorage.getItem(AUTH_TOKEN_KEY),
        AsyncStorage.getItem(AUTH_USER_KEY),
      ]);

      if (savedToken && savedUserJson) {
        const user = JSON.parse(savedUserJson) as UserProfile;
        set({
          token: savedToken,
          user,
          isAuthenticated: true,
          isLoading: false,
        });

        // Verify token with backend /api/auth/me
        try {
          const res = await api.get<{ user: UserProfile }>('/api/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (res.data?.user) {
            set({ user: res.data.user });
            await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.data.user));
          }
        } catch (err) {
          console.warn('[useAuthStore] Token verification failed:', err);
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('[useAuthStore] Failed to restore session:', error);
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true });
      const response = await api.post<{
        token: string;
        user: UserProfile;
        message: string;
      }>('/api/auth/login', {
        email: email.trim(),
        password,
      });

      const { token, user } = response.data;

      await Promise.all([
        AsyncStorage.setItem(AUTH_TOKEN_KEY, token),
        AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)),
      ]);


      // The token identifies this account, so the local identity must match it
      // or every subsequent request would be a cross-account access (403).
      await useUserStore.getState().adoptAccount(user.id);
      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });

      return { success: true };
    } catch (error: any) {
      set({ isLoading: false });
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Login failed. Please check your credentials.';
      return { success: false, error: errorMessage };
    }
  },

  register: async (
    email: string,
    password: string,
    name?: string,
    preferredRegion = 'US'
  ) => {
    try {
      set({ isLoading: true });
      // A device that has already synced owns an anonymous account, and that
      // is where its watchlist lives. Claiming that account in place keeps the
      // data - /register resolves guests by email, which an anonymous account
      // does not have, so it would mint a second row and strand the first.
      const deviceUserId = useUserStore.getState().userId;
      const deviceToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const claiming = Boolean(deviceUserId && deviceToken);
      const inviteCode = await AsyncStorage.getItem(INVITE_CODE_KEY);

      const response = await api.post<{
        token: string;
        user: UserProfile;
        message: string;
      }>(claiming ? '/api/auth/claim' : '/api/auth/register', {
        email: email.trim(),
        password,
        name: name?.trim() || undefined,
        preferredRegion,
        ...(inviteCode ? { inviteCode } : {}),
      });

      const { token, user } = response.data;

      await Promise.all([
        AsyncStorage.setItem(AUTH_TOKEN_KEY, token),
        AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)),
      ]);


      // The token identifies this account, so the local identity must match it
      // or every subsequent request would be a cross-account access (403).
      await useUserStore.getState().adoptAccount(user.id);
      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });

      return { success: true };
    } catch (error: any) {
      set({ isLoading: false });
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Registration failed. Please try again.';
      return { success: false, error: errorMessage };
    }
  },

  logout: async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(AUTH_TOKEN_KEY),
        AsyncStorage.removeItem(AUTH_USER_KEY),
      ]);
      set({
        token: null,
        user: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('[useAuthStore] Error logging out:', error);
    }
  },

  updateUserPreferences: async (updates: Partial<UserProfile>) => {
    const { token, user } = get();
    if (!user) return;

    const updatedUser = { ...user, ...updates };
    set({ user: updatedUser });
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));

    if (token) {
      try {
        await api.patch(`/api/users/${user.id}`, updates, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error('[useAuthStore] Failed to sync preferences with backend:', err);
      }
    }
  },
}));
