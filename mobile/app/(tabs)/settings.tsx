import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  Bell,
  Mail,
  Calendar,
  Copy,
  Check,
  Globe,
  User,
  LogOut,
  LogIn,
  Server,
  ShieldCheck,
  Trash2,
  Tv,
} from 'lucide-react-native';
import { useUserStore } from '../../store/useUserStore';
import { useAuthStore } from '../../store/useAuthStore';
import { API_BASE_URL } from '../../services/api';
import Header from '../../components/Header';

const REGIONS = [
  { code: 'US', label: 'United States (US)' },
  { code: 'GB', label: 'United Kingdom (UK)' },
  { code: 'CA', label: 'Canada (CA)' },
  { code: 'AU', label: 'Australia (AU)' },
  { code: 'DE', label: 'Germany (DE)' },
  { code: 'FR', label: 'France (FR)' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const {
    userId,
    email: guestEmail,
    pushToken,
    pushAlertsEnabled,
    emailAlertsEnabled,
    preferredRegion,
    updatePreferences,
    getIcsFeedUrl,
    deleteAccount,
  } = useUserStore();

  const { user: authUser, isAuthenticated, logout } = useAuthStore();

  const [inputEmail, setInputEmail] = useState(authUser?.email || guestEmail || '');
  const [copied, setCopied] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const activeUserId = authUser?.id || userId;
  // Built from the per-user icsToken by the store. It must never contain the
  // userId, because this link gets pasted into third-party calendar services.
  const icsUrl = getIcsFeedUrl();

  const handleCopyIcs = async () => {
    if (!icsUrl) return;
    await Clipboard.setStringAsync(icsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    Alert.alert(
      'Calendar Feed Copied',
      'The .ics subscription link has been copied to your clipboard. You can paste it into Apple Calendar, Google Calendar, or Outlook to sync your TV releases automatically!'
    );
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    await updatePreferences({ email: inputEmail.trim() });
    setSavingEmail(false);
    Alert.alert('Email Saved', 'Your notification email has been updated.');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, your watchlist and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteAccount();
            if (result.success) {
              if (isAuthenticated) await logout();
              Alert.alert(
                'Account Deleted',
                'Your account and all associated data have been permanently deleted.'
              );
              router.replace('/');
            } else {
              Alert.alert('Could Not Delete Account', result.error || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your TV Tracker account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            Alert.alert('Signed Out', 'You have been signed out.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header
        title="Settings"
        subtitle="Manage account, notifications, and calendar feeds"
      />

      <ScrollView className="flex-1 px-4 py-2" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* User Account Section */}
        <View className="bg-card border border-border/50 rounded-2xl p-4 mb-5 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-primary-500/20 border border-primary-500/40 items-center justify-center mr-3">
                <User size={20} color="#818cf8" />
              </View>
              <View>
                <Text className="text-base font-bold text-white">
                  {isAuthenticated ? authUser?.name || 'My Account' : 'Guest User'}
                </Text>
                <Text className="text-xs text-zinc-400">
                  {isAuthenticated ? authUser?.email : 'Local device mode'}
                </Text>
              </View>
            </View>

            {isAuthenticated ? (
              <TouchableOpacity
                onPress={handleLogout}
                activeOpacity={0.7}
                className="bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-xl flex-row items-center"
              >
                <LogOut size={13} color="#f87171" className="mr-1" />
                <Text className="text-xs font-bold text-red-400">Sign Out</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push('/auth')}
                activeOpacity={0.8}
                className="bg-primary-500 px-3.5 py-1.5 rounded-xl flex-row items-center shadow-md"
              >
                <LogIn size={13} color="#ffffff" className="mr-1" />
                <Text className="text-xs font-bold text-white">Sign In</Text>
              </TouchableOpacity>
            )}
          </View>

          {isAuthenticated ? (
            <View className="bg-zinc-900 border border-border/40 rounded-xl p-2.5">
              <Text className="text-[11px] text-zinc-400">
                User ID: <Text className="font-mono text-zinc-300">{authUser?.id}</Text>
              </Text>
            </View>
          ) : (
            <Text className="text-xs text-zinc-400">
              Sign in to sync your watchlist, ratings, and recommendations across multiple devices.
            </Text>
          )}
        </View>

        {/* ICS Calendar Feed Section */}
        <View className="bg-card border border-primary-500/30 rounded-2xl p-4 mb-5 shadow-md">
          <View className="flex-row items-center mb-2">
            <View className="w-8 h-8 rounded-lg bg-primary-500/20 items-center justify-center mr-2.5">
              <Calendar size={18} color="#818cf8" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-white">
                Live .ics Calendar Feed
              </Text>
              <Text className="text-xs text-zinc-400">
                Sync all upcoming episodes to your phone's calendar
              </Text>
            </View>
          </View>

          <Text className="text-xs text-zinc-300 leading-relaxed mt-2 mb-3">
            Subscribe to this dynamic iCalendar feed in Apple Calendar, Google Calendar, or Outlook.
            As you add shows to your watchlist, your calendar updates automatically!
          </Text>

          {/* URL Box */}
          <View className="bg-zinc-900 border border-border/80 rounded-xl p-3 flex-row items-center mb-3">
            <Text className="text-xs text-primary-400 font-mono flex-1 mr-2" numberOfLines={1}>
              {icsUrl || 'Generating your feed URL...'}
            </Text>
            <TouchableOpacity
              onPress={handleCopyIcs}
              activeOpacity={0.7}
              className="bg-primary-500 px-3 py-1.5 rounded-lg flex-row items-center"
            >
              {copied ? (
                <>
                  <Check size={13} color="#ffffff" />
                  <Text className="text-xs font-bold text-white ml-1">Copied</Text>
                </>
              ) : (
                <>
                  <Copy size={13} color="#ffffff" />
                  <Text className="text-xs font-bold text-white ml-1">Copy</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View className="bg-zinc-800/60 rounded-xl p-3 border border-border/40">
            <Text className="text-[11px] text-zinc-400 font-semibold mb-1">
              How to Subscribe:
            </Text>
            <Text className="text-[11px] text-zinc-400 leading-relaxed">
              • <Text className="font-semibold text-zinc-200">Apple Calendar (iOS / Mac):</Text> File → New Calendar Subscription → Paste URL.{'\n'}
              • <Text className="font-semibold text-zinc-200">Google Calendar:</Text> Other calendars (+) → From URL → Paste URL.
            </Text>
          </View>
        </View>

        {/* Notifications Section */}
        <View className="bg-card border border-border/50 rounded-2xl p-4 mb-5">
          <Text className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">
            Episode Notifications
          </Text>

          {/* Push Alerts */}
          <View className="flex-row items-center justify-between py-3 border-b border-border/40">
            <View className="flex-row items-center flex-1 mr-4">
              <View className="w-8 h-8 rounded-lg bg-zinc-800 items-center justify-center mr-3">
                <Bell size={18} color="#818cf8" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white">
                  Push Notifications
                </Text>
                <Text className="text-xs text-zinc-400">
                  Instant alert on episode release day
                </Text>
              </View>
            </View>
            <Switch
              value={pushAlertsEnabled}
              onValueChange={(val) => updatePreferences({ pushAlertsEnabled: val })}
              trackColor={{ false: '#3f3f46', true: '#6366f1' }}
              thumbColor={pushAlertsEnabled ? '#ffffff' : '#a1a1aa'}
            />
          </View>

          {/* Email Alerts */}
          <View className="py-3">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center flex-1 mr-4">
                <View className="w-8 h-8 rounded-lg bg-zinc-800 items-center justify-center mr-3">
                  <Mail size={18} color="#10b981" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-white">
                    Daily Email Digest
                  </Text>
                  <Text className="text-xs text-zinc-400">
                    Summary email of today's episodes
                  </Text>
                </View>
              </View>
              <Switch
                value={emailAlertsEnabled}
                onValueChange={(val) => updatePreferences({ emailAlertsEnabled: val })}
                trackColor={{ false: '#3f3f46', true: '#10b981' }}
                thumbColor={emailAlertsEnabled ? '#ffffff' : '#a1a1aa'}
              />
            </View>

            {emailAlertsEnabled && (
              <View className="flex-row items-center mt-1">
                <TextInput
                  value={inputEmail}
                  onChangeText={setInputEmail}
                  placeholder="your.email@domain.com"
                  placeholderTextColor="#71717a"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="flex-1 bg-zinc-900 border border-border/80 rounded-xl px-3 py-2 text-white text-sm mr-2"
                />
                <TouchableOpacity
                  onPress={handleSaveEmail}
                  activeOpacity={0.8}
                  disabled={savingEmail}
                  className="bg-zinc-800 border border-border px-4 py-2 rounded-xl"
                >
                  <Text className="text-xs font-bold text-white">
                    {savingEmail ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Preferred Region Section */}
        <View className="bg-card border border-border/50 rounded-2xl p-4 mb-5">
          <View className="flex-row items-center mb-3">
            <Globe size={18} color="#0ea5e9" className="mr-2" />
            <Text className="text-sm font-bold text-zinc-400 uppercase tracking-wider ml-2">
              Streaming Region
            </Text>
          </View>

          <Text className="text-xs text-zinc-400 mb-3">
            Select your country to see accurate streaming availability and providers.
          </Text>

          <View className="flex-row flex-wrap gap-2">
            {REGIONS.map((r) => {
              const isSelected = preferredRegion === r.code;
              return (
                <TouchableOpacity
                  key={r.code}
                  onPress={() => updatePreferences({ preferredRegion: r.code })}
                  activeOpacity={0.7}
                  className={`px-3 py-2 rounded-xl border ${
                    isSelected
                      ? 'bg-primary-500/20 border-primary-500'
                      : 'bg-zinc-800/60 border-border/40'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isSelected ? 'text-white' : 'text-zinc-300'
                    }`}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Backend Server / Cloudflare Connection Status */}
        <View className="bg-card border border-border/50 rounded-2xl p-4 mb-5">
          <View className="flex-row items-center mb-2">
            <Server size={18} color="#a1a1aa" className="mr-2" />
            <Text className="text-sm font-bold text-zinc-400 uppercase tracking-wider ml-2">
              Server Connection
            </Text>
          </View>
          <Text className="text-xs text-zinc-400">
            API Host: <Text className="font-mono text-zinc-300">{API_BASE_URL}</Text>
          </Text>
          <Text className="text-xs text-zinc-400 mt-1">
            Status:{' '}
            <Text className="font-semibold text-emerald-400">
              {API_BASE_URL.includes('https') ? 'Cloudflare Tunnel (Secure HTTPS)' : 'Local Development'}
            </Text>
          </Text>
        </View>

        {/* Streaming services. Optional by design: skipping it changes nothing
            about what the app shows, only how availability is drawn. */}
        <View className="mt-8">
          <Text className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
            My Services
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/subscriptions')}
            activeOpacity={0.8}
            className="bg-card border border-border/50 rounded-2xl p-4 flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-zinc-100 mb-1">Streaming Services</Text>
              <Text className="text-xs text-zinc-400">
                Mark what you already pay for. Recommendations are never filtered by this —
                it only marks what is included.
              </Text>
            </View>
            <Tv size={18} color="#818cf8" />
          </TouchableOpacity>
        </View>

        {/* Danger zone - Google Play requires an in-app account deletion
            path for any app that offers account creation. */}
        <View className="mt-8 mb-4">
            <Text className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              Danger Zone
            </Text>
            <View className="bg-card border border-red-500/30 rounded-2xl p-4">
              <Text className="text-sm font-bold text-zinc-100 mb-1">Delete Account</Text>
              <Text className="text-xs text-zinc-400 mb-3">
                Permanently deletes your account, watchlist and all associated data.
                This cannot be undone.
              </Text>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                activeOpacity={0.8}
                className="bg-red-500/10 border border-red-500/40 px-4 py-2.5 rounded-xl flex-row items-center justify-center"
              >
                <Trash2 size={14} color="#f87171" className="mr-2" />
                <Text className="text-xs font-bold text-red-400">Delete My Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        {/* API Attribution */}
        <View className="items-center py-4">
          <Text className="text-xs text-zinc-500">
            TV Tracker v0.3 &bull; Powered by TVmaze, TMDB & Watchmode
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
