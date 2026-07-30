import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, typography } from '../theme/tokens';
import {
  CATEGORY_LABEL,
  NOTIFICATION_CATEGORIES,
  formatMinute,
  quietEnabled,
  stepMinute,
  type NotificationCategory,
  type NotificationPrefs,
} from './prefs.js';

const DEFAULT_QUIET = { start: 22 * 60, end: 7 * 60 };

/** Per-category notification toggles + quiet hours (KUR-095). */
export function NotificationsScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  const load = useCallback(() => {
    void client.get<NotificationPrefs>('/me/notification-prefs').then((res) => {
      if (res.ok) setPrefs(res.data);
    });
  }, [client]);

  useFocusEffect(useCallback(() => load(), [load]));

  const save = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setPrefs((p) => (p ? { ...p, ...patch } : p));
      void client.put('/me/notification-prefs', patch);
    },
    [client],
  );

  if (!prefs) {
    return (
      <View style={styles.screen}>
        <Header onExit={onExit} />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const quiet = quietEnabled(prefs);

  return (
    <View style={styles.screen}>
      <Header onExit={onExit} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>Categories</Text>
        {NOTIFICATION_CATEGORIES.map((cat: NotificationCategory) => (
          <View key={cat} style={styles.row}>
            <Text style={styles.label}>{CATEGORY_LABEL[cat]}</Text>
            <Switch
              value={prefs[cat]}
              onValueChange={(on) => save({ [cat]: on } as Partial<NotificationPrefs>)}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ))}

        <Text style={styles.section}>Quiet hours</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Enable quiet hours</Text>
          <Switch
            value={quiet}
            onValueChange={(on) =>
              save(on ? { quietStartMin: DEFAULT_QUIET.start, quietEndMin: DEFAULT_QUIET.end } : { quietStartMin: null, quietEndMin: null })
            }
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        {quiet ? (
          <>
            <TimeRow
              label="From"
              minute={prefs.quietStartMin!}
              onStep={(dir) => save({ quietStartMin: stepMinute(prefs.quietStartMin!, dir) })}
            />
            <TimeRow
              label="To"
              minute={prefs.quietEndMin!}
              onStep={(dir) => save({ quietEndMin: stepMinute(prefs.quietEndMin!, dir) })}
            />
            <Text style={styles.hint}>No notifications are sent during this window.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TimeRow({ label, minute, onStep }: { label: string; minute: number; onStep: (dir: 1 | -1) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onStep(-1)} style={styles.stepBtn} hitSlop={8}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.time}>{formatMinute(minute)}</Text>
        <Pressable onPress={() => onStep(1)} style={styles.stepBtn} hitSlop={8}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({ onExit }: { onExit: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onExit} hitSlop={10}>
        <Text style={styles.close}>‹ Back</Text>
      </Pressable>
      <Text style={styles.heading}>🔔 Notifications</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.md },
  close: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  heading: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary },
  content: { gap: spacing.xs, paddingBottom: spacing.xl },
  section: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.textSecondary, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  label: { fontSize: typography.sizes.md, color: colors.textPrimary, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 32, height: 32, borderRadius: radii.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.textOnPrimary, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  time: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary, minWidth: 56, textAlign: 'center' },
  hint: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm },
});
