import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useIsOnline } from './useNetworkStatus';

/**
 * A slim banner that slides in at the top while the device is offline (KUR-278).
 * Mounted once over the whole app, so it covers every screen (signed in or out).
 * Non-interactive — it only informs; each screen still handles its own retries.
 */
export function OfflineBanner(): React.JSX.Element {
  const online = useIsOnline();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

  useEffect(() => {
    Animated.timing(anim, {
      toValue: online ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [online, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { top: insets.top + spacing.sm, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.banner, { backgroundColor: colors.danger }]}>
        <Text style={[styles.text, { color: colors.textOnPrimary }]}>No internet connection</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  banner: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  text: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
});
