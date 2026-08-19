import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ArrowRight, KeyRound, Tv } from 'lucide-react-native';
import { useUserStore } from '../store/useUserStore';

/**
 * Shown when the server refuses to create this device's account without an
 * invite code. Rendered as a full-screen overlay above the navigator rather
 * than as a route, so it cannot be dismissed by navigating around it.
 */
export const InviteGate: React.FC = () => {
  const submitInviteCode = useUserStore((state) => state.submitInviteCode);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await submitInviteCode(code);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'That code was not accepted.');
    }
  };

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#09090b' }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 items-center justify-center px-6"
      >
        <View className="w-full max-w-sm">
          <View className="items-center mb-8">
            <View className="w-16 h-16 rounded-2xl bg-primary-500/20 border border-primary-500/40 items-center justify-center mb-3">
              <Tv size={32} color="#818cf8" />
            </View>
            <Text className="text-3xl font-black text-white tracking-tight">CueList</Text>
            <Text className="text-sm text-zinc-400 mt-2 text-center">
              This is a private instance. Enter your access code to set up this device.
            </Text>
          </View>

          {error ? (
            <View className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 mb-4">
              <Text className="text-xs font-semibold text-red-400 text-center">{error}</Text>
            </View>
          ) : null}

          <View className="bg-card border border-border/60 rounded-xl px-3.5 py-3 flex-row items-center mb-4">
            <KeyRound size={18} color="#71717a" />
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Access code"
              placeholderTextColor="#71717a"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
              className="flex-1 ml-2.5 text-white text-sm py-0"
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={busy}
            activeOpacity={0.8}
            className="w-full bg-primary-500 py-3.5 rounded-2xl flex-row items-center justify-center"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Text className="text-white font-bold text-base mr-1.5">Continue</Text>
                <ArrowRight size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>

          <Text className="text-[11px] text-zinc-500 text-center mt-4">
            Already have an account on another device? Enter the code, then sign in from Settings.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default InviteGate;
