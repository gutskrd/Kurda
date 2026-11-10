import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { timing } from '../theme/animate';
import { duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useIsOnline } from './useNetworkStatus';
import { useI18n } from '../i18n/I18nContext';

/**
 * A slim banner that drops in at the top while the device is offline (KUR-278).
 * Mounted once over the whole app, so it covers every screen (signed in or out).
 * Non-interactive — it only informs; each screen still handles its own retries.
 *
 * It arrives and leaves in the time every banner in the app takes (`duration.base`),
 * on the shared out-curve. Under Reduce Motion it does not travel: it fades in
 * where it sits, where it used to slide for everybody.
 */
export function OfflineBanner(): React.JSX.Element {
  const online = useIsOnline();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

  useEffect(() => {
    const run = timing(anim, online ? 0 : 1, duration.base);
    run.start();
    return () => run.stop();
  }, [online, anim]);

  const translateY = reduce ? 0 : anim.interpolate({ inputRange: [0, 1], outputRange: [-RISE, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { top: insets.top + spacing.sm, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.banner, { backgroundColor: colors.danger }]}>
        <Text style={[styles.text, { color: colors.textOnPrimary }]}>{t('net.offline.banner')}</Text>
      </View>
    </Animated.View>
  );
}

/** How far above its place the banner starts, in points. */
const RISE = 24;

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
