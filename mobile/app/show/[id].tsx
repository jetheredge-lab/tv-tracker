import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Star,
  Tv,
  Calendar,
  Plus,
  Check,
  ChevronLeft,
  Sparkles,
} from 'lucide-react-native';
import { apiService } from '../../services/api';
import { useUserStore } from '../../store/useUserStore';
import { useWatchlistStore } from '../../store/useWatchlistStore';
import StreamingBadge from '../../components/StreamingBadge';
import EpisodeCard from '../../components/EpisodeCard';
import StatusPickerModal from '../../components/StatusPickerModal';
import StarRating from '../../components/StarRating';
import FavoriteButton from '../../components/FavoriteButton';
import { Episode, Show, StreamingProvider, WatchlistStatus } from '../../types';

const { width } = Dimensions.get('window');

export default function ShowDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, preferredRegion } = useUserStore();
  const { isInWatchlist, getWatchlistItemByTvmazeId } = useWatchlistStore();

  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [modalVisible, setModalVisible] = useState(false);

  // Fetch show details & episodes
  const {
    data: show,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['show-details', id],
    queryFn: () => apiService.getShowDetails(id),
    enabled: !!id,
  });

  // Fetch similar / recommended shows
  const { data: similarShows = [] } = useQuery({
    queryKey: ['show-similar', id],
    queryFn: () => apiService.getSimilarShows(id),
    enabled: !!id,
  });

  // Watchlist membership check
  const isAdded = show ? isInWatchlist(show.tvmazeId) : false;
  const currentWatchlistItem = show ? getWatchlistItemByTvmazeId(show.tvmazeId) : null;

  // Add / Update / Remove mutations
  const addMutation = useMutation({
    mutationFn: (status: WatchlistStatus) => {
      if (!userId || !show) throw new Error('Cannot add');
      return apiService.addToWatchlist(
        userId,
        show.tvmazeId,
        status,
        currentWatchlistItem?.rating,
        currentWatchlistItem?.isFavorite || false,
        preferredRegion
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['recommendations', userId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', userId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      rating,
      isFavorite,
    }: {
      rating?: number | null;
      isFavorite?: boolean;
    }) => {
      if (!currentWatchlistItem) throw new Error('Not in watchlist');
      return apiService.updateWatchlist(
        currentWatchlistItem.id,
        currentWatchlistItem.status,
        rating,
        isFavorite,
        preferredRegion
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['recommendations', userId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (watchlistItemId: string) => apiService.removeFromWatchlist(watchlistItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['recommendations', userId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', userId] });
    },
  });

  // Seasons grouping
  const seasons = useMemo(() => {
    if (!show?.episodes) return [];
    const seasonSet = new Set<number>();
    show.episodes.forEach((ep: Episode) => {
      if (ep.season) seasonSet.add(ep.season);
    });
    return Array.from(seasonSet).sort((a, b) => a - b);
  }, [show?.episodes]);

  // Set default season if available
  React.useEffect(() => {
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons]);

  // Filter episodes by selected season
  const currentSeasonEpisodes = useMemo(() => {
    if (!show?.episodes) return [];
    return show.episodes.filter((ep: Episode) => ep.season === selectedSeason);
  }, [show?.episodes, selectedSeason]);

  if (isLoading || !show) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#818cf8" />
      </View>
    );
  }

  const premierYear = show.premiered ? new Date(show.premiered).getFullYear() : null;
  const nextEp = show.nextEpisode;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#818cf8"
          />
        }
      >
        {/* Backdrop & Header Image */}
        <View className="relative w-full h-80 bg-zinc-900">
          {show.backdropUrl || show.posterUrl ? (
            <Image
              source={{ uri: show.backdropUrl || show.posterUrl || '' }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : null}

          {/* Gradient Overlay */}
          <LinearGradient
            colors={['rgba(9,9,11,0.3)', 'rgba(9,9,11,0.85)', '#09090b']}
            className="absolute inset-0"
          />

          {/* Top Bar Navigation */}
          <SafeAreaView className="absolute top-0 left-0 right-0 flex-row justify-between items-center px-4 pt-2">
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full bg-black/60 items-center justify-center border border-white/10"
            >
              <ChevronLeft size={22} color="#ffffff" />
            </TouchableOpacity>

            {isAdded && (
              <FavoriteButton
                isFavorite={currentWatchlistItem?.isFavorite || false}
                onToggle={() => {
                  updateMutation.mutate({
                    isFavorite: !currentWatchlistItem?.isFavorite,
                  });
                }}
              />
            )}
          </SafeAreaView>
        </View>

        {/* Main Show Information */}
        <View className="px-4 -mt-24">
          <View className="flex-row">
            {/* Poster */}
            <View className="w-28 h-40 rounded-2xl bg-zinc-800 overflow-hidden shadow-2xl border-2 border-border/60 mr-4">
              {show.posterUrl ? (
                <Image
                  source={{ uri: show.posterUrl }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-full h-full items-center justify-center bg-zinc-800">
                  <Tv size={32} color="#71717a" />
                </View>
              )}
            </View>

            {/* Title & Stats */}
            <View className="flex-1 justify-end pb-1">
              <Text className="text-2xl font-black text-white leading-tight">
                {show.title}
              </Text>

              {/* Metadata */}
              <View className="flex-row items-center flex-wrap gap-1.5 mt-1.5">
                {show.rating && (
                  <View className="bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-md flex-row items-center">
                    <Star size={11} color="#fbbf24" fill="#fbbf24" />
                    <Text className="text-amber-300 font-bold text-xs ml-1">
                      {show.rating.toFixed(1)}
                    </Text>
                  </View>
                )}
                {premierYear && (
                  <Text className="text-xs text-zinc-400 font-medium">
                    {premierYear}
                  </Text>
                )}
                {show.network && (
                  <Text className="text-xs text-zinc-400 font-medium">
                    &bull; {show.network}
                  </Text>
                )}
              </View>

              {/* Genres */}
              {show.genres && show.genres.length > 0 && (
                <Text className="text-xs text-zinc-400 mt-1" numberOfLines={1}>
                  {show.genres.join(' • ')}
                </Text>
              )}
            </View>
          </View>

          {/* User Star Rating section if in watchlist */}
          {isAdded && (
            <View className="bg-card border border-border/60 rounded-2xl p-3.5 mt-4 flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-zinc-300">
                Your Rating:
              </Text>
              <StarRating
                rating={currentWatchlistItem?.rating}
                interactive={true}
                size={22}
                showText={true}
                onRatingChange={(r) => {
                  updateMutation.mutate({ rating: r });
                }}
              />
            </View>
          )}

          {/* Action Button: Add to Watchlist */}
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
            className={`w-full py-3.5 rounded-2xl flex-row items-center justify-center mt-4 shadow-md ${
              isAdded
                ? 'bg-primary-500/20 border border-primary-500'
                : 'bg-primary-500'
            }`}
          >
            {isAdded ? (
              <>
                <Check size={18} color="#818cf8" className="mr-2" />
                <Text className="text-primary-400 font-bold text-sm">
                  {currentWatchlistItem?.status === 'PLAN_TO_WATCH'
                    ? 'Plan to Watch'
                    : currentWatchlistItem?.status || 'In Watchlist'}{' '}
                  &bull; Tap to Change
                </Text>
              </>
            ) : (
              <>
                <Plus size={18} color="#ffffff" className="mr-2" />
                <Text className="text-white font-bold text-sm">
                  Add to Watchlist
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Next Episode Drop Banner */}
          {nextEp && (
            <View className="bg-card border border-primary-500/40 rounded-2xl p-4 mt-5">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-xs font-bold text-primary-400 uppercase tracking-wider">
                  Next Airing Episode
                </Text>
                <View className="bg-primary-500/20 px-2 py-0.5 rounded-md">
                  <Text className="text-primary-400 font-bold text-xs">
                    S{String(nextEp.season).padStart(2, '0')}E{String(nextEp.number).padStart(2, '0')}
                  </Text>
                </View>
              </View>
              <Text className="text-base font-bold text-white mb-1">
                "{nextEp.title}"
              </Text>
              <View className="flex-row items-center text-xs text-zinc-300">
                <Calendar size={13} color="#9ca3af" />
                <Text className="text-xs text-zinc-300 ml-1.5 font-medium">
                  {nextEp.airdate} {nextEp.airtime ? `at ${nextEp.airtime}` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Where to Watch / Streaming Availability */}
          <View className="mt-6">
            <Text className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2.5">
              Where to Watch
            </Text>
            {show.streamingProviders && show.streamingProviders.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {show.streamingProviders.map((prov: StreamingProvider, idx: number) => (
                  <StreamingBadge key={idx} provider={prov} size="md" interactive={true} />
                ))}
              </View>
            ) : (
              <Text className="text-xs text-zinc-500 italic">
                Streaming information currently unavailable.
              </Text>
            )}
          </View>

          {/* Synopsis */}
          {show.summary ? (
            <View className="mt-6">
              <Text className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">
                About the Show
              </Text>
              <Text className="text-sm text-zinc-300 leading-relaxed">
                {show.summary}
              </Text>
            </View>
          ) : null}

          {/* Season & Episode Guide */}
          <View className="mt-8">
            <Text className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">
              Episodes ({show.episodes?.length || 0})
            </Text>

            {/* Season Selector Tabs */}
            {seasons.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                className="mb-4"
              >
                {seasons.map((s: number) => {
                  const isSelected = selectedSeason === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setSelectedSeason(s)}
                      activeOpacity={0.7}
                      className={`px-4 py-2 rounded-xl border ${
                        isSelected
                          ? 'bg-primary-500 border-primary-500'
                          : 'bg-card border-border/50'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-white' : 'text-zinc-400'
                        }`}
                      >
                        Season {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Episode List */}
            {currentSeasonEpisodes.length > 0 ? (
              currentSeasonEpisodes.map((ep: Episode) => (
                <EpisodeCard key={ep.id || String(ep.tvmazeEpisodeId)} episode={ep} />
              ))
            ) : (
              <Text className="text-xs text-zinc-500 italic py-4 text-center">
                No episodes listed for Season {selectedSeason}.
              </Text>
            )}
          </View>

          {/* Similar Shows / Recommendations Carousel */}
          {similarShows.length > 0 && (
            <View className="mt-8">
              <View className="flex-row items-center mb-3">
                <Sparkles size={16} color="#818cf8" className="mr-1.5" />
                <Text className="text-sm font-bold text-zinc-300 ml-1.5 uppercase tracking-wider">
                  More Like {show.title}
                </Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                {similarShows.map((simShow: Show) => (
                  <TouchableOpacity
                    key={simShow.tvmazeId}
                    onPress={() => router.push(`/show/${simShow.tvmazeId}`)}
                    activeOpacity={0.8}
                    className="w-32 bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm"
                  >
                    <View className="w-full h-44 bg-zinc-800">
                      {simShow.posterUrl ? (
                        <Image
                          source={{ uri: simShow.posterUrl }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="w-full h-full items-center justify-center">
                          <Tv size={20} color="#71717a" />
                        </View>
                      )}
                    </View>
                    <View className="p-2">
                      <Text className="text-xs font-bold text-white" numberOfLines={1}>
                        {simShow.title}
                      </Text>
                      {simShow.network ? (
                        <Text className="text-[10px] text-zinc-400 mt-0.5" numberOfLines={1}>
                          {simShow.network}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Status Modal */}
      <StatusPickerModal
        visible={modalVisible}
        currentStatus={currentWatchlistItem?.status}
        showTitle={show.title}
        onClose={() => setModalVisible(false)}
        onSelectStatus={(status) => {
          addMutation.mutate(status);
        }}
        onRemove={
          currentWatchlistItem
            ? () => removeMutation.mutate(currentWatchlistItem.id)
            : undefined
        }
      />
    </View>
  );
}
