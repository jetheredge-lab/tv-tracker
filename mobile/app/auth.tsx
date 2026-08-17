import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Tv, Mail, Lock, User, Eye, EyeOff, X, ArrowRight } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';

export default function AuthScreen() {
  const router = useRouter();
  const { login, register, isLoading } = useAuthStore();

  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (mode === 'REGISTER' && password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'LOGIN') {
      const result = await login(email, password);
      if (result.success) {
        router.replace('/(tabs)');
      } else {
        setErrorMsg(result.error || 'Login failed.');
      }
    } else {
      const result = await register(email, password, name);
      if (result.success) {
        Alert.alert('Account Created', 'Welcome to TV Tracker!');
        router.replace('/(tabs)');
      } else {
        setErrorMsg(result.error || 'Registration failed.');
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Dismiss button */}
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="absolute top-4 right-2 w-8 h-8 rounded-full bg-zinc-800/80 items-center justify-center"
          >
            <X size={18} color="#a1a1aa" />
          </TouchableOpacity>

          {/* Logo & Header */}
          <View className="items-center mb-8">
            <View className="w-16 h-16 rounded-2xl bg-primary-500/20 border border-primary-500/40 items-center justify-center mb-3 shadow-lg">
              <Tv size={32} color="#818cf8" />
            </View>
            <Text className="text-3xl font-black text-white tracking-tight">
              TV Tracker
            </Text>
            <Text className="text-sm text-zinc-400 mt-1 text-center">
              Sync your watchlist, ratings & recommendations across all your devices
            </Text>
          </View>

          {/* Mode Switcher */}
          <View className="flex-row bg-card border border-border/60 rounded-2xl p-1 mb-6">
            <TouchableOpacity
              onPress={() => {
                setMode('LOGIN');
                setErrorMsg(null);
              }}
              activeOpacity={0.8}
              className={`flex-1 py-2.5 rounded-xl items-center ${
                mode === 'LOGIN' ? 'bg-primary-500' : 'bg-transparent'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  mode === 'LOGIN' ? 'text-white' : 'text-zinc-400'
                }`}
              >
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setMode('REGISTER');
                setErrorMsg(null);
              }}
              activeOpacity={0.8}
              className={`flex-1 py-2.5 rounded-xl items-center ${
                mode === 'REGISTER' ? 'bg-primary-500' : 'bg-transparent'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  mode === 'REGISTER' ? 'text-white' : 'text-zinc-400'
                }`}
              >
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Banner */}
          {errorMsg && (
            <View className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 mb-4">
              <Text className="text-xs font-semibold text-red-400 text-center">
                {errorMsg}
              </Text>
            </View>
          )}

          {/* Form Fields */}
          <View className="space-y-3.5 mb-6">
            {mode === 'REGISTER' && (
              <View className="bg-card border border-border/60 rounded-xl px-3.5 py-3 flex-row items-center mb-3">
                <User size={18} color="#71717a" />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your Name (Optional)"
                  placeholderTextColor="#71717a"
                  className="flex-1 ml-2.5 text-white text-sm py-0"
                  autoCapitalize="words"
                />
              </View>
            )}

            <View className="bg-card border border-border/60 rounded-xl px-3.5 py-3 flex-row items-center mb-3">
              <Mail size={18} color="#71717a" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor="#71717a"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 ml-2.5 text-white text-sm py-0"
              />
            </View>

            <View className="bg-card border border-border/60 rounded-xl px-3.5 py-3 flex-row items-center">
              <Lock size={18} color="#71717a" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password (min 6 characters)"
                placeholderTextColor="#71717a"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                className="flex-1 ml-2.5 text-white text-sm py-0"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                {showPassword ? (
                  <EyeOff size={18} color="#71717a" />
                ) : (
                  <Eye size={18} color="#71717a" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
            className="w-full bg-primary-500 py-3.5 rounded-2xl flex-row items-center justify-center shadow-lg"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Text className="text-white font-bold text-base mr-1.5">
                  {mode === 'LOGIN' ? 'Sign In' : 'Create Account'}
                </Text>
                <ArrowRight size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>

          {/* Continue as Guest */}
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="mt-4 py-2 items-center"
          >
            <Text className="text-xs text-zinc-400 font-medium">
              Continue as Guest / Offline Mode
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
