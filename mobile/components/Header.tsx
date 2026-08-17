import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface HeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, rightElement }) => {
  return (
    <View className="flex-row items-center justify-between px-4 pt-3 pb-2 bg-background">
      <View className="flex-1 pr-2">
        <Text className="text-2xl font-bold text-white tracking-tight">{title}</Text>
        {subtitle ? (
          <Text className="text-sm text-zinc-400 mt-0.5">{subtitle}</Text>
        ) : null}
      </View>
      {rightElement ? <View>{rightElement}</View> : null}
    </View>
  );
};

export default Header;
