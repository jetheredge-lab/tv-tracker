import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Calendar as CalendarIcon, Clock, ChevronRight, Tv } from 'lucide-react-native';
import { useUserStore } from '../../store/useUserStore';
import { apiService } from '../../services/api';
import Header from '../../components/Header';
import StreamingBadge from '../../components/StreamingBadge';
import EmptyState from '../../components/EmptyState';
import { CalendarEpisode } from '../../types';

export default function CalendarScreen() {
  const router = useRouter();
  const { userId } = useUserStore();

  const [selectedFilter, setSelectedFilter] = useState<'UPCOMING' | 'ALL'>('UPCOMING');

  const todayStr = new Date().toISOString().split('T')[0];

  // Fetch episodes for user's watchlist
  const {
    data: episodes = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['calendar-episodes', userId],
    queryFn: async () => {
      if (!userId) return [];
      return apiService.getCalendarEpisodes(userId);
    },
    enabled: !!userId,
  });

  // Filter episodes based on upcoming vs all
  const filteredEpisodes = useMemo(() => {
    if (selectedFilter === 'UPCOMING') {
      return (episodes as CalendarEpisode[]).filter((ep: CalendarEpisode) => ep.airdate >= todayStr);
    }
    return episodes as CalendarEpisode[];
  }, [episodes, selectedFilter, todayStr]);

  // Group episodes by date for agenda display
  const groupedSections = useMemo(() => {
    const groups: Record<string, CalendarEpisode[]> = {};
    for (const ep of (filteredEpisodes as CalendarEpisode[])) {
      if (!groups[ep.airdate]) {
        groups[ep.airdate] = [];
      }
      groups[ep.airdate].push(ep);
    }

    return Object.entries(groups).map(([date, items]) => {
      let label = date;
      if (date === todayStr) {
        label = 'Today';
      } else {
        const d = new Date(date + 'T00:00:00');
        label = d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      }
      return { date, label, items };
    });
  }, [filteredEpisodes, todayStr]);

  const renderAgendaSection = ({ item }: { item: { date: string; label: string; items: CalendarEpisode[] } }) => {
    const isToday = item.date === todayStr;

    return (
      <View className="mb-5 mx-4">
        {/* Date Header */}
        <View className="flex-row items-center mb-2.5">
          <View
            className={`px-3 py-1 rounded-lg mr-2 ${
              isToday ? 'bg-primary-500' : 'bg-card-elevated border border-border/60'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isToday ? 'text-white' : 'text-zinc-300'
              }`}
            >
              {item.label}
            </Text>
          </View>
          <View className="flex-1 h-[1px] bg-border/40" />
        </View>

        {/* Episode Cards for this Date */}
        {item.items.map((ep) => {
          const seasonCode = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
          const provider = ep.show.streamingProviders?.[0];

          return (
            <TouchableOpacity
              key={ep.id}
              onPress={() => router.push(`/show/${ep.show.tvmazeId || ep.show.id}`)}
              activeOpacity={0.8}
              className="bg-card border border-border/50 rounded-2xl p-3 mb-2.5 flex-row items-center shadow-sm"
            >
              {/* Poster Thumbnail */}
              <View className="w-14 h-20 rounded-xl bg-zinc-800 overflow-hidden mr-3 relative">
                {ep.show.posterUrl ? (
                  <Image
                    source={{ uri: ep.show.posterUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-full h-full items-center justify-center bg-zinc-800">
                    <Tv size={18} color="#71717a" />
                  </View>
                )}
              </View>

              {/* Info */}
              <View className="flex-1 justify-center">
                <View className="flex-row items-center mb-0.5">
                  <Text className="text-sm font-bold text-white flex-1 mr-2" numberOfLines={1}>
                    {ep.show.title}
                  </Text>
                  <View className="bg-primary-500/20 px-1.5 py-0.5 rounded">
                    <Text className="text-primary-400 font-bold text-[10px]">{seasonCode}</Text>
                  </View>
                </View>

                <Text className="text-xs text-zinc-300 font-medium mb-1.5" numberOfLines={1}>
                  "{ep.title}"
                </Text>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    {ep.airtime ? (
                      <View className="flex-row items-center mr-2">
                        <Clock size={11} color="#9ca3af" />
                        <Text className="text-[11px] text-zinc-400 ml-1">{ep.airtime}</Text>
                      </View>
                    ) : null}
                    {ep.show.network ? (
                      <Text className="text-[11px] text-zinc-400">
                        {ep.show.network}
                      </Text>
                    ) : null}
                  </View>

                  {provider ? <StreamingBadge provider={provider} size="sm" /> : null}
                </View>
              </View>

              <ChevronRight size={16} color="#71717a" className="ml-2" />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header
        title="Release Calendar"
        subtitle="Upcoming episode releases from your watchlist"
      />

      {/* Filter Toggle */}
      <View className="flex-row px-4 py-2 space-x-2">
        <TouchableOpacity
          onPress={() => setSelectedFilter('UPCOMING')}
          activeOpacity={0.7}
          className={`px-4 py-1.5 rounded-full border mr-2 ${
            selectedFilter === 'UPCOMING'
              ? 'bg-primary-500 border-primary-500'
              : 'bg-card border-border/50'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              selectedFilter === 'UPCOMING' ? 'text-white' : 'text-zinc-400'
            }`}
          >
            Upcoming Only
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSelectedFilter('ALL')}
          activeOpacity={0.7}
          className={`px-4 py-1.5 rounded-full border ${
            selectedFilter === 'ALL'
              ? 'bg-primary-500 border-primary-500'
              : 'bg-card border-border/50'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              selectedFilter === 'ALL' ? 'text-white' : 'text-zinc-400'
            }`}
          >
            All Scheduled Episodes
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Schedule List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#818cf8" />
        </View>
      ) : groupedSections.length > 0 ? (
        <FlatList
          data={groupedSections}
          keyExtractor={(item) => item.date}
          renderItem={renderAgendaSection}
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
          type="calendar"
          title="No scheduled releases"
          description="None of the shows in your watchlist have scheduled upcoming episodes right now. Add active shows to see their drop dates here."
          actionLabel="Explore Active Shows"
          onAction={() => router.push('/(tabs)/search')}
        />
      )}
    </SafeAreaView>
  );
}
