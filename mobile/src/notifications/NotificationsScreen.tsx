import { useCallback, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Toggle } from '../theme/Toggle';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { SettingsRow, SettingsSection, SettingsSwitch } from '../settings/list';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { DevicePushControl } from '../push/DevicePushControl';
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

/** This phone's permission (KUR-094), per-category notification toggles + quiet hours (KUR-095). */
export function NotificationsScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { t } = useI18n();
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
        <ScreenHeader title={t('notifications.title')} onBack={onExit} />
        <AsyncBoundary loading={!prefs} error={!prefs ? error : null} onRetry={load} skeleton={<PrefsSkeleton />}>
          {() => {
            if (!prefs) return null;
            const quiet = quietEnabled(prefs);
            return (
        <ScrollView contentContainerStyle={styles.content}>
          {/* whether the phone lets anything through at all, before what to send */}
          <DevicePushControl />
          <SettingsSection title={t('notifications.categories')} first>
            {NOTIFICATION_CATEGORIES.map((cat: NotificationCategory) => (
              <SettingsSwitch
                key={cat}
                title={t(CATEGORY_LABEL[cat])}
                value={prefs[cat]}
                onValueChange={(on) => save({ [cat]: on } as Partial<NotificationPrefs>)}
              />
            ))}
          </SettingsSection>
          <SettingsSection title={t('notifications.quietHours')} footer={quiet ? t('notifications.quietHoursHelp') : undefined}>
            <SettingsSwitch
              icon="moon"
              title={t('notifications.enableQuietHours')}
              value={quiet}
              onValueChange={(on) =>
                save(on ? { quietStartMin: DEFAULT_QUIET.start, quietEndMin: DEFAULT_QUIET.end } : { quietStartMin: null, quietEndMin: null })
              }
            />
            {quiet ? (
              <>
                <TimeRow
                  label={t('notifications.quietFrom')}
                  minute={prefs.quietStartMin!}
                  onStep={(dir) => save({ quietStartMin: stepMinute(prefs.quietStartMin!, dir) })}
                />
                <TimeRow
                  label={t('notifications.quietTo')}
                  minute={prefs.quietEndMin!}
                  onStep={(dir) => save({ quietEndMin: stepMinute(prefs.quietEndMin!, dir) })}
                />
              </>
            ) : null}
          </SettingsSection>
        </ScrollView>
            );
          }}
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

/** The settings while they load: each kind's row with its switch, and quiet hours under them. */
function PrefsSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const row = (i: number) => (
    <View key={i} style={styles.row}>
      <SkeletonText size={typography.sizes.md} width={i % 2 ? '38%' : '52%'} raised style={styles.flex} />
      <SwitchSkeleton />
    </View>
  );
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <SkeletonText size={typography.sizes.sm} width={88} style={styles.sectionSkeleton} />
      {NOTIFICATION_CATEGORIES.map((_, i) => row(i))}
      <SkeletonText size={typography.sizes.sm} width={96} style={styles.sectionSkeleton} />
      {row(NOTIFICATION_CATEGORIES.length)}
    </View>
  );
}

/**
 * A switch's place in grey, exactly the platform's own switch's size: one is
 * drawn unseen underneath to take the room, since iOS, Android and a browser
 * each make it a different size.
 */
function SwitchSkeleton(): React.JSX.Element {
  return (
    <View>
      <View style={styles.unseen} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Toggle value={false} disabled />
      </View>
      <Skeleton width="100%" height="100%" radius={radii.pill} raised style={StyleSheet.absoluteFill} />
    </View>
  );
}

function TimeRow({ label, minute, onStep }: { label: string; minute: number; onStep: (dir: 1 | -1) => void }) {
  const { colors } = useTheme();
  return (
    <SettingsRow
      title={label}
      trailing={
        <View style={styles.stepper}>
          <Pressable onPress={() => onStep(-1)} style={[styles.stepBtn, { backgroundColor: colors.controlTrack }]} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.stepText, { color: colors.textPrimary }]}>−</Text>
          </Pressable>
          <Text style={[styles.time, { color: colors.textPrimary }]}>{formatMinute(minute)}</Text>
          <Pressable onPress={() => onStep(1)} style={[styles.stepBtn, { backgroundColor: colors.controlTrack }]} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.stepText, { color: colors.textPrimary }]}>+</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  sectionSkeleton: { marginTop: spacing.lg, marginBottom: spacing.sm, marginHorizontal: layout.gutter },
  flex: { flex: 1 },
  unseen: { opacity: 0 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: layout.gutter },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  time: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, minWidth: 56, textAlign: 'center' },
});
