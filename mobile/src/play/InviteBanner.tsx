import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, Animated, Easing, findNodeHandle, Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeclineReason, IncomingInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, isRetryable, type Translate } from '../api/errors';
import { useIntents, useSayNotSaved } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { TAB_BAR_HEIGHT, tabBarLift } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { springTo, timing } from '../theme/animate';
import { Icon } from '../theme/Icon';
import { duration } from '../theme/motion';
import { blend } from '../theme/tileTones';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useAnnouncer } from '../stories/ui';
import { acceptInvite, declineInvite, listInvites } from './api';
import { applyInviteEvent, liveInvites, nextExpiry } from './invites';
import { GAME_ICON, GAME_NAME_KEY, summaryParts } from './labels';
import { RatedPill } from '../ranks/Rated';
import { useInvitesQuieted } from './quietInvites';
import { lobbyRoute } from './routes';
import { TEAR_MS, Ticket, TicketBadge, ticketTone } from './Ticket';

/**
 * "Rojda invited you to Peyvok Battle · Hard" with Join and Not now (contract §B1), over whatever screen you are on.
 * It neither takes screen-reader focus nor times out: it stays until answered anywhere, withdrawn, or expired, since
 * a short toast would vanish before a screen-reader user reached it. Android gets a polite live region; iOS one
 * announcement on arrival.
 *
 * It sits low (above any tab bar) and no wider than a phone, so the header stays free. "Hide" folds it into a pill
 * without answering, and it hides itself during games. "Not now" offers only the two preset reasons the host hears.
 *
 * The invite is a ticket (Ticket.tsx) that swings in from below; Join tears the stub then opens the lobby, "not
 * now" folds it away, and further invites peek out behind as a fan. Under Reduce Motion nothing travels.
 */
export function InviteBanner(): React.JSX.Element | null {
  const { client, isGuest } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const onTabs = useOnTabs();
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  const quiet = useInvitesQuieted();
  const [, setTick] = useState(0);
  const announced = useRef<string | null>(null);
  /*
   * Invites answered (or found dead) on this phone. A list fetched before the answer reached the server can still
   * hold them, and load runs on every reconnect, which is exactly when people tap Join or Not now.
   */
  const answered = useRef(new Set<string>());

  const load = useCallback(() => {
    // Nobody can invite a guest, and the server refuses the request.
    if (isGuest) return;
    void listInvites(client).then((res) => {
      if (res.ok) setInvites(res.data.incoming.filter((i) => !answered.current.has(i.id)));
    });
  }, [client, isGuest]);
  useEffect(load, [load]);
  useRealtimeReconnect(load);

  useUserEvents(
    useCallback((ev) => {
      if (ev.type === 'play_invite' || ev.type === 'play_invite_update') setInvites((list) => applyInviteEvent(list, ev));
    }, []),
  );

  // Marked answered at once so a reload cannot restore it, and removed once its ticket has torn or folded away.
  const answer = useCallback((id: string) => {
    answered.current.add(id);
  }, []);
  const remove = useCallback((id: string) => {
    answered.current.add(id);
    setInvites((list) => list.filter((i) => i.id !== id));
  }, []);

  /*
   * "Not now" folds the ticket away at once and tells the host after. If it did not get through, the invite comes back
   * to be answered and why is said; one the server no longer has (withdrawn, expired) stays gone.
   */
  const say = useSayNotSaved();
  const declined = useRef(new Map<string, IncomingInvite>());
  // How often each invite has come back: a returned one is a fresh ticket, not the one still folding away.
  const [returns, setReturns] = useState<Readonly<Record<string, number>>>({});
  const declining = useIntents<string, DeclineReason | null>((id, reason) => declineInvite(client, id, reason ?? undefined), {
    failed: (error, id) => {
      const invite = declined.current.get(id);
      if (!invite || !isRetryable(error)) return;
      answered.current.delete(id);
      setReturns((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 }));
      setInvites((list) => (list.some((i) => i.id === id) ? list : [invite, ...list]));
      say(error);
    },
  });
  const decline = useCallback(
    (invite: IncomingInvite, reason: DeclineReason) => {
      declined.current.set(invite.id, invite);
      declining.want(invite.id, reason, null);
    },
    [declining],
  );

  const now = Date.now();
  const shown = liveInvites(invites, now);
  const invite = shown[0] ?? null;

  // Drop an invite when it expires, without asking the server.
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

  // Announced once, and not mid-game: then after it.
  useEffect(() => {
    if (!invite || quiet || announced.current === invite.id) return;
    announced.current = invite.id;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(headline);
  }, [invite, headline, quiet]);

  if (!invite || quiet) return null;
  // Low on the screen so the header stays free: above the tab bar on a tab, above the bottom edge on a pushed screen.
  const bottom = onTabs ? tabBarLift(insets.bottom) + TAB_BAR_HEIGHT + spacing.sm : insets.bottom + spacing.md;
  // Keyed by invite, so a new front invite starts open whatever was done with the last.
  return (
    <InviteCard
      key={`${invite.id}:${returns[invite.id] ?? 0}`}
      invite={invite}
      headline={headline}
      count={shown.length}
      behind={shown.slice(1, 3)}
      bottom={bottom}
      onAnswer={answer}
      onDecline={decline}
      onGone={remove}
    />
  );
}

interface RootStateSource {
  getRootState?: () => { index?: number; routes?: Array<{ name: string }> } | undefined;
  addListener?: (event: 'state', listener: () => void) => () => void;
}

/**
 * Whether the screen in front is a tab, where the tab bar sits under the banner. The banner is outside every
 * navigator, so it reads the root state from the navigation container.
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
  // Before the first screen is up, it will be the tabs.
  if (!state?.routes?.length) return true;
  return state.routes[state.index ?? 0]?.name === 'Tabs';
}

/** How long "not now" takes to fold the ticket away. */
const FOLD_MS = duration.base + 60;

function InviteCard({
  invite,
  headline,
  count,
  behind,
  bottom,
  onAnswer,
  onDecline,
  onGone,
}: {
  invite: IncomingInvite;
  headline: string;
  count: number;
  /** The next waiting invites, peeking out behind this one. */
  behind: IncomingInvite[];
  bottom: number;
  onAnswer: (id: string) => void;
  onDecline: (invite: IncomingInvite, reason: DeclineReason) => void;
  onGone: (id: string) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { t, rtl } = useI18n();
  const reduce = useReducedMotion();
  const { announce, region } = useAnnouncer();
  // Rows start on the line-start side, as the ticket's stub does.
  const flow = useDirection();
  const row = { flexDirection: flow.row };
  /*
   * The interface's direction, set rather than guessed: in Soranî "Azad invited you to …" starts with a Latin name,
   * and guessing from its first letter would set the headline left to right.
   */
  const dir = rtl ? styles.rtl : styles.ltr;
  const [reasons, setReasons] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Why Join failed: the game is gone (the invite goes too), or a passing failure to retry. */
  const [failure, setFailure] = useState<{ dead: boolean; message: string } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [torn, setTorn] = useState(false);
  const laterRef = useRef<View>(null);

  // Pending follow-ups once the ticket has torn or folded; none outlive it.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const after = (ms: number, then: () => void): void => {
    if (ms <= 0) then();
    else timers.current.push(setTimeout(then, ms));
  };

  // It arrives from below like a ticket held out: slightly turned, settling with a swing.
  const arrive = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      arrive.setValue(1);
      return;
    }
    const run = springTo(arrive, 1, 'bouncy');
    run.start();
    return () => run.stop();
    // Only once, as it is handed over.
  }, []);
  const fold = useRef(new Animated.Value(0)).current;

  // An invite whose game is gone stays long enough to be read, then goes.
  const dead = failure?.dead ?? false;
  useEffect(() => {
    if (!dead) return;
    const id = setTimeout(() => onGone(invite.id), 4_000);
    return () => clearTimeout(id);
  }, [dead, invite.id, onGone]);

  // "Not now" opened the reasons, so move screen-reader focus to the first.
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
    // Joining: the stub comes off, then the lobby opens.
    onAnswer(invite.id);
    haptic('tap');
    announce(t('play.card.joined'));
    setTorn(true);
    const route = lobbyRoute(res.data.game, res.data.lobbyId);
    after(reduce ? 0 : TEAR_MS + 40, () => {
      onGone(invite.id);
      navigation.navigate(route.name, route.params as never);
    });
  };

  const decline = (reason: DeclineReason): void => {
    onAnswer(invite.id);
    onDecline(invite, reason);
    if (!reduce) timing(fold, 1, FOLD_MS, { easing: Easing.in(Easing.quad) }).start();
    after(reduce ? 0 : FOLD_MS, () => onGone(invite.id));
  };

  // Shadows do not show on a near-black screen, so there a lighter paper lifts the ticket.
  const paper = scheme === 'dark' ? colors.surfaceRaised : colors.surface;
  const lifted = scheme === 'dark' ? { backgroundColor: colors.controlTrack } : null;

  if (hidden) {
    return (
      <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
        <View pointerEvents="box-none" style={[styles.column, styles.pillColumn]}>
          <PressableScale
            onPress={() => setHidden(false)}
            accessibilityRole="button"
            accessibilityLabel={headline}
            accessibilityHint={t('play.banner.show')}
            style={[styles.pill, styles.lift, { backgroundColor: colors.background, shadowColor: colors.softShadow }]}
          >
            <View style={[styles.pillInner, row, lifted]}>
              <View>
                <InitialsAvatar name={invite.from.name} id={invite.from.name} size={28} photoUrl={invite.from.avatarUrl} />
                <View style={[styles.pillBadge, rtl ? styles.pillBadgeLeft : styles.pillBadgeRight]}>
                  <TicketBadge tone={invite.game} size={16} ring={colors.background} />
                </View>
              </View>
              <Text style={[styles.pillText, { color: colors.textPrimary }, dir]} numberOfLines={1}>
                {count > 1 ? t('play.banner.pillMany', { count }) : t('play.banner.pill')}
              </Text>
              <Icon name="chevron-down" size={14} color={colors.textSecondary} style={styles.up} />
            </View>
          </PressableScale>
        </View>
      </View>
    );
  }

  const swing = flow.row === 'row-reverse' ? 1 : -1;
  const arriving = {
    opacity: arrive.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [64, 0] }) },
      { rotate: arrive.interpolate({ inputRange: [0, 1], outputRange: [`${5 * swing}deg`, '0deg'] }) },
    ],
  };
  // Folded down and away, like a ticket put back in a pocket.
  const folding = {
    opacity: fold.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.6, 0] }),
    transform: [
      { perspective: 700 },
      { translateY: fold.interpolate({ inputRange: [0, 1], outputRange: [0, 36] }) },
      { rotateX: fold.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '72deg'] }) },
    ],
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Animated.View style={[styles.column, arriving]}>
        <Animated.View style={folding}>
          {/* The invites after this one, fanned out behind it with their own stub colours. */}
          {[...behind].reverse().map((b) => {
            // Furthest back first, so the nearer one lies over it.
            const i = behind.indexOf(b);
            return (
              <View
                key={b.id}
                style={[
                  styles.behind,
                  {
                    top: -8 * (i + 1),
                    left: spacing.sm * (i + 1),
                    right: spacing.sm * (i + 1),
                    backgroundColor: blend(colors.textPrimary, paper, (scheme === 'dark' ? 0.08 : 0.07) + 0.04 * i),
                    transform: [{ rotate: `${(i % 2 === 0 ? -1.4 : 1.2) * swing}deg` }],
                  },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
              >
                <View style={[styles.behindStub, flow.row === 'row-reverse' ? styles.behindStubRight : styles.behindStubLeft, { backgroundColor: ticketTone(colors, b.game).face }]} />
              </View>
            );
          })}
          <Ticket
            tone={invite.game}
            torn={torn}
            lifted
            paper={paper}
            stub={(ink) => <Icon name={GAME_ICON[invite.game]} size={26} color={ink.ink} />}
            bodyStyle={styles.inner}
            accessibilityLiveRegion="polite"
          >
            <View style={[styles.head, row]}>
              <InitialsAvatar name={invite.from.name} id={invite.from.name} size={40} photoUrl={invite.from.avatarUrl} />
              <View style={styles.text}>
                <Text style={[styles.headline, { color: colors.textPrimary }, dir]}>{headline}</Text>
                {details ? (
                  <Text style={[styles.details, { color: colors.textSecondary }, dir]} numberOfLines={2}>
                    {details}
                  </Text>
                ) : null}
                {/* Rated or Friendly, before you say yes. */}
                {invite.summary.rated !== undefined ? <RatedPill rated={invite.summary.rated} small style={flow.row === 'row-reverse' ? styles.endSelf : undefined} /> : null}
              </View>
              {/* Folds it away without answering; the host hears nothing. */}
              <Pressable
                onPress={() => setHidden(true)}
                accessibilityRole="button"
                accessibilityLabel={t('play.banner.hide')}
                style={({ pressed }) => [styles.hide, flow.row === 'row-reverse' ? styles.hideLeft : styles.hideRight, pressed && heldDim]}
              >
                <Icon name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            {failure?.dead ? (
              <Text style={[styles.details, { color: colors.danger }, dir]}>{failure.message}</Text>
            ) : (
              <>
                <View style={[styles.actions, row]}>
                  <PressableScale
                    onPress={() => void join()}
                    disabled={busy || torn}
                    accessibilityRole="button"
                    accessibilityLabel={t('play.banner.joinLabel', { name: invite.from.name })}
                    accessibilityState={{ busy }}
                    style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{t('play.banner.join')}</Text>
                  </PressableScale>
                  {/* Toggles the two reasons below; Join stays in place. */}
                  <PressableScale
                    onPress={() => setReasons((open) => !open)}
                    disabled={torn}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: reasons }}
                    style={[styles.button, { backgroundColor: colors.controlTrack }]}
                  >
                    <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.notNow')}</Text>
                    <Icon name="chevron-down" size={14} color={colors.textSecondary} style={reasons ? styles.up : undefined} />
                  </PressableScale>
                </View>
                {reasons ? (
                  <View style={[styles.actions, row]}>
                    <PressableScale
                      ref={laterRef}
                      onPress={() => decline('later')}
                      accessibilityRole="button"
                      style={[styles.button, styles.reason, { borderColor: colors.separator }]}
                    >
                      <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.later')}</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => decline('not_this_game')}
                      accessibilityRole="button"
                      style={[styles.button, styles.reason, { borderColor: colors.separator }]}
                    >
                      <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{t('play.banner.notThisGame')}</Text>
                    </PressableScale>
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
          </Ticket>
        </Animated.View>
      </Animated.View>
      {region}
    </View>
  );
}

/**
 * What a failed Join means. A game started, full or gone (404, or 409 with the invite closed) can no longer be
 * joined, so the invite goes with a message. Anything else (network, timeout, busy, rate limit) is passing: the
 * invite stands and Join can be retried.
 */
function joinFailure(error: ApiError, t: Translate): { dead: boolean; message: string } {
  if (error.status === 404 || error.status === 409) return { dead: true, message: t('play.banner.failed') };
  return { dead: false, message: describeError(error, t) };
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 50, alignItems: 'center' },
  // At most a phone's width: a full-width banner reads as broken on a tablet or the web.
  column: { width: '100%', maxWidth: 520 },
  // The pill keeps to the end of that column, clear of the middle.
  pillColumn: { alignItems: 'flex-end' },
  lift: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  // The next invites' tickets: only their top edge and stub show above this one.
  behind: { position: 'absolute', height: 48, borderRadius: radii.lg, overflow: 'hidden' },
  behindStub: { position: 'absolute', top: 0, bottom: 0, width: 60 },
  endSelf: { alignSelf: 'flex-end' },
  behindStubLeft: { left: 0 },
  behindStubRight: { right: 0 },
  pill: { borderRadius: radii.pill, maxWidth: '100%' },
  pillInner: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingStart: spacing.sm,
    paddingEnd: spacing.md,
  },
  pillBadge: { position: 'absolute', bottom: -4 },
  pillBadgeRight: { right: -6 },
  pillBadgeLeft: { left: -6 },
  pillText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, flexShrink: 1 },
  up: { transform: [{ rotate: '180deg' }] },
  hide: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  hideRight: { marginRight: -spacing.sm },
  hideLeft: { marginLeft: -spacing.sm },
  inner: { gap: spacing.sm },
  head: { alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  headline: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  details: { fontSize: typography.sizes.sm },
  actions: { gap: spacing.sm },
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
