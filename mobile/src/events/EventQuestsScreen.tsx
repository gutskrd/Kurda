import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { formatCountdown, remainingUntil } from '../i18n/format';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
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
  const topInset = useScreenTopInset();
  const [events, setEvents] = useState<EventQuestsView[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // tick so the ends-in countdown stays live while the screen is open
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const active = await client.get<{ events: ActiveEvent[] }>('/events/active');
    if (!active.ok) {
      setError(active.error);
      return;
    }
    const views = await Promise.all(
      active.data.events.map((e) => client.get<EventQuestsView>(`/events/${e.key}/quests`)),
    );
    setEvents(views.filter((v) => v.ok).map((v) => (v as { data: EventQuestsView }).data));
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
      await client.post(`/events/${eventKey}/quests/${quest.id}/claim`);
      setClaiming(null);
      await load();
    },
    [client, load],
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: topInset }]}>
          <Pressable onPress={onExit} hitSlop={10}>
            <Text style={[styles.close, { color: colors.primary }]}>‹ {t('common.back')}</Text>
          </Pressable>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>{t('events.title')}</Text>
        </View>

        <AsyncBoundary loading={events === null} error={events === null ? error : null} isEmpty={events?.length === 0} onRetry={() => void load()} emptyText={t('events.none')}>
          {() => events == null ? null : (
          <ScrollView contentContainerStyle={styles.content}>
            {events.map((event) => {
              const countdown = formatCountdown(remainingUntil(event.endsAt, now));
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

function QuestRow({ quest, busy, onClaim }: { quest: QuestView; busy: boolean; onClaim: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const state = claimState(quest);
  const reward = rewardLabel(quest.reward);
  return (
    <View style={[styles.card, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
      <View style={styles.rowTop}>
        <Text style={[styles.questTitle, { color: colors.textPrimary }]}>{questTitle(quest)}</Text>
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
          <Pressable onPress={onClaim} disabled={busy} style={[styles.claimBtn, { backgroundColor: colors.primary }]}>
            {busy ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={[styles.claimText, { color: colors.textOnPrimary }]}>{t('events.claim')}</Text>
            )}
          </Pressable>
        ) : (
          <Text style={[styles.locked, { color: colors.textSecondary }]}>{t('events.inProgress')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.md },
  close: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  heading: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { textAlign: 'center', paddingHorizontal: spacing.lg },
  eventBlock: { gap: spacing.sm },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textTransform: 'uppercase' },
  countdown: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.sm },
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
