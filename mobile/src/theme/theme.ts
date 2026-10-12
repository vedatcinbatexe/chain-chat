import { DarkTheme as NavigationDark, DefaultTheme as NavigationLight } from 'expo-router';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/** ChainChat brand: indigo primary, teal accent — on a cool grey canvas in light mode and a deep navy one in dark. */
const lightPaper: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#3b5bdb',
    onPrimary: '#ffffff',
    primaryContainer: '#dbe4ff',
    onPrimaryContainer: '#1b2a6b',
    secondary: '#0c8599',
    secondaryContainer: '#d3f4f8',
    onSecondaryContainer: '#0b4a55',
    background: '#f4f6fb',
    surface: '#ffffff',
    surfaceVariant: '#e9edf6',
    onSurfaceVariant: '#515a6e',
    outline: '#8a93a6',
    outlineVariant: '#d5dbe8',
    elevation: { level0: 'transparent', level1: '#ffffff', level2: '#f7f9fd', level3: '#eef2fa', level4: '#e9eef8', level5: '#e3e9f6' },
  },
};

const darkPaper: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#91a7ff',
    onPrimary: '#0f1a4d',
    primaryContainer: '#2c3f9e',
    onPrimaryContainer: '#dbe4ff',
    secondary: '#66d9e8',
    secondaryContainer: '#0f4b57',
    onSecondaryContainer: '#c5f6fa',
    background: '#0d1017',
    surface: '#151924',
    surfaceVariant: '#222838',
    onSurfaceVariant: '#aab3c7',
    outline: '#7c869c',
    outlineVariant: '#2c3447',
    elevation: { level0: 'transparent', level1: '#161b27', level2: '#1b2130', level3: '#202738', level4: '#232b3d', level5: '#273044' },
  },
};

/** Navigation theme (headers, tab bar) using the same colors as the Paper components. */
function navigationTheme(base: typeof NavigationLight, paper: MD3Theme): typeof NavigationLight {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: paper.colors.primary,
      background: paper.colors.background,
      card: paper.colors.surface,
      text: paper.colors.onSurface,
      border: paper.colors.outlineVariant,
      notification: paper.colors.error,
    },
  };
}

export type ThemePreference = 'system' | 'light' | 'dark';

/** The scheme to draw: the user's choice, or the phone's setting when they chose "system". */
export function resolveScheme(preference: ThemePreference, system: 'light' | 'dark' | 'unspecified' | null | undefined): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function getThemes(scheme: 'light' | 'dark') {
  return scheme === 'dark'
    ? { paper: darkPaper, navigation: navigationTheme(NavigationDark, darkPaper) }
    : { paper: lightPaper, navigation: navigationTheme(NavigationLight, lightPaper) };
}
