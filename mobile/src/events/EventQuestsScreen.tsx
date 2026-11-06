import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { describeError, describeErrorOr, isMaintenance } from '../api/errors';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { usePullRefresh } from '../net/usePullRefresh';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { useI18n } from '../i18n/I18nContext';
import { formatCountdown, formatNumber, remainingUntil } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { timing } from '../theme/animate';
import { ConfettiBurst } from '../theme/CelebrationParts';
import { duration } from '../theme/motion';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { EmptyState } from '../theme/EmptyState';
import {
  claimState,
  progressPct,
  questTitle,
  rewardParts,
  rewardSpoken,
  sortQuests,
  type EventQuestsView,
  type QuestView,
} from './quests.js';

interface ActiveEvent {
  key: string;
  name: string;
}

/**
 * Event quests progress + explicit claim buttons (KUR-091). A reward is drawn
 * with the app's own coin and gem, and a claim that goes through is felt and
 * heard as a reward is everywhere else (`haptic('celebrate')`, the reward
 * chime), with a few sparks off the quest — a chest's moment, made small.
 */
export function EventQuestsScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [events, setEvents] = useState<EventQuestsView[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  // the quest claimed just now, whose row throws its sparks once
  const [justClaimed, setJustClaimed] = useState<string | null>(null);
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
  // pulled down, the events and their quests are read again
  const pull = usePullRefresh(load);

  const claim = useCallback(
    async (eventKey: string, quest: QuestView) => {
      setClaiming(quest.id);
      setClaimError(null);
      const res = await client.post(`/events/${eventKey}/quests/${quest.id}/claim`);
      setClaiming(null);
      if (res.ok) {
        haptic('celebrate');
        playSound('reward');
        setJustClaimed(quest.id);
      }
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
          <ScrollView contentContainerStyle={styles.content} refreshControl={pull}>
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
                      fresh={justClaimed === q.id}
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

function QuestRow({ quest, busy, fresh, onClaim }: { quest: QuestView; busy: boolean; fresh: boolean; onClaim: () => void }) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const state = claimState(quest);
  const parts = rewardParts(quest.reward);
  return (
    <View style={[styles.card, { backgroundColor: colors.controlTrack }]}>
      <View style={styles.rowTop}>
        <Text style={[styles.questTitle, { color: colors.textPrimary }]}>{questTitle(quest, t)}</Text>
        {parts.length > 0 ? (
          // the shop's coin and gem, read out as what the quest pays
          <View style={styles.reward} accessible accessibilityLabel={rewardSpoken(quest.reward, t, (n) => formatNumber(n, locale))}>
            {parts.map((p) => (
              <View key={p.currency} style={styles.rewardPart}>
                <Icon name={p.currency === 'zer' ? 'coin' : 'gem'} size={16} color={p.currency === 'zer' ? colors.gold : colors.accent} />
                <Text style={[styles.rewardText, { color: colors.textSecondary }]}>{formatNumber(p.amount, locale)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.track, { backgroundColor: colors.glassBorder }]}>
        <View style={[styles.fill, { width: `${Math.round(progressPct(quest) * 100)}%`, backgroundColor: colors.primary }]} />
      </View>
      <View style={styles.rowBottom}>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {quest.current} / {quest.target}
        </Text>
        {state === 'claimed' ? (
          <ClaimedMark fresh={fresh} seed={quest.target * 13 + (quest.reward.zer ?? 0) + (quest.reward.gems ?? 0)} />
        ) : state === 'claimable' ? (
          // the app's own button, a fingertip tall; a spinner in place of the word while the claim is out
          <ClayButton label={t('events.claim')} tone="primary" busy={busy} onPress={onClaim} style={styles.claimBtn} />
        ) : (
          <Text style={[styles.locked, { color: colors.textSecondary }]}>{t('events.inProgress')}</Text>
        )}
      </View>
    </View>
  );
}

/**
 * "Claimed", with a few gold sparks off it when the claim was made just now —
 * the sparks a daily quest throws as it finishes (QuestRows), once. Under
 * Reduce Motion there are none; the buzz and the chime still say it.
 */
function ClaimedMark({ fresh, seed }: { fresh: boolean; seed: number }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const sparks = useRef(new Animated.Value(0)).current;
  const burst = fresh && !reduce;
  useEffect(() => {
    if (!burst) return;
    const run = timing(sparks, 1, duration.celebrate);
    run.start();
    return () => run.stop();
  }, [burst, sparks]);
  return (
    <View style={styles.claimedWrap}>
      {burst ? <ConfettiBurst progress={sparks} count={8} seed={seed} colours={[colors.gold, '#FFE16A', '#FFBD1F']} reach={44} testID="event-claim-sparks" /> : null}
      <Text style={[styles.claimed, { color: colors.success }]}>✓ {t('events.claimed')}</Text>
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
  reward: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rewardPart: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radii.pill },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontSize: typography.sizes.sm },
  claimBtn: { minWidth: 96 },
  claimedWrap: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', alignItems: 'center' },
  claimed: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  locked: { fontSize: typography.sizes.sm },
});
