import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAINTENANCE_POLL_SECONDS, type MaintenanceNotice } from '@kurda/shared';
import MASCOT from '../../assets/mascot-deer.png';
import type { ApiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { formatExpectedAt } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { checkStatus, useMaintenance } from './maintenance';

const POLL_MS = MAINTENANCE_POLL_SECONDS * 1000;

/**
 * "Hevalo is offline for a while", over the whole app. Mounted once at the root, above the navigator and the
 * crash screen, and drawn only while there is a notice (maintenance.ts). Shows the admin's text and picture,
 * falling back to the app's own words, and the expected return time.
 *
 * Polls `GET /status` every 30 s while in the foreground, on returning to the foreground and on "Try again". When
 * Hevalo is open again it goes, and the screens underneath resume where they were (App.tsx).
 */
export function MaintenanceScreen(): React.JSX.Element | null {
  const notice = useMaintenance();
  return notice ? <OfflineNotice notice={notice} /> : null;
}

/** Check whether Hevalo is back, one request at a time; `asking` only drives the button's state. */
function useStatusChecks(client: ApiClient): { asking: boolean; askNow: () => void } {
  const [asking, setAsking] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const ask = useCallback((): Promise<void> => {
    inFlight.current ??= checkStatus(client).finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [client]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = (): void => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = (): void => {
      stop();
      timer = setInterval(() => void ask(), POLL_MS);
    };
    // A phone in a pocket asks nothing; coming back to the front asks at once.
    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void ask();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      // react-native-web hands back nothing where the page cannot say whether it is visible.
      sub?.remove();
    };
  }, [ask]);

  const askNow = useCallback(() => {
    setAsking(true);
    void ask().finally(() => setAsking(false));
  }, [ask]);

  return { asking, askNow };
}

function OfflineNotice({ notice }: { notice: MaintenanceNotice }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { asking, askNow } = useStatusChecks(client);
  // An uploaded picture that does not load gives way to the deer, rather than to an empty frame.
  const [brokenPicture, setBrokenPicture] = useState<string | null>(null);
  const picture = notice.pictureUrl && notice.pictureUrl !== brokenPicture ? notice.pictureUrl : null;

  // A gentle fade in; nothing at all for somebody who has asked for less motion.
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    timing(enter, 1, duration.slow).start();
  }, [enter, reduceMotion]);

  // The screens under the notice stay put: Android's back must not navigate them unseen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // The admin's own words are read in their own direction; the app's in the reader's language.
  const titleDir = notice.title ? dir.free : dir.text;
  const messageDir = notice.message ? dir.free : dir.text;
  // A time already gone is no promise, so it is left out rather than shown in the past.
  const backBy = notice.backBy && Date.parse(notice.backBy) > Date.now() ? formatExpectedAt(notice.backBy, locale) : null;

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <GradientBackground>
        <ScrollView
          contentContainerStyle={[
            styles.page,
            {
              paddingTop: insets.top + spacing.xl,
              paddingBottom: insets.bottom + spacing.xl,
              paddingLeft: insets.left + layout.gutter,
              paddingRight: insets.right + layout.gutter,
            },
          ]}
        >
          <Animated.View style={[styles.column, { opacity: enter }]}>
            <View
              style={[styles.picture, { backgroundColor: colors.controlTrack }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {picture ? (
                <Image source={{ uri: picture }} style={styles.fill} resizeMode="cover" onError={() => setBrokenPicture(picture)} />
              ) : (
                <Image source={MASCOT} style={styles.deer} resizeMode="contain" />
              )}
            </View>

            <Text
              style={[styles.title, titleDir, styles.center, { color: colors.textPrimary }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {notice.title ?? t('maintenance.title')}
            </Text>
            <Text style={[styles.message, messageDir, styles.center, { color: colors.textSecondary }]}>
              {notice.message ?? t('maintenance.body')}
            </Text>

            {backBy ? (
              <View style={[styles.pill, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
                <Icon name="clock" size={16} color={colors.textSecondary} />
                <Text style={[styles.pillText, dir.text, { color: colors.textPrimary }]}>{t('maintenance.backBy', { time: backBy })}</Text>
              </View>
            ) : null}

            <ClayButton label={t('common.retry')} onPress={askNow} busy={asking} style={styles.retry} />
            <Text style={[styles.note, dir.text, styles.center, { color: colors.textSecondary }]}>
              {t('maintenance.checkEvery', { seconds: MAINTENANCE_POLL_SECONDS })}
            </Text>
          </Animated.View>
        </ScrollView>
      </GradientBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%', maxWidth: 480, alignItems: 'center', gap: spacing.md },
  // The admin's wide picture, or the deer standing in the same frame.
  picture: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  fill: { width: '100%', height: '100%' },
  deer: { height: '78%', aspectRatio: 512 / 480 },
  title: { ...display(24) },
  message: { fontSize: typography.sizes.text, lineHeight: 23 },
  center: { textAlign: 'center' },
  pill: {
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  pillText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  retry: { marginTop: spacing.sm, alignSelf: 'center' },
  note: { fontSize: typography.sizes.text, lineHeight: 22 },
});
