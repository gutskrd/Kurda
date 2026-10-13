import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeclineReason, IncomingInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { acceptInvite, declineInvite, listInvites } from './api';
import { applyInviteEvent, liveInvites, nextExpiry } from './invites';
import { GAME_NAME_KEY, summaryParts } from './labels';
import { lobbyRoute } from './routes';

/**
 * "Rojda invited you to Wordle Battle · Hard" — [Join] [Not now ▾] (contract
 * §B1), above whatever screen you are on.
 *
 * It does not take the screen reader's focus and does not go away by itself
 * while the invite stands: it stays until it is answered (here, on another
 * device, or by the host taking it back) or runs out. A short-lived toast
 * would be gone before somebody using a screen reader, or simply busy, got
 * to it. On Android it is a polite live region; iOS is told once when an
 * invite arrives.
 *
 * "Not now" offers the two preset reasons and nothing typed: the host only
 * ever hears "can't play right now" or "would rather play something else".
 */
export function InviteBanner(): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  const [reasons, setReasons] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);
  const announced = useRef<string | null>(null);

  const load = useCallback(() => {
    void listInvites(client).then((res) => {
      if (res.ok) setInvites(res.data.incoming);
    });
  }, [client]);
  useEffect(load, [load]);
  useRealtimeReconnect(load);

  useUserEvents(
    useCallback((ev) => {
      if (ev.type === 'play_invite' || ev.type === 'play_invite_update') setInvites((list) => applyInviteEvent(list, ev));
    }, []),
  );

  const now = Date.now();
  const shown = liveInvites(invites, now);
  const invite = shown[0] ?? null;

  // drop an invite when it runs out, without anybody asking the server
  const wait = nextExpiry(shown, now);
  useEffect(() => {
    if (wait === null) return;
    const id = setTimeout(() => setTick((n) => n + 1), wait + 50);
    return () => clearTimeout(id);
  }, [wait]);

  useEffect(() => {
    setReasons(false);
    setFailed(false);
  }, [invite?.id]);

  const game = invite ? t(GAME_NAME_KEY[invite.game]) : '';
  const headline = invite
    ? invite.rematch
      ? t('play.banner.rematch', { name: invite.from.name, game })
      : t('play.banner.invited', { name: invite.from.name, game })
    : '';

  useEffect(() => {
    if (!invite || announced.current === invite.id) return;
    announced.current = invite.id;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(headline);
  }, [invite, headline]);

  if (!invite) return null;
  const details = summaryParts(invite.summary, t).join(' · ');

  const join = async (): Promise<void> => {
    setBusy(true);
    const res = await acceptInvite(client, invite.id);
    setBusy(false);
    if (!res.ok) {
      setFailed(true);
      setTimeout(() => setInvites((list) => list.filter((i) => i.id !== invite.id)), 4_000);
      return;
    }
    setInvites((list) => list.filter((i) => i.id !== invite.id));
    const route = lobbyRoute(res.data.game, res.data.lobbyId);
    navigation.navigate(route.name, route.params as never);
  };

  const decline = (reason: DeclineReason): void => {
    setInvites((list) => list.filter((i) => i.id !== invite.id));
    void declineInvite(client, invite.id, reason);
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <View
        style={[styles.banner, { backgroundColor: colors.background, shadowColor: colors.softShadow }]}
        accessibilityLiveRegion="polite"
      >
        {/* a shadow does not show on a near-black screen: there the banner is lifted by a lighter fill */}
        <View style={[styles.inner, scheme === 'dark' ? { backgroundColor: colors.controlTrack } : null]}>
          <View style={styles.head}>
            <InitialsAvatar name={invite.from.name} id={invite.from.name} size={40} photoUrl={invite.from.avatarUrl} />
            <View style={styles.text}>
              <Text style={[styles.headline, { color: colors.textPrimary }]}>{headline}</Text>
              {details ? (
                <Text style={[styles.details, { color: colors.textSecondary }]} numberOfLines={2}>
                  {details}
                </Text>
              ) : null}
            </View>
          </View>
          {failed ? (
            <Text style={[styles.details, { color: colors.danger }]}>{t('play.banner.failed')}</Text>
          ) : reasons ? (
            <View style={styles.actions}>
              <Pressable onPress={() => decline('later')} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.controlTrack }]}>
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.later')}</Text>
              </Pressable>
              <Pressable onPress={() => decline('not_this_game')} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.controlTrack }]}>
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.notThisGame')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable
                onPress={() => void join()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('play.banner.joinLabel', { name: invite.from.name })}
                accessibilityState={{ busy }}
                style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{t('play.banner.join')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setReasons(true)}
                accessibilityRole="button"
                accessibilityState={{ expanded: false }}
                style={[styles.button, { backgroundColor: colors.controlTrack }]}
              >
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.notNow')}</Text>
                <Icon name="chevron-down" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          {shown.length > 1 ? (
            <Text style={[styles.more, { color: colors.textSecondary }]}>{t('play.banner.more', { count: shown.length - 1 })}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 50 },
  banner: {
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  inner: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  headline: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  details: { fontSize: typography.sizes.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  button: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  more: { fontSize: typography.sizes.xs, textAlign: 'center' },
});
