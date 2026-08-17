import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

interface TabItem<T extends string> {
  key: T;
  label: string;
  count?: number;
}

interface SegmentedTabsProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}

export function SegmentedTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
}: SegmentedTabsProps<T>) {
  return (
    <View className="px-4 py-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              className={`flex-row items-center px-4 py-2 rounded-full border ${
                isActive
                  ? 'bg-primary-500 border-primary-500'
                  : 'bg-card border-border/50'
              }`}
              activeOpacity={0.7}
            >
              <Text
                className={`text-sm font-semibold ${
                  isActive ? 'text-white' : 'text-zinc-400'
                }`}
              >
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <View
                  className={`ml-2 px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/25' : 'bg-zinc-800'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isActive ? 'text-white' : 'text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default SegmentedTabs;
