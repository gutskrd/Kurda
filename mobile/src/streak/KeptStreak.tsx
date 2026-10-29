import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { PATH_RETURN } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useAuth } from '../auth/AuthContext';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { REST, TONES } from '../coursemap/path';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { BottomSheet } from '../theme/BottomSheet';
import { Fire } from '../theme/Fire';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { Streak } from './format';
import { freezeSlots, keptKey, keptTitle, nextFreeze, streakKept } from './kept';

/**
 * It waits until the path has settled — the page scrolled to the lesson, and
 * anything a lesson just changed on it shown — so the two never play at once.
 */
export const KEPT_AFTER_MS = PATH_RETURN.bubbleAtMs + PATH_RETURN.bubbleMs;

/**
 * Whether a freeze has kept the streak since this phone last said so, and the
 * sheet that says it: shown once, after `ready` (the screen has the lesson its
 * button opens), with the system's success buzz and the headline read out.
 *
 * `pending` is true until it is known whether the sheet will show (the streak
 * and what this phone said last both read), while it is going to, and once it
 * has: it is this visit's moment, and Learn's other offers wait for another
 * visit (one moment at a time). A badge earned meanwhile waits too, until the
 * sheet is closed.
 */
export function useKeptStreak(
  streak: Streak | null,
  ready: boolean,
  store: DeviceStore = deviceStore,
): { pending: boolean; shown: Streak | null; close: () => void } {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const userId = user?.id ?? null;
  // the last kept day said on this phone; undefined until it has been read
  const [said, setSaid] = useState<{ userId: string; day: string | null } | undefined>(undefined);
  const [shown, setShown] = useState<Streak | null>(null);
  const [had, setHad] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void store.get(keptKey(userId)).then((day) => {
      if (live) setSaid({ userId, day });
    });
    return () => {
      live = false;
    };
  }, [userId, store]);

  const due = !!userId && said?.userId === userId && streakKept(streak, said.day);

  useEffect(() => {
    if (!due || !ready || !streak?.freezeUsedOn || !userId) return;
    const day = streak.freezeUsedOn;
    const id = setTimeout(() => {
      // said once: remembered as it is shown, not when it is closed
      void store.set(keptKey(userId), day);
      setSaid({ userId, day });
      setHad(true);
      setShown(streak);
      haptic('celebrate');
      const title = keptTitle(streak);
      AccessibilityInfo.announceForAccessibility?.(t(title.key, { count: formatNumber(title.params?.count ?? 1, locale) }));
    }, KEPT_AFTER_MS);
    return () => clearTimeout(id);
  }, [due, ready, streak, userId, store, t, locale]);

  useCelebrationHold(due || shown !== null);

  const close = useCallback(() => setShown(null), []);
  const known = streak !== null && said !== undefined;
  return { pending: !known || due || had, shown, close };
}

/**
 * "Your 6-day streak was kept by a freeze": what happened, the freezes held of
 * the places there are for them (filled, or an empty dashed place), how the
 * next one is earned, and one thing to do — a lesson, the way Continue opens
 * it — with "Not now" beside it. Nothing to buy: freezes are earned by
 * learning.
 *
 * The art is the streak's fire, still burning, on a round of ice the colour
 * of the river unit with a freeze's snowflake on it (the river holds 4.5:1
 * for its glyphs in both schemes, coursemap/path.ts).
 */
export function KeptStreakSheet({ streak, onStart, onClose }: { streak: Streak | null; onStart: () => void; onClose: () => void }): React.JSX.Element {
  return (
    <BottomSheet visible={streak !== null} onClose={onClose} testID="kept-streak">
      {streak ? <Kept streak={streak} onStart={onStart} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function Kept({ streak, onStart, onClose }: { streak: Streak; onStart: () => void; onClose: () => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const ice = TONES[scheme].river;
  const rest = REST[scheme];
  const title = keptTitle(streak);
  const next = nextFreeze(streak);
  const { held, max } = freezeSlots(streak);
  const count = (n: number) => formatNumber(n, locale);
  return (
    <View style={styles.body}>
      <View style={[styles.art, { backgroundColor: `${ice.fill}29` }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Fire size={76} />
        <View style={[styles.flake, { backgroundColor: ice.fill, borderColor: colors.background }]}>
          <Icon name="ice" size={20} color={ice.ink} />
        </View>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        {t(title.key, { count: count(title.params?.count ?? 1) })}
      </Text>
      <Text style={[styles.line, { color: colors.textSecondary }]}>{t('learn.kept.body')}</Text>
      <View style={styles.slots} accessible accessibilityLabel={t('learn.kept.slots', { held: count(held), max: count(max) })} testID="kept-slots">
        {Array.from({ length: max }, (_, i) =>
          i < held ? (
            <View key={i} style={[styles.slot, { backgroundColor: ice.fill }]}>
              <Icon name="ice" size={24} color={ice.ink} />
            </View>
          ) : (
            <View key={i} style={[styles.slot, styles.slotEmpty, { borderColor: rest.ink }]}>
              <Icon name="ice" size={24} color={rest.ink} />
            </View>
          ),
        )}
      </View>
      {next ? (
        <Text style={[styles.line, { color: colors.textSecondary }]}>{t(next.key, next.params ? { count: count(next.params.count ?? 0) } : undefined)}</Text>
      ) : null}
      <ClayButton label={t('learn.kept.start')} tone="primary" size="large" onPress={onStart} style={styles.stretch} />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        style={({ pressed }) => [styles.notNow, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.notNowText, { color: colors.textSecondary }]}>{t('learn.kept.notNow')}</Text>
      </Pressable>
    </View>
  );
}

const ART = 112;
const SLOT = 52;

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.sm + 4, paddingBottom: spacing.sm },
  art: { width: ART, height: ART, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  flake: {
    position: 'absolute',
    bottom: 6,
    end: 6,
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...display(typography.sizes.xl), textAlign: 'center' },
  line: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  slots: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.xs },
  slot: { width: SLOT, height: SLOT, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  // an empty place: the outline of a freeze not held
  slotEmpty: { borderWidth: 2, borderStyle: 'dashed' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.xs },
  notNow: { minHeight: MIN_TOUCH_TARGET, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  notNowText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
