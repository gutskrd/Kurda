import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { useIntents, useSayNotSaved } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { PlayWithButton } from '../play/PlayWithButton';
import type { TranslationKey } from '../i18n/translations';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { Avatar } from '../profile/Avatar';
import { EmptyState } from '../theme/EmptyState';
import { mutualText, undoAction } from './format';
import { SearchField } from '../theme/SearchField';
import { useAnnouncer } from '../stories/ui';
import { ACCEPTED_HOLD_MS, DECLINE_FOLD_MS, FriendRequestTicket, TicketSlip, type RequestAnswer } from './FriendTicket';
import { usePullRefresh } from '../net/usePullRefresh';
import { useUnread } from '../messages/unread';
import { useHiddenByBlock } from './blocks';

interface UserRow {
  userId: string;
  username: string;
  displayName?: string | null;
  /** Their picture as the server resolves it (an uploaded photo, else the avatar they chose). */
  avatarUrl?: string | null;
}

/** How long a suggestion says "Requested", its ticket handed over, before it moves to the requests you sent. */
const ASKED_HOLD_MS = 900;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Someone you may know, and the reason to think so. */
interface Suggestion extends UserRow {
  mutualCount: number;
}

/**
 * Friends: find people, and see and manage every friendship in flight (friends, incoming and sent requests, and who to
 * ask next). A pushed screen, opened from the friend count and the menu on your profile.
 */
export function SocialScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { report } = useUnread();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();

  const { t } = useI18n();
  // In right-to-left languages the rows start on the right, as the request tickets above do.
  const dir = useDirection();
  const tabBarInset = useTabBarInset();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserRow[] | null>(null);
  const [friends, setFriends] = useState<UserRow[]>([]);
  const [requests, setRequests] = useState<UserRow[]>([]);
  const [sent, setSent] = useState<UserRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  // The list's place is held until the first answer, rather than "search to start" showing to somebody with friends.
  const [settled, setSettled] = useState(false);
  const reduce = useReducedMotion();
  const { announce, region } = useAnnouncer();
  /** Requests answered here: stamped "Friends" or folding away, until the lists come back without them. */
  const [answers, setAnswers] = useState<Record<string, RequestAnswer>>({});
  /** Suggestions just asked: their button says "Requested" for a moment before they move to the sent list. */
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());

  const loadLists = useCallback(() => {
    const lists = client.get<{ friends: UserRow[] }>('/friends').then((r) => {
      setSettled(true);
      if (r.ok) {
        setFriends(r.data.friends);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    const incoming = client.get<{ requests: UserRow[] }>('/friends/requests').then((r) => {
      if (!r.ok) return;
      setRequests(r.data.requests);
      // The badge counts the same list, so it is told rather than asked again.
      report({ requests: r.data.requests.length });
    });
    /* Requests you sent, so you can see and withdraw them. */
    const outgoing = client
      .get<{ requests: UserRow[] }>('/friends/requests/outgoing')
      .then((r) => r.ok && setSent(r.data.requests));
    return Promise.all([lists, incoming, outgoing]);
  }, [client, report]);

  useFocusEffect(
    useCallback(() => {
      void loadLists();
    }, [loadLists]),
  );
  // Pulled down, the three lists are read again (the suggestions stay: they change far more slowly).
  const pull = usePullRefresh(loadLists);

  /*
   * Suggestions load once, not on every focus like the three lists above: it is a friends-of-friends query the API rate
   * limits to 30/min, and its answer does not change between visits, while the other lists change with every request
   * answered anywhere.
   */
  useEffect(() => {
    void client
      .get<{ suggestions: Suggestion[] }>('/friends/suggestions')
      .then((r) => r.ok && setSuggestions(r.data.suggestions));
  }, [client]);

  const search = useCallback(
    async (q: string) => {
      setQuery(q);
      if (q.trim().length < 2) {
        setResults(null);
        return;
      }
      setSearching(true);
      const res = await client.get<{ results: UserRow[] }>(`/users/search?q=${encodeURIComponent(q.trim())}`);
      setSearching(false);
      if (res.ok) setResults(res.data.results);
    },
    [client],
  );

  /*
   * Answering and withdrawing show at once, and the request count with them; the server is told after. A refusal says
   * why and reads the lists again, which brings back what did not get through.
   */
  const say = useSayNotSaved();
  const refused = (error: ApiError): void => {
    haptic('error');
    say(error);
    report((now) => ({ requests: now.requests + 1 }));
    void loadLists();
  };
  const answering = useIntents<string, RequestAnswer | null>(
    async (userId, answer) => {
      const res = await client.post(`/friends/requests/${userId}/${answer === 'accepted' ? 'accept' : 'decline'}`);
      // A new friend joins the list as the server has it.
      if (res.ok && answer === 'accepted') void loadLists();
      return res;
    },
    { failed: refused },
  );
  const withdrawing = useIntents<string, boolean>((userId) => client.delete(`/friends/requests/${userId}`), {
    failed: (error) => {
      haptic('error');
      say(error);
      void loadLists();
    },
  });

  /** Answer a request on its ticket: stamped "Friends" for a moment, or folded away, then gone. */
  const respond = useCallback(
    (u: UserRow, accept: boolean) => {
      if (accept) haptic('tap');
      if (accept) announce(t('friends.nowFriends', { name: u.displayName ?? u.username }));
      setAnswers((a) => ({ ...a, [u.userId]: accept ? 'accepted' : 'declined' }));
      report((now) => ({ requests: Math.max(0, now.requests - 1) }));
      answering.want(u.userId, accept ? 'accepted' : 'declined', null);
      const hold = accept ? ACCEPTED_HOLD_MS : reduce ? 0 : DECLINE_FOLD_MS;
      void wait(hold).then(() => {
        setRequests((list) => list.filter((r) => r.userId !== u.userId));
        setAnswers((a) => {
          const rest = { ...a };
          delete rest[u.userId];
          return rest;
        });
      });
    },
    [reduce, announce, t, report, answering],
  );

  /* The same words the profile uses to withdraw the same request. */
  const withdraw = useCallback(
    (u: UserRow) => {
      const undo = undoAction('pending_out')!;
      Alert.alert(t(undo.label), t(undo.prompt, { name: u.displayName ?? u.username }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t(undo.label),
          style: 'destructive',
          onPress: () => {
            setSent((list) => list.filter((r) => r.userId !== u.userId));
            withdrawing.want(u.userId, true, false);
          },
        },
      ]);
    },
    [t, withdrawing],
  );

  /**
   * Ask, and take them off the suggestions. The button answers at once (a ticket handed over, "Requested") and the row
   * leaves a moment later rather than by refetching, since the suggestion query is the expensive one.
   */
  const addFriend = useCallback(
    (userId: string) => {
      haptic('tap');
      announce(t('friends.requestSent'));
      setAsked((prev) => new Set(prev).add(userId));
      void Promise.all([client.post('/friends/requests', { userId }), wait(reduce ? 0 : ASKED_HOLD_MS)]).then(([res]) => {
        setSuggestions((prev) => prev.filter((s) => s.userId !== userId));
        // A request that did not go (a full friend list, too many outgoing) says why (limits/limitCopy.ts).
        if (!res.ok) say(res.error);
        loadLists();
      });
    },
    [client, loadLists, t, reduce, announce, say],
  );

  const openProfile = (userId: string) => navigation.navigate('UserProfile', { userId });

  /**
   * One person. `subtitle` replaces the display name rather than joining it: on a suggestion the number of shared
   * friends is the more useful line, and a phone row has room for one.
   */
  const row = (u: UserRow, right?: React.ReactNode, subtitle?: string) => {
    const sub = subtitle ?? u.displayName;
    // The person and the row's button side by side, never nested: a screen reader reaches only the outer of two nested
    // buttons.
    return (
      <View key={u.userId} style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}>
        <PressableScale
          style={[styles.rowOpen, { flexDirection: dir.row }]}
          onPress={() => openProfile(u.userId)}
          accessibilityRole="button"
          accessibilityLabel={
            u.displayName
              ? t('friends.openProfileNamed', { username: u.username, name: u.displayName })
              : t('friends.openProfile', { username: u.username })
          }
        >
          <Avatar name={u.username} size={36} photoUrl={u.avatarUrl ?? undefined} />
          <View style={styles.rowMain}>
            <Text style={[styles.username, dir.free, { color: colors.textPrimary }]}>{u.username}</Text>
            {sub ? <Text style={[styles.display, dir.free, { color: colors.textSecondary }]}>{sub}</Text> : null}
          </View>
        </PressableScale>
        {right}
      </View>
    );
  };

  /** Takes a catalogue key, so the heading is visible to the i18n check. */
  const section = (key: TranslationKey) => (
    <Text style={[styles.section, dir.text, { color: colors.textSecondary }]}>{t(key)}</Text>
  );

  // Somebody just blocked from another screen leaves these lists at once (social/blocks.ts).
  const gone = useHiddenByBlock();
  const without = <T extends { userId: string }>(list: T[]): T[] => (gone.size === 0 ? list : list.filter((u) => !gone.has(u.userId)));
  const showingSearch = results !== null;

  return (
    <GradientBackground>
      {/* The bar every pushed page has, with Messages at its end, and what the page is for under it, as on the website. */}
      <ScreenHeader
        title={t('nav.friends')}
        onBack={onExit}
        right={<HeaderButton icon="chat" label={t('nav.messages')} onPress={() => navigation.popTo('Tabs', { screen: 'Messages' })} testID="friends-messages" />}
      />
      <View style={styles.screen}>
        <Text style={[styles.intro, dir.text, { color: colors.textSecondary }]}>{t('friends.subtitle')}</Text>
        <SearchField value={query} onChangeText={search} label={t('friends.searchPlaceholder')} returnKeyType="done" />

        {showingSearch ? (
          <FlatList
            data={without(results ?? [])}
            keyExtractor={(u) => u.userId}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            // The keyboard is up while results come in: a tap on one opens it, rather than only dismissing the
            // keyboard.
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => row(item)}
            ListEmptyComponent={
              searching ? (
                <PeopleSkeleton />
              ) : (
                <EmptyState title={t('friends.noResults')} />
              )
            }
          />
        ) : failed && friends.length === 0 ? (
          <ErrorRetry onRetry={() => void loadLists()} />
        ) : (
          <FlatList
            data={without(friends)}
            keyExtractor={(u) => u.userId}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={pull}
            ListHeaderComponent={
              <View>
                {without(requests).length > 0 ? (
                  <View style={styles.tickets}>
                    {section('friends.requests')}
                    {without(requests).map((u) => (
                      <FriendRequestTicket
                        key={u.userId}
                        compact
                        person={u}
                        answer={answers[u.userId] ?? null}
                        onOpen={() => openProfile(u.userId)}
                        onAccept={() => respond(u, true)}
                        onDecline={() => respond(u, false)}
                        acceptLabel={t('friends.acceptFrom', { username: u.username })}
                        declineLabel={t('friends.declineFrom', { username: u.username })}
                      />
                    ))}
                  </View>
                ) : null}
                {without(sent).length > 0 ? (
                  <View>
                    {section('friends.sent')}
                    {without(sent).map((u) =>
                      row(
                        u,
                        <Pressable
                          onPress={() => withdraw(u)}
                          reachSize={{ height: LINK_LINE }}
                          accessibilityRole="button"
                          accessibilityLabel={t('friends.cancelRequest', { name: u.displayName ?? u.username })}
                          style={({ pressed }) => pressed && heldDim}
                        >
                          <Text style={[styles.cancel, { color: colors.textSecondary }]}>{t('friends.cancel')}</Text>
                        </Pressable>,
                      ),
                    )}
                  </View>
                ) : null}
                {section('friends.title')}
              </View>
            }
            // A friend's row has a Play button: any game, with that friend picked (play/InviteSheet).
            renderItem={({ item }) => row(item, <PlayWithButton friendId={item.userId} name={item.displayName ?? item.username} compact />)}
            ListEmptyComponent={
              settled ? <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('friends.searchToStart')}</Text> : <PeopleSkeleton />
            }
            ListFooterComponent={
              without(suggestions).length > 0 ? (
                <View>
                  {section('friends.suggestions')}
                  {without(suggestions).map((s) => {
                    const requested = asked.has(s.userId);
                    return row(
                      s,
                      <TicketSlip sent={requested}>
                        <PressableScale
                          onPress={() => addFriend(s.userId)}
                          disabled={requested}
                          style={[styles.accept, styles.add, { backgroundColor: requested ? colors.controlTrack : colors.primary }]}
                          accessibilityRole="button"
                          accessibilityLabel={requested ? t('friends.requested') : t('friends.add')}
                          accessibilityState={{ disabled: requested }}
                        >
                          {requested ? <Icon name="ticket" size={14} color={colors.textPrimary} /> : null}
                          <Text style={[styles.acceptText, { color: requested ? colors.textPrimary : colors.textOnPrimary }]}>
                            {requested ? t('friends.requested') : t('friends.add')}
                          </Text>
                        </PressableScale>
                      </TicketSlip>,
                      mutualText(t, s.mutualCount),
                    );
                  })}
                </View>
              ) : null
            }
          />
        )}
      </View>
      {region}
    </GradientBackground>
  );
}

/**
 * A line of words beside an 18pt glyph, as a request's Cancel is drawn; the Pressable reaches it to a fingertip.
 */
const LINK_LINE = 22;

/** People row for row, as their cards will stand: the face, the name and its line, the button at the end. */
function PeopleSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.skeleton} accessibilityLabel={t('common.loading')}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.row, { backgroundColor: colors.glassFill }]}>
          <Skeleton width={36} height={36} radius={radii.pill} />
          <View style={styles.rowMain}>
            <SkeletonText size={typography.sizes.text} width={i % 2 ? '36%' : '50%'} />
            <SkeletonText size={typography.sizes.text} width="28%" />
          </View>
          <Skeleton width={64} height={MIN_TOUCH_TARGET - 12} radius={radii.pill} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: spacing.xs },
  screen: { flex: 1, paddingHorizontal: layout.gutter, paddingTop: spacing.xs },
  intro: { fontSize: typography.sizes.text, lineHeight: 22, marginBottom: spacing.md },
  list: { paddingVertical: spacing.md, gap: spacing.xs },
  section: { ...sectionLabel, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, padding: spacing.sm },
  rowOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowMain: { flex: 1 },
  username: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  display: { fontSize: typography.sizes.text },
  accept: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.sm },
  add: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tickets: { gap: spacing.xs },
  acceptText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.text },
  cancel: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
