import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Heart } from 'lucide-react-native';

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  size?: number;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  isFavorite,
  onToggle,
  size = 20,
}) => {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className={`p-2 rounded-full ${
        isFavorite ? 'bg-rose-500/20' : 'bg-zinc-800/80'
      }`}
    >
      <Heart
        size={size}
        color={isFavorite ? '#f43f5e' : '#9ca3af'}
        fill={isFavorite ? '#f43f5e' : 'transparent'}
      />
    </TouchableOpacity>
  );
};

export default FavoriteButton;
