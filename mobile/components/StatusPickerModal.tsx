import React from 'react';
import { View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Check, Trash2, Eye, Calendar, CheckCircle2, XCircle } from 'lucide-react-native';
import { WatchlistStatus } from '../types';

interface StatusPickerModalProps {
  visible: boolean;
  currentStatus?: WatchlistStatus;
  showTitle: string;
  onClose: () => void;
  onSelectStatus: (status: WatchlistStatus) => void;
  onRemove?: () => void;
}

const STATUS_OPTIONS: Array<{
  key: WatchlistStatus;
  label: string;
  description: string;
  icon: (color: string) => React.ReactNode;
}> = [
  {
    key: 'WATCHING',
    label: 'Currently Watching',
    description: 'Track new episodes and receive release alerts',
    icon: (c) => <Eye size={18} color={c} />,
  },
  {
    key: 'PLAN_TO_WATCH',
    label: 'Plan to Watch',
    description: 'Mark to watch when season premieres or starts',
    icon: (c) => <Calendar size={18} color={c} />,
  },
  {
    key: 'COMPLETED',
    label: 'Completed',
    description: 'Finished watching all released episodes',
    icon: (c) => <CheckCircle2 size={18} color={c} />,
  },
  {
    key: 'DROPPED',
    label: 'Dropped',
    description: 'Stopped watching this show',
    icon: (c) => <XCircle size={18} color={c} />,
  },
];

export const StatusPickerModal: React.FC<StatusPickerModalProps> = ({
  visible,
  currentStatus,
  showTitle,
  onClose,
  onSelectStatus,
  onRemove,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/70 justify-end">
          <TouchableWithoutFeedback>
            <View className="bg-card border-t border-border rounded-t-3xl p-6">
              {/* Header */}
              <View className="items-center mb-5">
                <View className="w-12 h-1.5 bg-zinc-700 rounded-full mb-4" />
                <Text className="text-lg font-bold text-white text-center" numberOfLines={1}>
                  {showTitle}
                </Text>
                <Text className="text-xs text-zinc-400 mt-0.5">Select Watchlist Status</Text>
              </View>

              {/* Status List */}
              <View className="space-y-2 mb-4">
                {STATUS_OPTIONS.map((opt) => {
                  const isSelected = currentStatus === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => {
                        onSelectStatus(opt.key);
                        onClose();
                      }}
                      activeOpacity={0.7}
                      className={`flex-row items-center p-3.5 rounded-xl border mb-2 ${
                        isSelected
                          ? 'bg-primary-500/20 border-primary-500'
                          : 'bg-zinc-800/50 border-border/40'
                      }`}
                    >
                      <View className="mr-3">
                        {opt.icon(isSelected ? '#818cf8' : '#a1a1aa')}
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`text-sm font-semibold ${
                            isSelected ? 'text-white' : 'text-zinc-200'
                          }`}
                        >
                          {opt.label}
                        </Text>
                        <Text className="text-xs text-zinc-400 mt-0.5">
                          {opt.description}
                        </Text>
                      </View>
                      {isSelected && (
                        <Check size={18} color="#818cf8" className="ml-2" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Remove Option */}
              {onRemove && (
                <TouchableOpacity
                  onPress={() => {
                    onRemove();
                    onClose();
                  }}
                  activeOpacity={0.7}
                  className="flex-row items-center justify-center p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 mb-2"
                >
                  <Trash2 size={16} color="#f87171" className="mr-2" />
                  <Text className="text-sm font-semibold text-red-400">
                    Remove from Watchlist
                  </Text>
                </TouchableOpacity>
              )}

              {/* Cancel Button */}
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                className="p-3 rounded-xl items-center mt-1"
              >
                <Text className="text-sm font-medium text-zinc-400">Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default StatusPickerModal;
