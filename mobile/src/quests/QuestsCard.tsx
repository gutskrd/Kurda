import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { CHEST_RATIO, ChestArt } from './ChestArt';
import { ChestWobble } from './ChestWobble';
import type { QuestDay } from '@kurda/shared';

/** The card's height while loading in grey: the chest and its padding. */
const CHEST = 36;
const CARD_HEIGHT = CHEST * CHEST_RATIO + 2 * (spacing.sm + 6) + 16;

/**
 * Today's quests on Learn, compact: a chest, "Daily quests" with the count done (or that a chest is ready,
 * today's or an earlier day's, with a dot and an occasional shake, ChestWobble), and a short bar for each of the
 * three. A tap opens the full list (QuestsScreen), where chests are opened. A ready chest's dot and text are
 * violet like the tab bar's dots; gold stays with the earned bars.
 *
 * Reloaded whenever Learn comes into view. Grey while loading; a failed load says so and a tap retries; with no
 * quests today the card is hidden.
 */
export function QuestsCard(): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const [day, setDay] = useState<QuestDay | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  const load = useCallback(() => {
    let live = true;
    void client.get<QuestDay>('/me/quests').then((res) => {
      if (!live) return;
      if (res.ok) setDay(res.data);
      // A failed reload keeps what was shown.
      setStatus((was) => (res.ok ? 'ready' : was === 'ready' ? 'ready' : 'failed'));
    });
    return () => {
      live = false;
    };
  }, [client]);
  useFocusEffect(load);

  if (status === 'loading') {
    return (
      <View testID="quests-card-loading">
        <Skeleton height={CARD_HEIGHT} radius={radii.lg} />
      </View>
    );
  }
  if (status === 'failed' || !day) {
    return (
      <PressableScale
        onPress={() => {
          setStatus('loading');
          load();
        }}
        accessibilityRole="button"
        style={[styles.card, styles.failed, { flexDirection: dir.row, backgroundColor: colors.surface }]}
        testID="quests-card"
      >
        <Icon name="alert" size={18} color={colors.textSecondary} />
        <Text style={[styles.failedText, dir.text, { color: colors.textSecondary }]}>{t('quests.loadFailed')}</Text>
      </PressableScale>
    );
  }
  // An earlier day's unopened chest counts as waiting, as today's do.
  const earlier = (day.waiting ?? []).filter((q) => q.claimable);
  if (day.quests.length === 0 && earlier.length === 0) return null;

  const done = day.quests.filter((q) => q.progress >= q.target).length;
  const ready = day.quests.find((q) => q.claimable) ?? earlier[0] ?? null;
  // The chest drawn is the next one to open, or the last quest's while none waits.
  const chest = ready ?? day.quests[day.quests.length - 1]!;
  const summary = t('quests.card.summary', { done: formatNumber(done, locale), total: formatNumber(day.quests.length, locale) });
  const label = [t('quests.title'), summary, ready ? t('quests.ready') : null].filter(Boolean).join(', ');

  return (
    <PressableScale
      onPress={() => navigation.navigate('Quests')}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.surface }]}
      testID="quests-card"
    >
      <View>
        <ChestWobble active={ready !== null} testID="quests-card-shaking">
          <ChestArt tier={chest.chest} size={CHEST} open={chest.claimed} shine={ready !== null} />
        </ChestWobble>
        {ready ? <View style={[styles.dot, dir.rtl ? styles.dotRtl : null, { backgroundColor: colors.primary, borderColor: colors.surface }]} testID="quests-card-dot" /> : null}
      </View>
      <View style={styles.main}>
        {/* Side by side where both fit; on a narrow phone or with long labels the second wraps under the first rather than both truncating. */}
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <Text style={[styles.title, dir.text, { color: colors.textPrimary }]}>{t('quests.title')}</Text>
          <Text style={[styles.detail, dir.text, { color: ready ? colors.primary : colors.textSecondary }]}>{ready ? t('quests.ready') : summary}</Text>
        </View>
        <View style={[styles.bars, { flexDirection: dir.row }]}>
          {day.quests.map((q) => (
            <View key={q.id} style={[styles.track, { backgroundColor: colors.controlTrack, alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]}>
              <View style={[styles.fill, { width: `${Math.round(Math.min(1, q.progress / Math.max(1, q.target)) * 100)}%`, backgroundColor: colors.gold }]} />
            </View>
          ))}
        </View>
      </View>
      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm + 4, borderRadius: radii.lg, paddingVertical: spacing.sm + 6, paddingHorizontal: spacing.sm + 6, minHeight: CARD_HEIGHT },
  failed: { gap: spacing.sm },
  failedText: { flex: 1, fontSize: typography.sizes.sm },
  main: { flex: 1, gap: spacing.sm },
  head: { alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: 2 },
  title: { maxWidth: '100%', fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  detail: { maxWidth: '100%', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  bars: { gap: spacing.xs + 2 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
  // The dot on the chest's top corner: a chest waiting, said in words beside it too.
  dot: { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: radii.pill, borderWidth: 2 },
  dotRtl: { right: undefined, left: -3 },
});
