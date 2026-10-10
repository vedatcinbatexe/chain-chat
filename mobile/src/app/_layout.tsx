import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { NotificationBanner } from '@/notifications/NotificationBanner';
import { getThemes } from '@/theme/theme';
import { useWalletStore } from '@/wallet/walletStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const themes = getThemes(useColorScheme());
  const status = useWalletStore((state) => state.status);
  const load = useWalletStore((state) => state.load);

  // Read the wallet from secure storage once; keep the splash screen up until we know which flow to show.
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={themes.paper} settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}>
          <ThemeProvider value={themes.navigation}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="user/[address]" options={{ headerShown: true, title: 'Profile', headerBackTitle: 'Back' }} />
              <Stack.Screen name="chat/[address]" options={{ headerShown: true, title: 'Chat', headerBackTitle: 'Chats' }} />
              <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group', headerBackTitle: 'Back' }} />
              <Stack.Screen name="send" options={{ headerShown: true, title: 'Withdraw / Send', headerBackTitle: 'Back' }} />
              <Stack.Screen name="join/[code]" options={{ headerShown: true, title: 'Group invite', headerBackTitle: 'Back' }} />
            </Stack>
            <NotificationBanner />
            <StatusBar style="auto" />
          </ThemeProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
