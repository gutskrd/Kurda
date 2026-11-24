import { useEffect, useRef } from 'react';
import { Animated, BackHandler, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SupervisionState } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { Locale } from '../i18n/translations';
import { useCurrentRoute } from '../navigation/currentRoute';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground } from '../theme/glass';
import { BreathingIcon } from '../theme/Icon';
import { duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useSupervision, type PauseNow } from './supervision';

/** Where a pause waits: a lesson already started is finished first, as the server lets it be. */
const LESSON_ROUTES: ReadonlySet<string> = new Set(['Lesson', 'Practice', 'JumpTest', 'NextLesson']);

/** The Settings pages a paused teen may still open, to see what was set and by whom. */
export const OPEN_WHILE_PAUSED: ReadonlySet<string> = new Set(['parental', 'parentalConnect']);

/**
 * The parental pause, over the whole app, for a supervised teen at bedtime or past the day's limit. Mounted once over
 * the navigator; drawn only while a pause is in force, never over a lesson in progress (it waits for the lesson to
 * end) and never over Parental controls, which it opens. It lifts by itself when the pause ends.
 */
export function PauseHost({ onOpenControls }: { onOpenControls: () => void }): React.JSX.Element | null {
  const { state, pause } = useSupervision();
  const route = useCurrentRoute();
  if (!state || !pause.paused) return null;
  if (route.name && LESSON_ROUTES.has(route.name)) return null;
  if (route.name === 'SettingsPage' && route.page && OPEN_WHILE_PAUSED.has(route.page)) return null;
  return <PauseScreen state={state} pause={pause} onOpenControls={onOpenControls} />;
}

/** The time a pause ends, as the teen's own clock shows it. */
function endsAt(iso: string | null, timeZone: string, locale: Locale): string {
  if (!iso) return '';
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone };
  try {
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
}

export function PauseScreen({ state, pause, onOpenControls }: { state: SupervisionState; pause: PauseNow; onOpenControls: () => void }): React.JSX.Element {
  const { logout } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const bedtime = pause.paused === 'bedtime';

  // A slow fade and a small settle, as night comes; nothing moves under Reduce Motion.
  const enter = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      enter.setValue(1);
      return;
    }
    const run = timing(enter, 1, duration.progress);
    run.start();
    return () => run.stop();
  }, [enter, reduce]);
  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  // The screens underneath stay where they are: Android's back must not move them unseen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const title = bedtime ? t('parental.pause.bedtime.title') : t('parental.pause.limit.title');
  const body = bedtime
    ? t('parental.pause.bedtime.body', { time: endsAt(pause.resumesAt, state.timeZone, locale) })
    : t('parental.pause.limit.body', { count: state.controls.dailyLimitMinutes ?? state.minutesToday });

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal testID="parental-pause">
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
          <Animated.View style={[styles.column, { opacity: enter, transform: [{ translateY: rise }] }]}>
            <View style={[styles.glyph, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <BreathingIcon name={bedtime ? 'moon' : 'timer'} size={44} color={colors.textPrimary} breaths={2} />
            </View>
            <Text style={[styles.title, styles.center, { color: colors.textPrimary }]} accessibilityRole="header" accessibilityLiveRegion="polite">
              {title}
            </Text>
            <Text style={[styles.body, dir.text, styles.center, { color: colors.textSecondary }]}>{body}</Text>
            <View style={styles.actions}>
              <ClayButton label={t('parental.title')} icon="parental" size="large" onPress={onOpenControls} testID="pause-controls" />
              <ClayButton label={t('profile.logout')} variant="outline" onPress={() => void logout()} testID="pause-sign-out" />
            </View>
          </Animated.View>
        </ScrollView>
      </GradientBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%', maxWidth: 420, alignItems: 'center', gap: spacing.md },
  glyph: { width: 112, height: 112, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  title: { ...display(typography.sizes.title) },
  body: { fontSize: typography.sizes.text, lineHeight: 23 },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
});
