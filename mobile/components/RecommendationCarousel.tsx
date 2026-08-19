import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Check, X, Star, Tv, Sparkles } from 'lucide-react-native';
import { RecommendationSection, Show } from '../types';
import StreamingBadge from './StreamingBadge';
import { titleKey, useWatchlistStore } from '../store/useWatchlistStore';

interface RecommendationCarouselProps {
  section: RecommendationSection;
  onAddShow: (show: Show) => void;
  onDismissShow: (show: Show) => void;
}

/**
 * A film and a series can share an id number, so the route carries the type.
 * Built as a pathname/params object rather than a template string: expo-router
 * types its routes, and a plain string is not assignable to Href.
 */
const titleRoute = (show: {
  mediaType?: string | null;
  tvmazeId?: number | null;
  tmdbId?: number | null;
}) => {
  const isMovie = show.mediaType === 'MOVIE' || (!show.tvmazeId && Boolean(show.tmdbId));
  return {
    pathname: '/show/[id]' as const,
    params: isMovie
      ? { id: String(show.tmdbId), type: 'movie' }
      : { id: String(show.tvmazeId) },
  };
};

export const RecommendationCarousel: React.FC<RecommendationCarouselProps> = ({
  section,
  onAddShow,
  onDismissShow,
}) => {
  const router = useRouter();
  const { isInWatchlist } = useWatchlistStore();

  if (!section.shows || section.shows.length === 0) {
    return null;
  }

  return (
    <View className="mb-6">
      {/* Section Header */}
      <View className="px-4 mb-3">
        <View className="flex-row items-center">
          <Sparkles size={16} color="#818cf8" className="mr-1.5" />
          <Text className="text-base font-bold text-white ml-1.5">
            {section.title}
          </Text>
        </View>
        {section.subtitle ? (
          <Text className="text-xs text-zinc-400 mt-0.5">{section.subtitle}</Text>
        ) : null}
      </View>

      {/* Horizontal Carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {section.shows.map((show) => {
          const isAdded = isInWatchlist(titleKey(show));
          const premierYear = show.premiered
            ? new Date(show.premiered).getFullYear()
            : null;

          return (
            <View
              key={titleKey(show)}
              className="w-40 bg-card border border-border/50 rounded-2xl overflow-hidden shadow-md"
            >
              {/* Poster Container */}
              <TouchableOpacity
                onPress={() => router.push(titleRoute(show))}
                activeOpacity={0.8}
                className="w-full h-52 bg-zinc-800 relative"
              >
                {show.posterUrl ? (
                  <Image
                    source={{ uri: show.posterUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-full h-full items-center justify-center">
                    <Tv size={28} color="#71717a" />
                  </View>
                )}

                {/* Rating badge */}
                {show.rating ? (
                  <View className="absolute top-2 left-2 bg-black/80 px-1.5 py-0.5 rounded-md flex-row items-center">
                    <Star size={10} color="#fbbf24" fill="#fbbf24" />
                    <Text className="text-white text-[10px] font-bold ml-1">
                      {show.rating.toFixed(1)}
                    </Text>
                  </View>
                ) : null}

                {/* Dismiss (X) button */}
                <TouchableOpacity
                  onPress={() => onDismissShow(show)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 items-center justify-center"
                >
                  <X size={12} color="#d4d4d8" />
                </TouchableOpacity>
              </TouchableOpacity>

              {/* Show Info */}
              <View className="p-2.5 justify-between flex-1">
                <TouchableOpacity
                  onPress={() => router.push(titleRoute(show))}
                  activeOpacity={0.8}
                >
                  <Text
                    className="text-sm font-bold text-white"
                    numberOfLines={1}
                  >
                    {show.title}
                  </Text>
                  <Text className="text-[11px] text-zinc-400 mt-0.5" numberOfLines={1}>
                    {premierYear ? `${premierYear} ` : ''}
                    {show.network ? `• ${show.network}` : ''}
                  </Text>
                  {/* Why the recommender surfaced this card. */}
                  {show.reason ? (
                    <Text className="text-[10px] text-primary-400 mt-1" numberOfLines={1}>
                      {show.reason}
                    </Text>
                  ) : null}
                </TouchableOpacity>

                {/* Streaming badge if available */}
                {show.streamingProviders && show.streamingProviders.length > 0 ? (
                  <View className="mt-2">
                    <StreamingBadge
                      provider={show.streamingProviders[0]}
                      size="sm"
                    />
                  </View>
                ) : null}

                {/* Quick Add / In Watchlist Action Button */}
                <TouchableOpacity
                  onPress={() => onAddShow(show)}
                  activeOpacity={0.8}
                  className={`mt-2.5 py-1.5 rounded-xl flex-row items-center justify-center border ${
                    isAdded
                      ? 'bg-primary-500/20 border-primary-500'
                      : 'bg-primary-500 border-primary-500'
                  }`}
                >
                  {isAdded ? (
                    <>
                      <Check size={13} color="#818cf8" className="mr-1" />
                      <Text className="text-primary-400 text-xs font-bold">
                        Added
                      </Text>
                    </>
                  ) : (
                    <>
                      <Plus size={13} color="#ffffff" className="mr-1" />
                      <Text className="text-white text-xs font-bold">
                        + Watchlist
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default RecommendationCarousel;
