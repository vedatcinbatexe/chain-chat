import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { useOnboardingState } from '@/onboarding/useOnboardingState';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <MaterialCommunityIcons name={name} color={color} size={size} />;
  };
}

/** The main app is only reachable once the wallet is registered on-chain with this phone's encryption key. */
export default function TabsLayout() {
  const onboarding = useOnboardingState();

  switch (onboarding.kind) {
    case 'no-wallet':
      return <Redirect href="/welcome" />;
    case 'needs-registration':
    case 'needs-key-update':
      return <Redirect href="/register" />;
    case 'checking':
      return <LoadingScreen label="Checking your wallet on the blockchain…" />;
    case 'error':
      return <ErrorScreen message={onboarding.message} onRetry={onboarding.retry} />;
  }

  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: tabIcon('message-text-outline') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: tabIcon('account-search-outline') }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: tabIcon('account-group-outline') }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: tabIcon('history') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('cog-outline') }} />
    </Tabs>
  );
}
