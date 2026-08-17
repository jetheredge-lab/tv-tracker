import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { registerForPushNotificationsAsync } from '../services/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    },
  },
});

export default function RootLayout() {
  const { initializeUser, setPushToken } = useUserStore();
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    // 1. Restore persistent user auth session
    restoreSession();

    // 2. Initialize device ID and sync profile
    initializeUser().then(async () => {
      // 3. Request push notification token and sync with backend
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await setPushToken(token);
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor="#09090b" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: '#09090b',
            },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: '#09090b',
            },
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="auth"
            options={{
              title: 'Account',
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="show/[id]"
            options={{
              title: 'Show Details',
              headerBackTitle: 'Back',
              headerTransparent: true,
              headerTintColor: '#ffffff',
              headerTitle: '',
            }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
