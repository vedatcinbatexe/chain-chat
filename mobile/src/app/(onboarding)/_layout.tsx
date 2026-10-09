import { Redirect, Stack } from 'expo-router';

import { useWalletStore } from '@/wallet/walletStore';

/** Onboarding is only reachable without a wallet; once one exists, go to the app. */
export default function OnboardingLayout() {
  const status = useWalletStore((state) => state.status);
  if (status === 'ready') return <Redirect href="/" />;

  return (
    <Stack>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="import" options={{ title: 'Import wallet', headerBackTitle: 'Back' }} />
    </Stack>
  );
}
