import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { IconButton, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { useSessionStore } from '@/auth/sessionStore';
import { ChatConnection } from '@/chat/ChatConnection';
import { NotificationBanner } from '@/notifications/NotificationBanner';
import { useOnboardingState } from '@/onboarding/useOnboardingState';
import { getThemes, resolveScheme } from '@/theme/theme';
import { useThemeStore } from '@/theme/themeStore';
import { useWalletStore } from '@/wallet/walletStore';

SplashScreen.preventAutoHideAsync();

/**
 * One real-time connection for the whole signed-in app. It lives above the screens, so it is also open when the
 * app starts directly in a chat (an invite link, a notification, a reload) without the tab bar ever being shown.
 */
function SignedInServices() {
  const registered = useOnboardingState().kind === 'complete';
  const banned = useSessionStore((state) => state.banned);
  return registered && !banned ? <ChatConnection /> : null;
}

/** Shown in place of the back button on a screen with no screen behind it; opens the chat list and the tab bar. */
function HomeButton() {
  const router = useRouter();
  return <IconButton icon="home-outline" onPress={() => router.replace('/')} accessibilityLabel="Go to chats" style={{ margin: 0 }} />;
}

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const scheme = resolveScheme(useThemeStore((state) => state.preference), systemScheme);
  const themes = getThemes(scheme);
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
            {/* A screen the app started on (an invite link, a reload inside a chat) has nothing behind it: give it a way to the tabs. */}
            <Stack screenOptions={({ navigation }) => ({ headerShown: false, headerLeft: navigation.canGoBack() ? undefined : () => <HomeButton /> })}>
              <Stack.Screen name="user/[address]" options={{ headerShown: true, title: 'Profile', headerBackTitle: 'Back' }} />
              <Stack.Screen name="chat/[address]" options={{ headerShown: true, title: 'Chat', headerBackTitle: 'Chats' }} />
              <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group', headerBackTitle: 'Back' }} />
              <Stack.Screen name="send" options={{ headerShown: true, title: 'Withdraw / Send', headerBackTitle: 'Back' }} />
              <Stack.Screen name="join/[code]" options={{ headerShown: true, title: 'Group invite', headerBackTitle: 'Back' }} />
            </Stack>
            <SignedInServices />
            <NotificationBanner />
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          </ThemeProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
