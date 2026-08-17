import React, { useState, useMemo } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useUserStore } from '../../store/useUserStore';
import { useWatchlistStore, FilterCategory } from '../../store/useWatchlistStore';
import { apiService } from '../../services/api';
import Header from '../../components/Header';
import SearchBar from '../../components/SearchBar';
import SegmentedTabs from '../../components/SegmentedTabs';
import ShowCard from '../../components/ShowCard';
import EmptyState from '../../components/EmptyState';
import StatusPickerModal from '../../components/StatusPickerModal';
import { WatchlistItem, WatchlistStatus } from '../../types';

export default function WatchlistScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, preferredRegion } = useUserStore();
  const { activeFilter, setFilter, setWatchlist } = useWatchlistStore();

  const [localSearch, setLocalSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Fetch Watchlist
  const { data: watchlist = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['watchlist', userId],
    queryFn: async () => {
      if (!userId) return [];
      const items = await apiService.getUserWatchlist(userId);
      setWatchlist(items);
      return items;
    },
    enabled: !!userId,
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
      rating,
      isFavorite,
    }: {
      id: string;
      status?: WatchlistStatus;
      rating?: number | null;
      isFavorite?: boolean;
    }) => apiService.updateWatchlist(id, status, rating, isFavorite, preferredRegion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['recommendations', userId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', userId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiService.removeFromWatchlist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', userId] });
      queryClient.invalidateQueries({ queryKey: ['recommendations', userId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', userId] });
    },
  });

  // Counts for tabs
  const counts = useMemo(() => {
    const list = watchlist as WatchlistItem[];
    return {
      ALL: list.length,
      WATCHING: list.filter((i: WatchlistItem) => i.status === 'WATCHING').length,
      COMPLETED: list.filter((i: WatchlistItem) => i.status === 'COMPLETED').length,
      PLAN_TO_WATCH: list.filter((i: WatchlistItem) => i.status === 'PLAN_TO_WATCH').length,
      FAVORITES: list.filter((i: WatchlistItem) => i.isFavorite).length,
    };
  }, [watchlist]);

  // Filtered shows
  const filteredShows = useMemo(() => {
    const list = watchlist as WatchlistItem[];
    return list.filter((item: WatchlistItem) => {
      // Category filter
      if (activeFilter === 'WATCHING' && item.status !== 'WATCHING') return false;
      if (activeFilter === 'COMPLETED' && item.status !== 'COMPLETED') return false;
      if (activeFilter === 'PLAN_TO_WATCH' && item.status !== 'PLAN_TO_WATCH') return false;
      if (activeFilter === 'FAVORITES' && !item.isFavorite) return false;

      // Text search filter
      if (localSearch.trim().length > 0) {
        const query = localSearch.toLowerCase();
        const titleMatch = item.show?.title.toLowerCase().includes(query);
        const networkMatch = item.show?.network?.toLowerCase().includes(query);
        const genreMatch = item.show?.genres?.some((g: string) => g.toLowerCase().includes(query));
        return titleMatch || networkMatch || genreMatch;
      }

      return true;
    });
  }, [watchlist, activeFilter, localSearch]);

  const tabs: Array<{ key: FilterCategory; label: string; count: number }> = [
    { key: 'ALL', label: 'All', count: counts.ALL },
    { key: 'WATCHING', label: 'Watching', count: counts.WATCHING },
    { key: 'COMPLETED', label: 'Completed', count: counts.COMPLETED },
    { key: 'PLAN_TO_WATCH', label: 'Plan to Watch', count: counts.PLAN_TO_WATCH },
    { key: 'FAVORITES', label: 'Favorites', count: counts.FAVORITES },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header
        title="My Watchlist"
        subtitle={`${watchlist.length} show${watchlist.length === 1 ? '' : 's'} tracked`}
      />

      {/* Search within watchlist if list has items */}
      {watchlist.length > 0 && (
        <SearchBar
          value={localSearch}
          onChangeText={setLocalSearch}
          placeholder="Filter your shows..."
        />
      )}

      {/* Category Tabs */}
      {watchlist.length > 0 && (
        <SegmentedTabs
          tabs={tabs}
          activeTab={activeFilter}
          onTabChange={setFilter}
        />
      )}

      {/* Main List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#818cf8" />
        </View>
      ) : filteredShows.length > 0 ? (
        <FlatList
          data={filteredShows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ShowCard
              show={item.show}
              status={item.status}
              userRating={item.rating}
              isFavorite={item.isFavorite}
              onFavoriteToggle={() => {
                updateMutation.mutate({
                  id: item.id,
                  isFavorite: !item.isFavorite,
                });
              }}
              onRatingChange={(newRating) => {
                updateMutation.mutate({
                  id: item.id,
                  rating: newRating,
                });
              }}
              onStatusPress={() => {
                setSelectedItem(item);
                setModalVisible(true);
              }}
            />
          )}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#818cf8"
            />
          }
        />
      ) : (
        <EmptyState
          type="watchlist"
          title={localSearch ? 'No matching shows' : 'Your watchlist is empty'}
          description={
            localSearch
              ? `No shows match "${localSearch}". Try a different keyword.`
              : 'Add shows to your watchlist to track episode drops and get notified when new episodes air.'
          }
          actionLabel={localSearch ? 'Clear Filter' : 'Explore Shows'}
          onAction={() => {
            if (localSearch) {
              setLocalSearch('');
            } else {
              router.push('/(tabs)/search');
            }
          }}
        />
      )}

      {/* Status Picker Modal */}
      {selectedItem && (
        <StatusPickerModal
          visible={modalVisible}
          currentStatus={selectedItem.status}
          showTitle={selectedItem.show.title}
          onClose={() => {
            setModalVisible(false);
            setSelectedItem(null);
          }}
          onSelectStatus={(newStatus) => {
            updateMutation.mutate({ id: selectedItem.id, status: newStatus });
          }}
          onRemove={() => {
            removeMutation.mutate(selectedItem.id);
          }}
        />
      )}
    </SafeAreaView>
  );
}
