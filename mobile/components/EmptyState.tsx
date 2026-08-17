import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Tv, Sparkles, Calendar, Search } from 'lucide-react-native';

interface EmptyStateProps {
  type?: 'watchlist' | 'search' | 'calendar' | 'general';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'general',
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const renderIcon = () => {
    switch (type) {
      case 'watchlist':
        return <Tv size={48} color="#6366f1" />;
      case 'search':
        return <Search size={48} color="#818cf8" />;
      case 'calendar':
        return <Calendar size={48} color="#10b981" />;
      default:
        return <Sparkles size={48} color="#a1a1aa" />;
    }
  };

  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View className="w-20 h-20 rounded-full bg-card border border-border/80 items-center justify-center mb-5 shadow-lg">
        {renderIcon()}
      </View>
      <Text className="text-xl font-bold text-white text-center mb-2">
        {title}
      </Text>
      <Text className="text-sm text-zinc-400 text-center leading-relaxed max-w-[280px] mb-6">
        {description}
      </Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.8}
          className="bg-primary-500 hover:bg-primary-600 px-6 py-3 rounded-xl shadow-md"
        >
          <Text className="text-white font-semibold text-sm">{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default EmptyState;
