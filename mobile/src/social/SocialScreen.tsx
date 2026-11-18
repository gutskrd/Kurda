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
import { describeError, isMaintenance } from '../api/errors';
import { PlayWithButton } from '../play/PlayWithButton';
import type { TranslationKey } from '../i18n/translations';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { LargeTitle } from '../navigation/LargeTitle';
import { BackButton } from '../navigation/BackButton';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { EmptyState } from '../theme/EmptyState';
import { mutualText, undoAction } from './format';
import { SearchField } from '../theme/SearchField';
import { useAnnouncer } from '../stories/ui';
import { ACCEPTED_HOLD_MS, DECLINE_FOLD_MS, FriendRequestTicket, TicketSlip, type RequestAnswer } from './FriendTicket';
import { usePullRefresh } from '../net/usePullRefresh';

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
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();

  const { t } = useI18n();
  // In right-to-left languages the rows start on the right, as the request tickets above do.
  const dir = useDirection();
  const tabBarInset = useTabBarInset();
  const topInset = useScreenTopInset();
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
    const incoming = client.get<{ requests: UserRow[] }>('/friends/requests').then((r) => r.ok && setRequests(r.data.requests));
    /* Requests you sent, so you can see and withdraw them. */
    const outgoing = client
      .get<{ requests: UserRow[] }>('/friends/requests/outgoing')
      .then((r) => r.ok && setSent(r.data.requests));
    return Promise.all([lists, incoming, outgoing]);
  }, [client]);

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

  /**
   * Answer a request on its ticket (stamped "Friends" for a moment, or folded away), then read the lists again, which
   * also brings back one whose answer did not get through.
   */
  const respond = useCallback(
    (u: UserRow, accept: boolean) => {
      if (accept) haptic('tap');
      if (accept) announce(t('friends.nowFriends', { name: u.displayName ?? u.username }));
      setAnswers((a) => ({ ...a, [u.userId]: accept ? 'accepted' : 'declined' }));
      const hold = accept ? ACCEPTED_HOLD_MS : reduce ? 0 : DECLINE_FOLD_MS;
      void Promise.all([client.post(`/friends/requests/${u.userId}/${accept ? 'accept' : 'decline'}`), wait(hold)]).then(() => {
        setRequests((list) => list.filter((r) => r.userId !== u.userId));
        setAnswers((a) => {
          const rest = { ...a };
          delete rest[u.userId];
          return rest;
        });
        loadLists();
      });
    },
    [client, loadLists, reduce, announce, t],
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
            void client.delete(`/friends/requests/${u.userId}`).then(loadLists);
          },
        },
      ]);
    },
    [client, loadLists, t],
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
        if (!res.ok && !isMaintenance(res.error)) Alert.alert(describeError(res.error, t));
        loadLists();
      });
    },
    [client, loadLists, t, reduce, announce],
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
      <View key={u.userId} style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
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
          <InitialsAvatar name={u.username} id={u.userId} size={36} photoUrl={u.avatarUrl ?? undefined} />
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

  const showingSearch = results !== null;

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <LargeTitle
          left={<BackButton onPress={onExit} />}
          title={t('nav.friends')}
          style={styles.head}
          right={
            <Pressable
              onPress={() => navigation.popTo('Tabs', { screen: 'Messages' })}
              reachSize={{ height: LINK_LINE }}
              style={({ pressed }) => [styles.messagesLink, { flexDirection: dir.row }, pressed && heldDim]}
              accessibilityRole="button"
              accessibilityLabel={t('nav.messages')}
            >
              <Icon name="chat" size={18} tone="primary" />
              <Text style={[styles.messages, { color: colors.primary }]}>{t('nav.messages')}</Text>
            </Pressable>
          }
        />
        <SearchField value={query} onChangeText={search} label={t('friends.searchPlaceholder')} returnKeyType="done" />

        {showingSearch ? (
          <FlatList
            data={results}
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
            data={friends}
            keyExtractor={(u) => u.userId}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={pull}
            ListHeaderComponent={
              <View>
                {requests.length > 0 ? (
                  <View style={styles.tickets}>
                    {section('friends.requests')}
                    {requests.map((u) => (
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
                {sent.length > 0 ? (
                  <View>
                    {section('friends.sent')}
                    {sent.map((u) =>
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
              suggestions.length > 0 ? (
                <View>
                  {section('friends.suggestions')}
                  {suggestions.map((s) => {
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
 * A line of words beside an 18pt glyph, as the Messages link and a request's Cancel are drawn; the Pressable reaches it
 * to a fingertip.
 */
const LINK_LINE = 22;

/** People in grey, row for row: the face, the name and its line, the button at the end. */
function PeopleSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.skeleton} accessibilityLabel={t('common.loading')}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.row, { backgroundColor: colors.controlTrack }]}>
          <Skeleton width={36} height={36} radius={radii.pill} raised />
          <View style={styles.rowMain}>
            <SkeletonText size={typography.sizes.md} width={i % 2 ? '36%' : '50%'} raised />
            <SkeletonText size={typography.sizes.sm} width="28%" raised />
          </View>
          <Skeleton width={64} height={MIN_TOUCH_TARGET - 12} radius={radii.pill} raised />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: spacing.xs },
  screen: { flex: 1, paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  head: { marginBottom: spacing.md },
  messagesLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messages: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  list: { paddingVertical: spacing.md, gap: spacing.xs },
  section: { ...sectionLabel, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, padding: spacing.sm },
  rowOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowMain: { flex: 1 },
  username: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  display: { fontSize: typography.sizes.sm },
  accept: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.sm },
  add: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tickets: { gap: spacing.xs },
  acceptText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  cancel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
