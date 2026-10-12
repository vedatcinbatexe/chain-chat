import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { ThemePreference } from './theme';

const KEY = 'chainchat.theme';

/** Read synchronously at startup so the first frame is already drawn in the chosen theme. */
function stored(): ThemePreference {
  try {
    const value = SecureStore.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

/** Light, dark, or follow the phone. Kept on this phone only; it survives logging out. */
export const useThemeStore = create<ThemeState>((set) => ({
  preference: stored(),
  setPreference: (preference) => {
    set({ preference });
    SecureStore.setItemAsync(KEY, preference).catch((error) => console.warn('Could not save the theme choice', error));
  },
}));
