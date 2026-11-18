import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { useIsOnline } from '../net/useNetworkStatus';
import { useDirection } from '../reports/direction';
import { timing } from './animate';
import { Icon } from './Icon';
import { duration } from './motion';
import { onNotice } from './notice';
import { Pressable } from './Pressable';
import { useTheme } from './ThemeProvider';
import { radii, spacing, typography } from './tokens';

/** How long a notice stays, and how many show at once, as on the website (web/src/chat/MessagesProvider.tsx). */
export const NOTICE_MS = 6000;
const MAX_NOTICES = 3;

/** Where the offline pill ends, so notices raised while offline sit under it rather than over it. */
const OFFLINE_PILL = 36;

/**
 * The app's short notices (theme/notice.ts) as quiet cards at the top, over every screen. A notice already showing is
 * not stacked again, so a burst of failures while offline says it once. Each is read out as it comes, leaves by itself
 * after `NOTICE_MS`, and can be closed sooner. Mounted once at the root.
 */
export function NoticeToasts(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const [notices, setNotices] = useState<string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((text: string) => {
    clearTimeout(timers.current.get(text));
    timers.current.delete(text);
    setNotices((list) => list.filter((n) => n !== text));
  }, []);

  useEffect(() => {
    const live = timers.current;
    const stop = onNotice((text) => {
      if (live.has(text)) return;
      live.set(text, setTimeout(() => dismiss(text), NOTICE_MS));
      setNotices((list) => [...list, text].slice(-MAX_NOTICES));
      // Android reads the live region as it appears; iOS needs telling.
      if (Platform.OS !== 'android') AccessibilityInfo.announceForAccessibility?.(text);
    });
    return () => {
      stop();
      for (const timer of live.values()) clearTimeout(timer);
      live.clear();
    };
  }, [dismiss]);

  if (notices.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm + (online ? 0 : OFFLINE_PILL) }]}>
      {notices.map((text) => (
        <NoticeCard key={text} text={text} onClose={() => dismiss(text)} />
      ))}
    </View>
  );
}

function NoticeCard({ text, onClose }: { text: string; onClose: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const arrive = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = timing(arrive, 1, duration.base);
    run.start();
    return () => run.stop();
  }, [arrive]);
  const translateY = reduce ? 0 : arrive.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { flexDirection: dir.row, backgroundColor: colors.surfaceRaised, borderColor: colors.separator, shadowColor: colors.softShadow },
        { opacity: arrive, transform: [{ translateY }] },
      ]}
      testID="notice-toast"
    >
      <Text style={[styles.text, dir.text, { color: colors.textPrimary }]}>{text}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close}>
        <Icon name="close" size={16} tone="secondary" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', gap: spacing.xs, zIndex: 110 },
  card: {
    alignSelf: 'stretch',
    maxWidth: 420,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  text: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
