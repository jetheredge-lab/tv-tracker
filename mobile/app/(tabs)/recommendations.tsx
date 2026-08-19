import React from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiService } from '../../services/api';
import { useUserStore } from '../../store/useUserStore';
import Header from '../../components/Header';
import RecommendationCarousel from '../../components/RecommendationCarousel';
import EmptyState from '../../components/EmptyState';
import { RecommendationSection, Show } from '../../types';

export default function RecommendationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, preferredRegion } = useUserStore();

  // Fetch personalized recommendation carousels
  const {
    data: sections = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['recommendations', userId],
    queryFn: async () => {
      if (!userId) return [];
      return apiService.getPersonalizedRecommendations(userId);
    },
    enabled: !!userId,
  });

  // Add to Watchlist mutation
  const addMutation = useMutation({
    mutationFn: (show: Show) => {
      if (!userId) throw new Error('User not ready');
      return apiService.addToWatchlist(
        userId,
        show,
        show.mediaType === 'MOVIE' ? 'PLAN_TO_WATCH' : 'WATCHING',
        null,
        false,
        preferredRegion
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', userId] });
    },
  });

  // Dismiss Recommendation mutation
  const dismissMutation = useMutation({
    mutationFn: (show: Show) => {
      if (!userId) throw new Error('User not ready');
      // Films have no tvmazeId; the server resolves the dismissal by showId,
      // which every title has.
      return apiService.dismissRecommendation(userId, show.tvmazeId ?? undefined, show.id);
    },
    onMutate: async (dismissedShow) => {
      // Optimistically remove show from current UI sections
      await queryClient.cancelQueries({ queryKey: ['recommendations', userId] });
      const prevSections = queryClient.getQueryData<RecommendationSection[]>([
        'recommendations',
        userId,
      ]);

      if (prevSections) {
        const updated = prevSections.map((sec) => ({
          ...sec,
          shows: sec.shows.filter((s) => s.tvmazeId !== dismissedShow.tvmazeId),
        }));
        queryClient.setQueryData(['recommendations', userId], updated);
      }

      return { prevSections };
    },
    onError: (_err, _show, context) => {
      if (context?.prevSections) {
        queryClient.setQueryData(['recommendations', userId], context.prevSections);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations', userId] });
    },
  });

  const totalShowsAcrossSections = (sections as RecommendationSection[]).reduce(
    (acc: number, sec: RecommendationSection) => acc + (sec.shows?.length || 0),
    0
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header
        title="For You"
        subtitle="Personalized recommendations & trending picks"
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#818cf8" />
        </View>
      ) : totalShowsAcrossSections > 0 ? (
        <ScrollView
          className="flex-1 pt-2"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#818cf8"
            />
          }
        >
          {(sections as RecommendationSection[]).map((section: RecommendationSection) => (
            <RecommendationCarousel
              key={section.id}
              section={section}
              onAddShow={(show: Show) => addMutation.mutate(show)}
              onDismissShow={(show: Show) => dismissMutation.mutate(show)}
            />
          ))}
        </ScrollView>
      ) : (
        <EmptyState
          type="general"
          title="No recommendations yet"
          description="Add shows to your watchlist, rate them, or mark your favorites to receive personalized show recommendations tailored to your taste."
          actionLabel="Explore Popular Shows"
          onAction={() => router.push('/(tabs)/search')}
        />
      )}
    </SafeAreaView>
  );
}
