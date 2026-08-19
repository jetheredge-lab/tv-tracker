import React from 'react';
import { View, Text, TouchableOpacity, Linking, Image } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { StreamingProvider } from '../types';

interface StreamingBadgeProps {
  provider: StreamingProvider;
  size?: 'sm' | 'md';
  interactive?: boolean;
}

export const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'apple tv+': { bg: '#000000', text: '#ffffff', border: '#3f3f46' },
  // TMDB calls the Apple TV+ subscription plainly "Apple TV"; the iTunes
  // storefront is a separate brand ("Apple TV Store").
  'apple tv': { bg: '#000000', text: '#ffffff', border: '#3f3f46' },
  'netflix': { bg: '#e50914', text: '#ffffff', border: '#e50914' },
  'max': { bg: '#002be7', text: '#ffffff', border: '#002be7' },
  'hbo': { bg: '#002be7', text: '#ffffff', border: '#002be7' },
  'disney+': { bg: '#113ccf', text: '#ffffff', border: '#113ccf' },
  'hulu': { bg: '#1ce783', text: '#09090b', border: '#1ce783' },
  'prime video': { bg: '#00a8e1', text: '#ffffff', border: '#00a8e1' },
  'peacock': { bg: '#000000', text: '#00a859', border: '#00a859' },
  'paramount+': { bg: '#0064ff', text: '#ffffff', border: '#0064ff' },
  'amc+': { bg: '#000000', text: '#f3c300', border: '#f3c300' },
};

export const StreamingBadge: React.FC<StreamingBadgeProps> = ({
  provider,
  size = 'sm',
  interactive = false,
}) => {
  const normalized = provider.providerName.toLowerCase().trim();
  const theme = PROVIDER_COLORS[normalized] || {
    bg: '#27272a',
    text: '#f43f5e',
    border: '#3f3f46',
  };

  const handlePress = () => {
    if (interactive && provider.deepLink) {
      Linking.openURL(provider.deepLink).catch((err) =>
        console.warn('Could not open deep link:', err)
      );
    }
  };

  const isSmall = size === 'sm';

  const Content = (
    <View
      style={{ backgroundColor: theme.bg, borderColor: theme.border }}
      className={`flex-row items-center border rounded-lg ${
        isSmall ? 'px-2 py-0.5' : 'px-3 py-1.5'
      }`}
    >
      {provider.logoUrl ? (
        <Image
          source={{ uri: provider.logoUrl }}
          className={`${isSmall ? 'w-3.5 h-3.5 mr-1.5' : 'w-5 h-5 mr-2'} rounded-full`}
          resizeMode="cover"
        />
      ) : null}
      <Text
        style={{ color: theme.text }}
        className={`font-semibold ${isSmall ? 'text-[11px]' : 'text-xs'}`}
        numberOfLines={1}
      >
        {provider.providerName}
      </Text>
      {interactive && provider.deepLink ? (
        <ExternalLink size={isSmall ? 10 : 12} color={theme.text} className="ml-1 opacity-80" />
      ) : null}
    </View>
  );

  if (interactive && provider.deepLink) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        {Content}
      </TouchableOpacity>
    );
  }

  return Content;
};

export default StreamingBadge;
