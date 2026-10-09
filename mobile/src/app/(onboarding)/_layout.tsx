import { Redirect, Stack } from 'expo-router';

import { useOnboardingState } from '@/onboarding/useOnboardingState';

/** Onboarding: create/import a wallet, then register on-chain. Once complete, go to the app. */
export default function OnboardingLayout() {
  const onboarding = useOnboardingState();
  if (onboarding.kind === 'complete') return <Redirect href="/" />;

  return (
    <Stack>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="import" options={{ title: 'Import wallet', headerBackTitle: 'Back' }} />
      <Stack.Screen name="register" options={{ headerShown: false, gestureEnabled: false }} />
    </Stack>
  );
}
