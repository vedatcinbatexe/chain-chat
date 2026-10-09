import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useWalletStore } from '@/wallet/walletStore';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <MaterialCommunityIcons name={name} color={color} size={size} />;
  };
}

/** The main app is only reachable with a wallet; without one, start onboarding. */
export default function TabsLayout() {
  const status = useWalletStore((state) => state.status);
  if (status !== 'ready') return <Redirect href="/welcome" />;

  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: tabIcon('message-text-outline') }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: tabIcon('account-group-outline') }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: tabIcon('history') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('cog-outline') }} />
    </Tabs>
  );
}
