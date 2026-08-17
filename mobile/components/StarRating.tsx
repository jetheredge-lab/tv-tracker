import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Star } from 'lucide-react-native';

interface StarRatingProps {
  rating: number | null | undefined;
  onRatingChange?: (rating: number) => void;
  size?: number;
  interactive?: boolean;
  showText?: boolean;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  onRatingChange,
  size = 18,
  interactive = false,
  showText = false,
}) => {
  const currentRating = rating || 0;

  return (
    <View className="flex-row items-center">
      <View className="flex-row items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= currentRating;

          const StarElement = (
            <Star
              key={star}
              size={size}
              color={isFilled ? '#fbbf24' : '#52525b'}
              fill={isFilled ? '#fbbf24' : 'transparent'}
            />
          );

          if (interactive && onRatingChange) {
            return (
              <TouchableOpacity
                key={star}
                onPress={() => onRatingChange(star === currentRating ? 0 : star)}
                activeOpacity={0.7}
                className="p-1"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                {StarElement}
              </TouchableOpacity>
            );
          }

          return <View key={star} className="mr-0.5">{StarElement}</View>;
        })}
      </View>
      {showText && currentRating > 0 ? (
        <Text className="text-xs font-bold text-amber-400 ml-1.5">
          {currentRating}/5
        </Text>
      ) : null}
    </View>
  );
};

export default StarRating;
