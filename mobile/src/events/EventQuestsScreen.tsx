import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import type { ApiError } from '../api/types';
import { describeError, describeErrorOr, isMaintenance } from '../api/errors';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatCountdown, remainingUntil } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { EmptyState } from '../theme/EmptyState';
import {
  claimState,
  progressPct,
  questTitle,
  rewardLabel,
  sortQuests,
  type EventQuestsView,
  type QuestView,
} from './quests.js';

interface ActiveEvent {
  key: string;
  name: string;
}

/** Event quests progress + explicit claim buttons (KUR-091). */
export function EventQuestsScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [events, setEvents] = useState<EventQuestsView[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // tick so the ends-in countdown stays live while the screen is open
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /*
   * An event whose quests did not load is not an event that is not running.
   * Dropping it said "No events" while one was on; now the ones that loaded
   * show with a line about the rest and a way to ask again, and when none of
   * them loaded the screen is one that did not load, with its retry.
   */
  const [missing, setMissing] = useState<ApiError | null>(null);
  // a claim that did not go through, said above the quests rather than not at all
  const [claimError, setClaimError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const active = await client.get<{ events: ActiveEvent[] }>('/events/active');
    if (!active.ok) {
      setError(active.error);
      return;
    }
    const views = await Promise.all(
      active.data.events.map((e) => client.get<EventQuestsView>(`/events/${e.key}/quests`)),
    );
    const loaded = views.flatMap((v) => (v.ok ? [v.data] : []));
    const failed = views.find((v) => !v.ok);
    const failure = failed && !failed.ok ? failed.error : null;
    if (failure && loaded.length === 0) {
      setEvents(null);
      setError(failure);
      return;
    }
    setEvents(loaded);
    setMissing(failure);
    setError(null);
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const claim = useCallback(
    async (eventKey: string, quest: QuestView) => {
      setClaiming(quest.id);
      setClaimError(null);
      const res = await client.post(`/events/${eventKey}/quests/${quest.id}/claim`);
      setClaiming(null);
      // Hevalo offline for a while is said by the screen over the app
      if (!res.ok && !isMaintenance(res.error)) {
        haptic('error');
        setClaimError(res.error);
      }
      // either way the quests are read again: a refusal usually means the server sees them differently
      await load();
    },
    [client, load],
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('events.title')} onBack={onExit} />

        <AsyncBoundary loading={events === null} error={events === null ? error : null} isEmpty={events?.length === 0} onRetry={() => void load()} empty={<EmptyState title={t('events.none')} />}>
          {() => events == null ? null : (
          <ScrollView contentContainerStyle={styles.content}>
            {claimError ? (
              <Notice text={describeErrorOr(claimError, t, 'events.claimFailed')} onDismiss={() => setClaimError(null)} />
            ) : null}
            {missing ? <Notice title={t('events.someMissing')} text={describeError(missing, t)} onRetry={() => void load()} /> : null}
            {events.map((event) => {
              const countdown = formatCountdown(remainingUntil(event.endsAt, now), t);
              return (
                <View key={event.eventKey} style={styles.eventBlock}>
                  <View style={styles.eventHeader}>
                    <Text style={[styles.eventName, { color: colors.textSecondary }]}>{event.name}</Text>
                    {countdown ? <Text style={[styles.countdown, { color: colors.textSecondary }]}>{t('events.endsIn', { time: countdown })}</Text> : null}
                  </View>
                  {sortQuests(event.quests).map((q) => (
                    <QuestRow
                      key={q.id}
                      quest={q}
                      busy={claiming === q.id}
                      onClaim={() => claim(event.eventKey, q)}
                    />
                  ))}
                </View>
              );
            })}
          </ScrollView>
          )}
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

/**
 * What went wrong with the list, said above it in the reader's words, with
 * the way on: put away (a claim that did not go through), or asked again
 * (events that did not load). Drawn as the app's other failure notices are.
 */
function Notice({ title, text, onDismiss, onRetry }: { title?: string; text: string; onDismiss?: () => void; onRetry?: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.notice, { backgroundColor: colors.dangerFill }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={[styles.noticeRow, { flexDirection: dir.row }]}>
        <Icon name="alert" size={18} color={colors.danger} />
        <View style={styles.noticeWords}>
          {title ? <Text style={[styles.noticeTitle, dir.text, { color: colors.danger }]}>{title}</Text> : null}
          <Text style={[styles.noticeText, dir.text, { color: colors.danger }]}>{text}</Text>
        </View>
        {onDismiss ? (
          <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {onRetry ? <ClayButton label={t('common.retry')} onPress={onRetry} /> : null}
    </View>
  );
}

function QuestRow({ quest, busy, onClaim }: { quest: QuestView; busy: boolean; onClaim: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const state = claimState(quest);
  const reward = rewardLabel(quest.reward);
  return (
    <View style={[styles.card, { backgroundColor: colors.controlTrack }]}>
      <View style={styles.rowTop}>
        <Text style={[styles.questTitle, { color: colors.textPrimary }]}>{questTitle(quest, t)}</Text>
        {reward ? <Text style={[styles.reward, { color: colors.textSecondary }]}>{reward}</Text> : null}
      </View>
      <View style={[styles.track, { backgroundColor: colors.glassBorder }]}>
        <View style={[styles.fill, { width: `${Math.round(progressPct(quest) * 100)}%`, backgroundColor: colors.primary }]} />
      </View>
      <View style={styles.rowBottom}>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {quest.current} / {quest.target}
        </Text>
        {state === 'claimed' ? (
          <Text style={[styles.claimed, { color: colors.success }]}>✓ {t('events.claimed')}</Text>
        ) : state === 'claimable' ? (
          <PressableScale
            onPress={onClaim}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            style={[styles.claimBtn, { backgroundColor: colors.primary }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={[styles.claimText, { color: colors.textOnPrimary }]}>{t('events.claim')}</Text>
            )}
          </PressableScale>
        ) : (
          <Text style={[styles.locked, { color: colors.textSecondary }]}>{t('events.inProgress')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.lg, paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, paddingBottom: spacing.xl },
  notice: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.sm },
  noticeRow: { alignItems: 'flex-start', gap: spacing.sm },
  noticeWords: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  noticeText: { fontSize: typography.sizes.sm, lineHeight: 20 },
  eventBlock: { gap: spacing.sm },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textTransform: 'uppercase' },
  countdown: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  questTitle: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  reward: { fontSize: typography.sizes.sm },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radii.pill },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontSize: typography.sizes.sm },
  claimBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radii.md, minWidth: 80, alignItems: 'center' },
  claimText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  claimed: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  locked: { fontSize: typography.sizes.sm },
});
