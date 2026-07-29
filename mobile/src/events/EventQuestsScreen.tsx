import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { formatCountdown, remainingUntil } from '../i18n/format';
import { colors, radii, spacing, typography } from '../theme/tokens';
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
  const [events, setEvents] = useState<EventQuestsView[] | null>(null);
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
      setEvents([]);
      return;
    }
    const views = await Promise.all(
      active.data.events.map((e) => client.get<EventQuestsView>(`/events/${e.key}/quests`)),
    );
    setEvents(views.filter((v) => v.ok).map((v) => (v as { data: EventQuestsView }).data));
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
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={10}>
          <Text style={styles.close}>‹ {t('common.back')}</Text>
        </Pressable>
        <Text style={styles.heading}>🎉 {t('events.title')}</Text>
      </View>

      {events === null ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : events.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.dim}>{t('events.none')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {events.map((event) => {
            const countdown = formatCountdown(remainingUntil(event.endsAt, now));
            return (
              <View key={event.eventKey} style={styles.eventBlock}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventName}>{event.name}</Text>
                  {countdown ? <Text style={styles.countdown}>{t('events.endsIn', { time: countdown })}</Text> : null}
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
    </View>
  );
}

function QuestRow({ quest, busy, onClaim }: { quest: QuestView; busy: boolean; onClaim: () => void }) {
  const { t } = useI18n();
  const state = claimState(quest);
  const reward = rewardLabel(quest.reward);
  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <Text style={styles.questTitle}>{questTitle(quest)}</Text>
        {reward ? <Text style={styles.reward}>{reward}</Text> : null}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progressPct(quest) * 100)}%` }]} />
      </View>
      <View style={styles.rowBottom}>
        <Text style={styles.count}>
          {quest.current} / {quest.target}
        </Text>
        {state === 'claimed' ? (
          <Text style={styles.claimed}>✓ {t('events.claimed')}</Text>
        ) : state === 'claimable' ? (
          <Pressable onPress={onClaim} disabled={busy} style={styles.claimBtn}>
            {busy ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.claimText}>{t('events.claim')}</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.locked}>{t('events.inProgress')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.md },
  close: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  heading: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.lg },
  eventBlock: { gap: spacing.sm },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textSecondary, textTransform: 'uppercase' },
  countdown: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.bold },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  questTitle: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  reward: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  track: { height: 8, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radii.pill, backgroundColor: colors.primary },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  claimBtn: { backgroundColor: colors.primary, paddingVertical: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radii.md, minWidth: 80, alignItems: 'center' },
  claimText: { color: colors.textOnPrimary, fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  claimed: { color: colors.success, fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  locked: { color: colors.textSecondary, fontSize: typography.sizes.sm },
});
