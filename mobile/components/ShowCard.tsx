import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Star, Calendar, Tv, Heart } from 'lucide-react-native';
import { Show, WatchlistStatus } from '../types';
import StreamingBadge from './StreamingBadge';
import StarRating from './StarRating';

interface ShowCardProps {
  show: Show;
  status?: WatchlistStatus;
  userRating?: number | null;
  isFavorite?: boolean;
  onStatusPress?: () => void;
  onFavoriteToggle?: () => void;
  onRatingChange?: (rating: number) => void;
}

export const ShowCard: React.FC<ShowCardProps> = ({
  show,
  status,
  userRating,
  isFavorite = false,
  onStatusPress,
  onFavoriteToggle,
  onRatingChange,
}) => {
  const router = useRouter();

  const handlePress = () => {
    const targetId = show.tvmazeId || show.id;
    router.push(`/show/${targetId}`);
  };

  const nextEp = show.nextEpisode;
  const premierYear = show.premiered ? new Date(show.premiered).getFullYear() : null;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      className="bg-card border border-border/50 rounded-2xl p-3.5 mb-3.5 mx-4 flex-row"
    >
      {/* Poster Image */}
      <View className="w-24 h-36 rounded-xl bg-zinc-800 overflow-hidden relative shadow-md">
        {show.posterUrl ? (
          <Image
            source={{ uri: show.posterUrl }}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-full items-center justify-center bg-zinc-800">
            <Tv size={28} color="#71717a" />
          </View>
        )}

        {/* Global Show Rating */}
        {show.rating ? (
          <View className="absolute top-1.5 left-1.5 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded-md flex-row items-center">
            <Star size={10} color="#fbbf24" fill="#fbbf24" />
            <Text className="text-white text-[10px] font-bold ml-1">
              {show.rating.toFixed(1)}
            </Text>
          </View>
        ) : null}

        {/* Favorite Heart Badge Overlay */}
        {isFavorite ? (
          <View className="absolute top-1.5 right-1.5 bg-black/80 backdrop-blur-md p-1 rounded-full">
            <Heart size={11} color="#f43f5e" fill="#f43f5e" />
          </View>
        ) : null}
      </View>

      {/* Show Details */}
      <View className="flex-1 ml-3.5 justify-between py-0.5">
        <View>
          {/* Title, Status & Favorite Toggle */}
          <View className="flex-row items-start justify-between">
            <Text
              className="text-base font-bold text-white flex-1 mr-2"
              numberOfLines={2}
            >
              {show.title}
            </Text>
            <View className="flex-row items-center space-x-1.5">
              {onFavoriteToggle && (
                <TouchableOpacity
                  onPress={onFavoriteToggle}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  className="p-1"
                >
                  <Heart
                    size={16}
                    color={isFavorite ? '#f43f5e' : '#71717a'}
                    fill={isFavorite ? '#f43f5e' : 'transparent'}
                  />
                </TouchableOpacity>
              )}
              {status && (
                <TouchableOpacity
                  onPress={onStatusPress}
                  activeOpacity={0.7}
                  className="bg-primary-500/20 border border-primary-500/40 px-2 py-0.5 rounded-full"
                >
                  <Text className="text-[10px] font-bold text-primary-400">
                    {status === 'PLAN_TO_WATCH' ? 'PLAN TO WATCH' : status}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Metadata: Year, Network, Genres */}
          <Text className="text-xs text-zinc-400 mt-1" numberOfLines={1}>
            {premierYear ? `${premierYear} ` : ''}
            {show.network ? `• ${show.network} ` : ''}
            {show.genres && show.genres.length > 0 ? `• ${show.genres.slice(0, 2).join(', ')}` : ''}
          </Text>

          {/* User Star Rating Component if provided */}
          {userRating !== undefined && (
            <View className="mt-1.5">
              <StarRating
                rating={userRating}
                onRatingChange={onRatingChange}
                interactive={!!onRatingChange}
                size={13}
                showText={true}
              />
            </View>
          )}

          {/* Next Episode Drop Highlight */}
          {nextEp ? (
            <View className="bg-primary-500/15 border border-primary-500/30 rounded-xl px-2.5 py-1.5 mt-2 flex-row items-center">
              <Calendar size={13} color="#818cf8" />
              <View className="ml-2 flex-1">
                <Text className="text-xs font-semibold text-primary-400" numberOfLines={1}>
                  S{String(nextEp.season).padStart(2, '0')}E{String(nextEp.number).padStart(2, '0')} • {nextEp.airdate}
                </Text>
                {nextEp.title ? (
                  <Text className="text-[11px] text-zinc-300" numberOfLines={1}>
                    "{nextEp.title}"
                  </Text>
                ) : null}
              </View>
            </View>
          ) : show.status === 'Ended' ? (
            <View className="bg-zinc-800/80 rounded-lg px-2 py-1 mt-2 self-start">
              <Text className="text-[11px] text-zinc-400 font-medium">Series Ended</Text>
            </View>
          ) : null}
        </View>

        {/* Streaming Providers */}
        {show.streamingProviders && show.streamingProviders.length > 0 ? (
          <View className="flex-row items-center flex-wrap gap-1.5 mt-2">
            {show.streamingProviders.slice(0, 2).map((prov, idx) => (
              <StreamingBadge key={idx} provider={prov} size="sm" />
            ))}
            {show.streamingProviders.length > 2 && (
              <View className="bg-card-elevated border border-border px-1.5 py-0.5 rounded-lg">
                <Text className="text-[10px] text-zinc-400">
                  +{show.streamingProviders.length - 2} more
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export default ShowCard;
