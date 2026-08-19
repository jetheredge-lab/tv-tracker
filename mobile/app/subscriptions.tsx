import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react-native';
import { apiService } from '../services/api';
import { useUserStore } from '../store/useUserStore';
import { ProviderOption } from '../types';

/**
 * The services the viewer pays for.
 *
 * Nothing here gates content: telling us changes how badges are drawn and
 * nudges ranking, and skipping it entirely leaves the app exactly as it was.
 * Saving an empty list is a real answer ("I pay for nothing") and is stored as
 * one - distinct from never having opened this screen.
 */
export default function SubscriptionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, preferredRegion } = useUserStore();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['providers', preferredRegion],
    queryFn: () => apiService.getProviders(preferredRegion),
  });

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ['subscriptions', userId, preferredRegion],
    queryFn: () => apiService.getSubscriptions(userId!, preferredRegion),
    enabled: !!userId,
  });

  useEffect(() => {
    if (current && !hydrated) {
      setSelected(new Set(current.subscriptions.map((s) => s.providerName)));
      setHydrated(true);
    }
  }, [current, hydrated]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('User not ready');
      const chosen = providers.filter((p) => selected.has(p.name));
      return apiService.saveSubscriptions(
        userId,
        chosen.map((p) => ({ providerId: p.providerIds[0], providerName: p.name })),
        preferredRegion
      );
    },
    onSuccess: () => {
      // Badges everywhere depend on this, so drop the lists that carry them.
      queryClient.invalidateQueries({ queryKey: ['subscriptions', userId] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['recommendations', userId] });
      router.back();
    },
  });

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.name.toLowerCase().includes(q));
  }, [providers, filter]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const isLoading = loadingProviders || loadingCurrent;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/50">
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={20} color="#a1a1aa" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-white">My Services</Text>
        <TouchableOpacity onPress={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color="#818cf8" />
          ) : (
            <Text className="text-sm font-bold text-primary-400">Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <View className="px-4 pt-4">
        <Text className="text-xs text-zinc-400 leading-4">
          Pick what you already pay for. This never hides recommendations — it just marks
          what is included and nudges the ranking. Selecting nothing is a valid answer.
        </Text>

        <View className="bg-card border border-border/60 rounded-xl px-3 py-2.5 flex-row items-center mt-4">
          <Search size={16} color="#71717a" />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search services"
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            className="flex-1 ml-2 text-white text-sm py-0"
          />
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#818cf8" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
          {visible.map((p: ProviderOption) => {
            const isOn = selected.has(p.name);
            return (
              <TouchableOpacity
                key={p.name}
                onPress={() => toggle(p.name)}
                activeOpacity={0.8}
                className={`flex-row items-center justify-between px-4 py-3 mb-2 rounded-xl border ${
                  isOn ? 'bg-primary-500/15 border-primary-500/50' : 'bg-card border-border/50'
                }`}
              >
                <Text className={`text-sm font-semibold ${isOn ? 'text-white' : 'text-zinc-300'}`}>
                  {p.name}
                </Text>
                {isOn ? <Check size={16} color="#818cf8" /> : null}
              </TouchableOpacity>
            );
          })}
          {visible.length === 0 ? (
            <Text className="text-xs text-zinc-500 text-center py-6">No services match “{filter}”.</Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
