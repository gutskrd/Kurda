import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
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
  const { colors } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    void client.get<NotificationPrefs>('/me/notification-prefs').then((res) => {
      if (res.ok) {
        setPrefs(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
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

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <Header onExit={onExit} />
        <AsyncBoundary loading={!prefs} error={!prefs ? error : null} onRetry={load}>
          {() => {
            if (!prefs) return null;
            const quiet = quietEnabled(prefs);
            return (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.section, { color: colors.textSecondary }]}>Categories</Text>
          {NOTIFICATION_CATEGORIES.map((cat: NotificationCategory) => (
            <View key={cat} style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{CATEGORY_LABEL[cat]}</Text>
              <Switch
                value={prefs[cat]}
                onValueChange={(on) => save({ [cat]: on } as Partial<NotificationPrefs>)}
                trackColor={{ true: colors.primary, false: colors.controlTrack }}
              />
            </View>
          ))}

          <Text style={[styles.section, { color: colors.textSecondary }]}>Quiet hours</Text>
          <View style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Enable quiet hours</Text>
            <Switch
              value={quiet}
              onValueChange={(on) =>
                save(on ? { quietStartMin: DEFAULT_QUIET.start, quietEndMin: DEFAULT_QUIET.end } : { quietStartMin: null, quietEndMin: null })
              }
              trackColor={{ true: colors.primary, false: colors.controlTrack }}
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
              <Text style={[styles.hint, { color: colors.textSecondary }]}>No notifications are sent during this window.</Text>
            </>
          ) : null}
        </ScrollView>
            );
          }}
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

function TimeRow({ label, minute, onStep }: { label: string; minute: number; onStep: (dir: 1 | -1) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onStep(-1)} style={[styles.stepBtn, { backgroundColor: colors.primary }]} hitSlop={8}>
          <Text style={[styles.stepText, { color: colors.textOnPrimary }]}>−</Text>
        </Pressable>
        <Text style={[styles.time, { color: colors.textPrimary }]}>{formatMinute(minute)}</Text>
        <Pressable onPress={() => onStep(1)} style={[styles.stepBtn, { backgroundColor: colors.primary }]} hitSlop={8}>
          <Text style={[styles.stepText, { color: colors.textOnPrimary }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({ onExit }: { onExit: () => void }) {
  const { colors } = useTheme();
  const topInset = useScreenTopInset();
  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <Pressable onPress={onExit} hitSlop={10}>
        <Text style={[styles.close, { color: colors.primary }]}>‹ Back</Text>
      </Pressable>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Notifications</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.md },
  close: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  heading: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  content: { gap: spacing.xs, paddingBottom: spacing.xl },
  section: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  label: { fontSize: typography.sizes.md, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  time: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, minWidth: 56, textAlign: 'center' },
  hint: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
});
