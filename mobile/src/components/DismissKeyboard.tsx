import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Closes the keyboard when the user taps empty space. Taps on buttons and other touchables inside still work,
 * because they become the responder first.
 */
export function DismissKeyboard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable style={[styles.fill, style]} onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
