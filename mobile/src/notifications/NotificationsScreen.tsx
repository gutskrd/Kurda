import { useCallback, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { Toggle } from '../theme/Toggle';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { isMaintenance } from '../api/errors';
import { haptic } from '../feedback/haptics';
import { SendErrorNotice } from '../reports/SendError';
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

  /**
   * Send a change, having already moved the control.
   *
   * Optimistic because a switch that waits for a round trip before moving
   * reads as one that did not register. What the changed settings were is
   * kept, so a refusal puts them back — only those, so a second switch moved
   * meanwhile keeps its own answer — rather than leave the screen claiming a
   * setting the server does not have; and the reason is said above the list,
   * as the website says it.
   */
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const save = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      if (!prefs) return;
      const before = Object.fromEntries(Object.keys(patch).map((key) => [key, prefs[key as keyof NotificationPrefs]])) as Partial<NotificationPrefs>;
      setSaveError(null);
      setPrefs((p) => (p ? { ...p, ...patch } : p));
      void client.put<NotificationPrefs>('/me/notification-prefs', patch).then((res) => {
        if (res.ok) return;
        setPrefs((p) => (p ? { ...p, ...before } : p));
        // Hevalo offline for a while is said by the screen over the app; the switch still goes back
        if (isMaintenance(res.error)) return;
        haptic('error');
        setSaveError(res.error);
      });
    },
    [client, prefs],
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
          <SendErrorNotice error={saveError} onDismiss={() => setSaveError(null)} style={styles.notice} />
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
                  earlier={t('notifications.quietFromEarlier')}
                  later={t('notifications.quietFromLater')}
                  minute={prefs.quietStartMin!}
                  onStep={(dir) => save({ quietStartMin: stepMinute(prefs.quietStartMin!, dir) })}
                />
                <TimeRow
                  label={t('notifications.quietTo')}
                  earlier={t('notifications.quietToEarlier')}
                  later={t('notifications.quietToLater')}
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

/**
 * A time in quiet hours, with a step either side. The steps are named for
 * what they do ("start half an hour earlier"), since "−" and "+" read aloud
 * say nothing; `stepMinute` moves by the half hour they name.
 */
function TimeRow({ label, earlier, later, minute, onStep }: { label: string; earlier: string; later: string; minute: number; onStep: (dir: 1 | -1) => void }) {
  const { colors } = useTheme();
  return (
    <SettingsRow
      title={label}
      trailing={
        <View style={styles.stepper}>
          <PressableScale
            onPress={() => onStep(-1)}
            style={[styles.stepBtn, { backgroundColor: colors.controlTrack }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={earlier}
          >
            <Text style={[styles.stepText, { color: colors.textPrimary }]}>−</Text>
          </PressableScale>
          <Text style={[styles.time, { color: colors.textPrimary }]}>{formatMinute(minute)}</Text>
          <PressableScale
            onPress={() => onStep(1)}
            style={[styles.stepBtn, { backgroundColor: colors.controlTrack }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={later}
          >
            <Text style={[styles.stepText, { color: colors.textPrimary }]}>+</Text>
          </PressableScale>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  notice: { marginHorizontal: layout.gutter, marginTop: spacing.md, marginBottom: 0 },
  sectionSkeleton: { marginTop: spacing.lg, marginBottom: spacing.sm, marginHorizontal: layout.gutter },
  flex: { flex: 1 },
  unseen: { opacity: 0 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: layout.gutter },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  time: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, minWidth: 56, textAlign: 'center' },
});
