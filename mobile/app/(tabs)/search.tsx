import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Plus, Check, Star, Tv, Flame } from 'lucide-react-native';
import { apiService } from '../../services/api';
import { useUserStore } from '../../store/useUserStore';
import { useWatchlistStore } from '../../store/useWatchlistStore';
import Header from '../../components/Header';
import SearchBar from '../../components/SearchBar';
import EmptyState from '../../components/EmptyState';
import { Show } from '../../types';

export default function SearchScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, preferredRegion } = useUserStore();
  const { isInWatchlist, getWatchlistItemByTvmazeId } = useWatchlistStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search results from backend / TVmaze
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['shows-search', debouncedQuery],
    queryFn: () => apiService.searchShows(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  // Fetch trending/popular shows for empty search state
  const { data: trendingShows = [], isLoading: isLoadingTrending } = useQuery({
    queryKey: ['shows-trending'],
    queryFn: () => apiService.getTrendingShows(),
    enabled: debouncedQuery.length === 0,
  });

  // Add to Watchlist mutation
  const addMutation = useMutation({
    mutationFn: (tvmazeId: number) => {
      if (!userId) throw new Error('User not initialized');
      return apiService.addToWatchlist(userId, tvmazeId, 'WATCHING', null, false, preferredRegion);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', userId] });
    },
  });

  // Remove from Watchlist mutation
  const removeMutation = useMutation({
    mutationFn: (watchlistItemId: string) => apiService.removeFromWatchlist(watchlistItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', userId] });
    },
  });

  const handleWatchlistToggle = (show: Show) => {
    const isAdded = isInWatchlist(show.tvmazeId);
    if (isAdded) {
      const item = getWatchlistItemByTvmazeId(show.tvmazeId);
      if (item) {
        removeMutation.mutate(item.id);
      }
    } else {
      addMutation.mutate(show.tvmazeId);
    }
  };

  const displayedShows = debouncedQuery.length > 0 ? searchResults : trendingShows;
  const isLoading = debouncedQuery.length > 0 ? isSearching : isLoadingTrending;

  const renderShowCard = ({ item }: { item: Show }) => {
    const isAdded = isInWatchlist(item.tvmazeId);
    const premierYear = item.premiered ? new Date(item.premiered).getFullYear() : null;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/show/${item.tvmazeId}`)}
        activeOpacity={0.8}
        className="bg-card border border-border/50 rounded-2xl p-3 mb-3 mx-4 flex-row items-center"
      >
        {/* Poster */}
        <View className="w-20 h-28 rounded-xl bg-zinc-800 overflow-hidden relative shadow-sm">
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View className="w-full h-full items-center justify-center bg-zinc-800">
              <Tv size={24} color="#71717a" />
            </View>
          )}

          {item.rating ? (
            <View className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.5 rounded flex-row items-center">
              <Star size={9} color="#fbbf24" fill="#fbbf24" />
              <Text className="text-white text-[9px] font-bold ml-1">
                {item.rating.toFixed(1)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Info */}
        <View className="flex-1 ml-3.5 mr-2">
          <Text className="text-base font-bold text-white" numberOfLines={1}>
            {item.title}
          </Text>

          <Text className="text-xs text-zinc-400 mt-1" numberOfLines={1}>
            {premierYear ? `${premierYear} ` : ''}
            {item.network ? `• ${item.network} ` : ''}
            {item.genres && item.genres.length > 0 ? `• ${item.genres.slice(0, 2).join(', ')}` : ''}
          </Text>

          {item.summary ? (
            <Text className="text-xs text-zinc-400 mt-1.5 leading-relaxed" numberOfLines={2}>
              {item.summary}
            </Text>
          ) : null}
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={() => handleWatchlistToggle(item)}
          activeOpacity={0.7}
          className={`w-10 h-10 rounded-full items-center justify-center border ${
            isAdded
              ? 'bg-primary-500/20 border-primary-500'
              : 'bg-card-elevated border-border'
          }`}
        >
          {isAdded ? (
            <Check size={18} color="#818cf8" />
          ) : (
            <Plus size={18} color="#f4f4f5" />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header
        title="Explore Shows"
        subtitle="Search millions of TV shows & streaming releases"
      />

      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search by show title (e.g. Severance)..."
        onClear={() => {
          setSearchQuery('');
          setDebouncedQuery('');
        }}
      />

      {/* Section Subtitle */}
      <View className="px-4 py-2 flex-row items-center">
        {debouncedQuery.length === 0 ? (
          <View className="flex-row items-center">
            <Flame size={16} color="#f59e0b" />
            <Text className="text-sm font-bold text-zinc-300 ml-1.5">
              Popular & Trending Shows
            </Text>
          </View>
        ) : (
          <Text className="text-xs font-semibold text-zinc-400">
            {isSearching ? 'Searching TVmaze...' : `Found ${searchResults.length} results for "${debouncedQuery}"`}
          </Text>
        )}
      </View>

      {/* Results List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#818cf8" />
        </View>
      ) : displayedShows.length > 0 ? (
        <FlatList
          data={displayedShows}
          keyExtractor={(item) => String(item.tvmazeId)}
          renderItem={renderShowCard}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <EmptyState
          type="search"
          title="No shows found"
          description={`We couldn't find any TV shows matching "${debouncedQuery}". Try another keyword or show title.`}
          actionLabel="Clear Search"
          onAction={() => {
            setSearchQuery('');
            setDebouncedQuery('');
          }}
        />
      )}
    </SafeAreaView>
  );
}
