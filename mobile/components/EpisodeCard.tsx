import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { ChevronDown, ChevronUp, Clock, Calendar } from 'lucide-react-native';
import { Episode } from '../types';

interface EpisodeCardProps {
  episode: Episode;
  showTitle?: string;
}

export const EpisodeCard: React.FC<EpisodeCardProps> = ({ episode, showTitle }) => {
  const [expanded, setExpanded] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = episode.airdate === todayStr;
  const isUpcoming = episode.airdate ? episode.airdate > todayStr : false;
  const isAired = episode.airdate ? episode.airdate < todayStr : false;

  const seasonCode = `S${String(episode.season).padStart(2, '0')}E${String(episode.number).padStart(2, '0')}`;

  return (
    <View className="bg-card border border-border/50 rounded-xl p-3.5 mb-2.5">
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        className="flex-row items-start justify-between"
      >
        <View className="flex-1 mr-2">
          {/* Episode Season/Number and Air Status Badge */}
          <View className="flex-row items-center gap-2 mb-1">
            <View className="bg-primary-500/20 px-2 py-0.5 rounded-md">
              <Text className="text-primary-400 font-bold text-xs">{seasonCode}</Text>
            </View>
            {isToday ? (
              <View className="bg-accent-emerald/20 border border-accent-emerald/40 px-2 py-0.5 rounded-md">
                <Text className="text-accent-emerald font-bold text-[10px]">AIRING TODAY</Text>
              </View>
            ) : isUpcoming ? (
              <View className="bg-accent-sky/20 border border-accent-sky/40 px-2 py-0.5 rounded-md">
                <Text className="text-accent-sky font-bold text-[10px]">UPCOMING</Text>
              </View>
            ) : isAired ? (
              <View className="bg-zinc-800 px-2 py-0.5 rounded-md">
                <Text className="text-zinc-400 font-medium text-[10px]">AIRED</Text>
              </View>
            ) : null}
          </View>

          {/* Episode Title */}
          <Text className="text-base font-semibold text-white mt-0.5" numberOfLines={expanded ? undefined : 1}>
            {episode.title || `Episode ${episode.number}`}
          </Text>

          {/* Air Date and Runtime */}
          <View className="flex-row items-center mt-1.5 space-x-3">
            {episode.airdate ? (
              <View className="flex-row items-center mr-3">
                <Calendar size={12} color="#9ca3af" />
                <Text className="text-xs text-zinc-400 ml-1.5">
                  {episode.airdate} {episode.airtime ? `• ${episode.airtime}` : ''}
                </Text>
              </View>
            ) : null}
            {episode.runtime ? (
              <View className="flex-row items-center">
                <Clock size={12} color="#9ca3af" />
                <Text className="text-xs text-zinc-400 ml-1.5">{episode.runtime}m</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Expand / Collapse Icon */}
        <View className="p-1">
          {expanded ? (
            <ChevronUp size={18} color="#9ca3af" />
          ) : (
            <ChevronDown size={18} color="#9ca3af" />
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded Synopsis & Image */}
      {expanded && (
        <View className="mt-3 pt-3 border-t border-border/40">
          {episode.image ? (
            <Image
              source={{ uri: episode.image }}
              className="w-full h-36 rounded-lg mb-2.5 bg-zinc-800"
              resizeMode="cover"
            />
          ) : null}
          <Text className="text-sm text-zinc-300 leading-relaxed">
            {episode.summary || 'No synopsis available for this episode.'}
          </Text>
        </View>
      )}
    </View>
  );
};

export default EpisodeCard;
