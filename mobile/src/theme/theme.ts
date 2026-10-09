import { DarkTheme as NavigationDark, DefaultTheme as NavigationLight } from 'expo-router';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/** ChainChat brand: indigo primary, teal accent. */
const lightPaper: MD3Theme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, primary: '#3b5bdb', secondary: '#0c8599', primaryContainer: '#dbe4ff' },
};

const darkPaper: MD3Theme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, primary: '#91a7ff', secondary: '#66d9e8', primaryContainer: '#364fc7' },
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

export function getThemes(scheme: 'light' | 'dark' | 'unspecified' | null | undefined) {
  return scheme === 'dark'
    ? { paper: darkPaper, navigation: navigationTheme(NavigationDark, darkPaper) }
    : { paper: lightPaper, navigation: navigationTheme(NavigationLight, lightPaper) };
}
