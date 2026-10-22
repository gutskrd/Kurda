import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ClayButton, GradientBackground } from '../theme/glass';
import { EmptyState } from '../theme/EmptyState';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { useI18n } from '../i18n/I18nContext';
import { haptic, refreshFelt } from '../feedback/haptics';
import {
  deviceIcon,
  lastActive,
  listSessions,
  orderSessions,
  sessionsEnded,
  signOutOtherSessions,
  signOutSession,
  type DeviceSession,
} from './api';

/**
 * The measurements a device row and its placeholder share, so the grey rows
 * that hold the place are the rows that arrive: a 44pt sign-out button is the
 * tallest thing in a row, and the two lines of text beside it are 22 and 20.
 */
const ROW = {
  padV: spacing.sm + 2,
  padH: spacing.md - 4,
  tile: 40,
  gap: spacing.md - 4,
  nameLine: 22,
  metaLine: 20,
  rowGap: spacing.sm,
} as const;
const ROW_HEIGHT = ROW.padV * 2 + Math.max(MIN_TOUCH_TARGET, ROW.nameLine + ROW.metaLine);

/**
 * The devices signed in to your account (GET /me/sessions), and signing them
 * out: one at a time, or every one but this.
 *
 * This device comes first and says so. Each of the others says when it was
 * last used, so an old tablet in a drawer reads as one, and one you do not
 * recognise stands out. Signing out this device from here is signing out.
 */
export function DevicesScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, logout } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const bottom = useScreenBottomInset(spacing.lg);

  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // the session being signed out, or 'others'
  const [busy, setBusy] = useState<string | null>(null);
  // what the last sign-out did, said above the list
  const [notice, setNotice] = useState<{ text: string; tone: 'done' | 'failed' } | null>(null);

  const load = useCallback(async () => {
    const res = await listSessions(client);
    if (res.ok) {
      setSessions(orderSessions(res.data.sessions));
      setError(null);
    } else {
      setError(res.error);
    }
  }, [client]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const nameOf = (s: DeviceSession) => s.deviceName?.trim() || t('security.devices.unknown');

  const signOutOne = async (s: DeviceSession) => {
    setBusy(s.id);
    setNotice(null);
    const res = await signOutSession(client, s.id);
    setBusy(null);
    if (res.ok) {
      haptic('tap');
      // this phone's own session has just ended: the tokens here are spent
      if (res.data.current) {
        void logout();
        return;
      }
      setSessions((list) => list?.filter((x) => x.id !== s.id) ?? list);
      return;
    }
    if (res.error.code === 'SESSION_NOT_FOUND') {
      // gone already, from somewhere else: the row goes, and the reason is said
      setSessions((list) => list?.filter((x) => x.id !== s.id) ?? list);
      setNotice({ text: describeError(res.error, t), tone: 'done' });
      return;
    }
    haptic('error');
    setNotice({ text: describeError(res.error, t), tone: 'failed' });
  };

  const signOutOthers = async () => {
    setBusy('others');
    setNotice(null);
    const res = await signOutOtherSessions(client);
    setBusy(null);
    if (!res.ok) {
      haptic('error');
      setNotice({ text: describeError(res.error, t), tone: 'failed' });
      return;
    }
    haptic('tap');
    setNotice({ text: sessionsEnded(res.data.sessionsEnded, t), tone: 'done' });
    await load();
  };

  const confirmOne = (s: DeviceSession) => {
    Alert.alert(
      s.current ? t('security.devices.signOutThisTitle') : t('security.devices.signOutTitle', { name: nameOf(s) }),
      s.current ? '' : t('security.devices.signOutBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.sessions.signOut'), style: 'destructive', onPress: () => void signOutOne(s) },
      ],
    );
  };

  const confirmOthers = () => {
    Alert.alert(t('security.devices.signOutOthers'), t('security.devices.signOutOthersBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.sessions.signOut'), style: 'destructive', onPress: () => void signOutOthers() },
    ]);
  };

  const others = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('security.devices.heading')} onBack={onExit} />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.column, { paddingBottom: bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, dir.text, { color: colors.textSecondary }]}>{t('security.devices.intro')}</Text>
          <AsyncBoundary
            loading={sessions === null}
            error={sessions === null ? error : null}
            isEmpty={sessions?.length === 0}
            onRetry={() => void load()}
            skeleton={<DeviceListSkeleton />}
            empty={<EmptyState title={t('security.devices.empty')} />}
          >
            {() => (
              <>
                {notice ? (
                  <Text
                    style={[styles.notice, dir.text, { color: notice.tone === 'failed' ? colors.danger : colors.textPrimary }]}
                    accessibilityLiveRegion="polite"
                    testID="devices-notice"
                  >
                    {notice.text}
                  </Text>
                ) : null}
                <View style={styles.rows}>
                  {(sessions ?? []).map((s) => (
                    <DeviceRow
                      key={s.id}
                      name={nameOf(s)}
                      icon={deviceIcon(s.deviceName)}
                      meta={s.current ? t('security.devices.thisDevice') : lastActive(s.lastSeenAt, t, locale)}
                      current={s.current}
                      busy={busy === s.id}
                      onSignOut={() => confirmOne(s)}
                    />
                  ))}
                </View>
                {others > 0 ? (
                  <ClayButton
                    label={t('security.devices.signOutOthers')}
                    tone="danger"
                    variant="outline"
                    size="large"
                    busy={busy === 'others'}
                    disabled={busy !== null && busy !== 'others'}
                    onPress={confirmOthers}
                    style={styles.others}
                  />
                ) : (
                  <Text style={[dir.text, styles.only, { color: colors.textSecondary }]}>{t('security.devices.onlyThis')}</Text>
                )}
              </>
            )}
          </AsyncBoundary>
        </ScrollView>
      </View>
    </GradientBackground>
  );
}

/** One device: what it is, whether it is this one or when it was last used, and the way to sign it out. */
function DeviceRow({
  name,
  icon,
  meta,
  current,
  busy,
  onSignOut,
}: {
  name: string;
  icon: ReturnType<typeof deviceIcon>;
  meta: string;
  current: boolean;
  busy: boolean;
  onSignOut: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]} testID="device-row">
      <View style={[styles.tile, { backgroundColor: colors.selectedFill }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={icon} size={22} color={colors.textPrimary} />
      </View>
      <View style={styles.main}>
        {/* a device's name is what it called itself, so it reads in its own direction */}
        <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={2}>
          {name}
        </Text>
        <Text style={[styles.meta, dir.text, { color: current ? colors.textPrimary : colors.textSecondary }, current && styles.metaCurrent]} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      {/* the confirm that follows is where it is marked as destructive; the row stays calm */}
      <View style={styles.action}>
        {busy ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : (
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel={t('security.devices.signOutNamed', { name })}
            style={({ pressed }) => [styles.actionHit, pressed && styles.pressed]}
          >
            <Text style={[styles.actionText, { color: colors.primary }]} numberOfLines={1}>
              {t('settings.sessions.signOut')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * The list while it loads: the same rows, in grey, as many as the screen
 * holds, each bar on the line its words will take.
 */
function DeviceListSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const start = dir.row === 'row-reverse' ? 'flex-end' : 'flex-start';
  const widths = ['58%', '72%', '46%'] as const;
  return (
    <View style={styles.rows} accessibilityLabel={t('common.loading')}>
      {/* three: most accounts are signed in on a phone or two and a computer */}
      {widths.map((width, i) => (
        <View key={i} style={[styles.row, { flexDirection: dir.row }]}>
          <Skeleton width={ROW.tile} height={ROW.tile} radius={radii.pill} />
          <View style={styles.main}>
            <SkeletonText size={typography.ios.row} lineHeight={ROW.nameLine} width={width} align={start} />
            <SkeletonText size={typography.sizes.sm} lineHeight={ROW.metaLine} width="44%" align={start} />
          </View>
          <View style={styles.action}>
            <SkeletonText size={typography.sizes.sm} width={64} align="center" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // a column in the middle of a tablet, on the 16pt gutter on a phone
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter, gap: spacing.md },
  intro: { fontSize: typography.sizes.sm, lineHeight: 21 },
  notice: { fontSize: typography.sizes.sm, lineHeight: 21 },
  rows: { gap: ROW.rowGap },
  row: {
    alignItems: 'center',
    gap: ROW.gap,
    minHeight: ROW_HEIGHT,
    borderRadius: radii.md,
    paddingVertical: ROW.padV,
    paddingHorizontal: ROW.padH,
  },
  tile: { width: ROW.tile, height: ROW.tile, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: typography.ios.row, lineHeight: ROW.nameLine, fontWeight: typography.weights.semibold },
  meta: { fontSize: typography.sizes.sm, lineHeight: ROW.metaLine },
  metaCurrent: { fontWeight: typography.weights.semibold },
  action: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  actionHit: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  actionText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  pressed: { opacity: 0.6 },
  others: { marginTop: spacing.sm },
  only: { fontSize: typography.sizes.sm, lineHeight: 21, marginTop: spacing.sm, textAlign: 'center' },
});
