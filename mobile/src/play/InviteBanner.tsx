import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeclineReason, IncomingInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { TAB_BAR_HEIGHT } from '../navigation/tabBarLayout';
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
import { RatedPill } from '../ranks/Rated';
import { useInvitesQuieted } from './quietInvites';
import { lobbyRoute } from './routes';

/**
 * "Rojda invited you to Wordle Battle · Hard" — [Join] [Not now ▾] (contract
 * §B1), over whatever screen you are on.
 *
 * It does not take the screen reader's focus and does not go away by itself
 * while the invite stands: it stays until it is answered (here, on another
 * device, or by the host taking it back) or runs out. A short-lived toast
 * would be gone before somebody using a screen reader, or simply busy, got
 * to it. On Android it is a polite live region; iOS is told once when an
 * invite arrives.
 *
 * Standing that long, it must never be in the way. It sits low (above the
 * tab bar where there is one), no wider than a phone, so the header's Back,
 * title and buttons stay free; "Hide"
 * folds it into a small pill that opens it again (hiding is not an answer,
 * the host hears nothing); and while a game is being played it keeps out of
 * sight altogether and comes back when the game is over.
 *
 * "Not now" offers the two preset reasons and nothing typed: the host only
 * ever hears "can't play right now" or "would rather play something else".
 */
export function InviteBanner(): React.JSX.Element | null {
  const { client } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const onTabs = useOnTabs();
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  const quiet = useInvitesQuieted();
  const [, setTick] = useState(0);
  const announced = useRef<string | null>(null);
  /*
   * Invites answered (or found dead) on this phone. A list fetched before the
   * answer reached the server can still carry them — load runs again on every
   * reconnect, which is just when somebody taps Join or Not now — and must
   * not put them back.
   */
  const answered = useRef(new Set<string>());

  const load = useCallback(() => {
    void listInvites(client).then((res) => {
      if (res.ok) setInvites(res.data.incoming.filter((i) => !answered.current.has(i.id)));
    });
  }, [client]);
  useEffect(load, [load]);
  useRealtimeReconnect(load);

  useUserEvents(
    useCallback((ev) => {
      if (ev.type === 'play_invite' || ev.type === 'play_invite_update') setInvites((list) => applyInviteEvent(list, ev));
    }, []),
  );

  const remove = useCallback((id: string) => {
    answered.current.add(id);
    setInvites((list) => list.filter((i) => i.id !== id));
  }, []);

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

  const game = invite ? t(GAME_NAME_KEY[invite.game]) : '';
  const headline = invite
    ? invite.rematch
      ? t('play.banner.rematch', { name: invite.from.name, game })
      : t('play.banner.invited', { name: invite.from.name, game })
    : '';

  // told once, and not in the middle of somebody's game: then when it is over
  useEffect(() => {
    if (!invite || quiet || announced.current === invite.id) return;
    announced.current = invite.id;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(headline);
  }, [invite, headline, quiet]);

  if (!invite || quiet) return null;
  /*
   * Low on the screen, so the header stays free: just above the tab bar on a
   * tab, and just above the bottom edge on a pushed screen, which has none.
   */
  const bottom = onTabs ? insets.bottom + TAB_BAR_HEIGHT + spacing.sm : insets.bottom + spacing.md;
  // keyed by the invite: a new invite at the front starts open, whatever was done with the last one
  return <InviteCard key={invite.id} invite={invite} headline={headline} count={shown.length} bottom={bottom} onGone={remove} />;
}

interface RootStateSource {
  getRootState?: () => { index?: number; routes?: Array<{ name: string }> } | undefined;
  addListener?: (event: 'state', listener: () => void) => () => void;
}

/**
 * Whether the screen in front is one of the tabs, where the tab bar sits
 * under the banner. The banner is outside every navigator, so it reads the
 * root state from the navigation container rather than from a screen.
 */
function useOnTabs(): boolean {
  const navigation = useNavigation() as unknown as RootStateSource;
  const [onTabs, setOnTabs] = useState(() => rootIsTabs(navigation));
  useEffect(() => {
    setOnTabs(rootIsTabs(navigation));
    if (typeof navigation.addListener !== 'function') return;
    return navigation.addListener('state', () => setOnTabs(rootIsTabs(navigation)));
  }, [navigation]);
  return onTabs;
}

export function rootIsTabs(navigation: RootStateSource): boolean {
  const state = navigation.getRootState?.();
  // before the first screen is up, the first screen is the tabs
  if (!state?.routes?.length) return true;
  return state.routes[state.index ?? 0]?.name === 'Tabs';
}

function InviteCard({
  invite,
  headline,
  count,
  bottom,
  onGone,
}: {
  invite: IncomingInvite;
  headline: string;
  count: number;
  bottom: number;
  onGone: (id: string) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { t, rtl } = useI18n();
  /*
   * The interface's direction, set rather than guessed: "Azad invited you to …"
   * in Soranî starts with a Latin name, and a guess from its first letter
   * would set the headline left-to-right under a right-to-left line of details.
   */
  const dir = rtl ? styles.rtl : styles.ltr;
  const [reasons, setReasons] = useState(false);
  const [busy, setBusy] = useState(false);
  /** why Join did not work: the game is gone (the invite goes too), or a passing failure to try again */
  const [failure, setFailure] = useState<{ dead: boolean; message: string } | null>(null);
  const [hidden, setHidden] = useState(false);
  const laterRef = useRef<View>(null);

  // an invite whose game is gone stays long enough to be read, then goes
  const dead = failure?.dead ?? false;
  useEffect(() => {
    if (!dead) return;
    const id = setTimeout(() => onGone(invite.id), 4_000);
    return () => clearTimeout(id);
  }, [dead, invite.id, onGone]);

  // "Not now" opened the reasons: the screen reader goes to the first of them
  useEffect(() => {
    if (!reasons || Platform.OS === 'web') return;
    const id = setTimeout(() => {
      const handle = laterRef.current ? findNodeHandle(laterRef.current) : null;
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 150);
    return () => clearTimeout(id);
  }, [reasons]);

  const details = summaryParts(invite.summary, t).join(' · ');

  const join = async (): Promise<void> => {
    setBusy(true);
    setFailure(null);
    const res = await acceptInvite(client, invite.id);
    setBusy(false);
    if (!res.ok) {
      setFailure(joinFailure(res.error, t));
      return;
    }
    onGone(invite.id);
    const route = lobbyRoute(res.data.game, res.data.lobbyId);
    navigation.navigate(route.name, route.params as never);
  };

  const decline = (reason: DeclineReason): void => {
    onGone(invite.id);
    void declineInvite(client, invite.id, reason);
  };

  const lifted = scheme === 'dark' ? { backgroundColor: colors.controlTrack } : null;

  if (hidden) {
    return (
      <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
        <View pointerEvents="box-none" style={[styles.column, styles.pillColumn]}>
          <Pressable
            onPress={() => setHidden(false)}
            accessibilityRole="button"
            accessibilityLabel={headline}
            accessibilityHint={t('play.banner.show')}
            style={[styles.pill, styles.lift, { backgroundColor: colors.background, shadowColor: colors.softShadow }]}
          >
            <View style={[styles.pillInner, lifted]}>
              <InitialsAvatar name={invite.from.name} id={invite.from.name} size={28} photoUrl={invite.from.avatarUrl} />
              <Text style={[styles.pillText, { color: colors.textPrimary }, dir]} numberOfLines={1}>
                {count > 1 ? t('play.banner.pillMany', { count }) : t('play.banner.pill')}
              </Text>
              <Icon name="chevron-down" size={14} color={colors.textSecondary} style={styles.up} />
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        style={[styles.column, styles.banner, styles.lift, { backgroundColor: colors.background, shadowColor: colors.softShadow }]}
        accessibilityLiveRegion="polite"
      >
        {/* a shadow does not show on a near-black screen: there the banner is lifted by a lighter fill */}
        <View style={[styles.inner, lifted]}>
          <View style={styles.head}>
            <InitialsAvatar name={invite.from.name} id={invite.from.name} size={40} photoUrl={invite.from.avatarUrl} />
            <View style={styles.text}>
              <Text style={[styles.headline, { color: colors.textPrimary }, dir]}>{headline}</Text>
              {details ? (
                <Text style={[styles.details, { color: colors.textSecondary }, dir]} numberOfLines={2}>
                  {details}
                </Text>
              ) : null}
              {/* Rated or Friendly, before you say yes */}
              {invite.summary.rated !== undefined ? <RatedPill rated={invite.summary.rated} small /> : null}
            </View>
            {/* folds it away without answering: the host hears nothing */}
            <Pressable onPress={() => setHidden(true)} accessibilityRole="button" accessibilityLabel={t('play.banner.hide')} style={styles.hide}>
              <Icon name="chevron-down" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {failure?.dead ? (
            <Text style={[styles.details, { color: colors.danger }, dir]}>{failure.message}</Text>
          ) : (
            <>
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
                {/* opens the two reasons under it and closes them again; Join stays where it was */}
                <Pressable
                  onPress={() => setReasons((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: reasons }}
                  style={[styles.button, { backgroundColor: colors.controlTrack }]}
                >
                  <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.notNow')}</Text>
                  <Icon name="chevron-down" size={14} color={colors.textSecondary} style={reasons ? styles.up : undefined} />
                </Pressable>
              </View>
              {reasons ? (
                <View style={styles.actions}>
                  <Pressable
                    ref={laterRef}
                    onPress={() => decline('later')}
                    accessibilityRole="button"
                    style={[styles.button, styles.reason, { borderColor: colors.separator }]}
                  >
                    <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.later')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => decline('not_this_game')}
                    accessibilityRole="button"
                    style={[styles.button, styles.reason, { borderColor: colors.separator }]}
                  >
                    <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.notThisGame')}</Text>
                  </Pressable>
                </View>
              ) : null}
              {failure ? (
                <Text style={[styles.details, { color: colors.danger }, dir]} accessibilityLiveRegion="polite">
                  {failure.message}
                </Text>
              ) : null}
            </>
          )}
          {count > 1 ? <Text style={[styles.more, { color: colors.textSecondary }]}>{t('play.banner.more', { count: count - 1 })}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/**
 * What a failed Join means. A game that has started, filled up or gone (404,
 * or 409 with the invite closed) cannot be joined from this invite any more,
 * so that is said and the invite goes. Anything else — no network, a
 * timeout, the server busy, a rate limit — passes: the invite still stands,
 * and Join is there to try again.
 */
export function joinFailure(error: ApiError, t: Translate): { dead: boolean; message: string } {
  if (error.status === 404 || error.status === 409) return { dead: true, message: t('play.banner.failed') };
  return { dead: false, message: describeError(error, t) };
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 50, alignItems: 'center' },
  // a phone's width at most: on a tablet or the web a full-width banner reads as broken
  column: { width: '100%', maxWidth: 520 },
  // the pill keeps to the end of that column, clear of whatever is in the middle
  pillColumn: { alignItems: 'flex-end' },
  lift: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  banner: { borderRadius: radii.lg },
  pill: { borderRadius: radii.pill, maxWidth: '100%' },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingStart: spacing.sm,
    paddingEnd: spacing.md,
  },
  pillText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, flexShrink: 1 },
  up: { transform: [{ rotate: '180deg' }] },
  hide: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginEnd: -spacing.sm },
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
  reason: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
  buttonText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  more: { fontSize: typography.sizes.xs, textAlign: 'center' },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
});
