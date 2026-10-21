import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
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

interface UserRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

/** Someone you may know, and the reason to think so. */
interface Suggestion extends UserRow {
  mutualCount: number;
}

/**
 * Friends (KUR-082): find people, and see and manage every friendship in
 * flight — friends, requests coming in, requests you sent, and who to ask next.
 *
 * A pushed screen, opened from the friend count on your profile and from the
 * profile's menu, so it has a way back; it used to carry the menu button it
 * had as a tab, which did nothing once it was not one.
 */
export function SocialScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();

  const { t } = useI18n();
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
  // the list's place is held until the first answer, rather than "search to start" showing to somebody with friends
  const [settled, setSettled] = useState(false);

  const loadLists = useCallback(() => {
    void client.get<{ friends: UserRow[] }>('/friends').then((r) => {
      setSettled(true);
      if (r.ok) {
        setFriends(r.data.friends);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    void client.get<{ requests: UserRow[] }>('/friends/requests').then((r) => r.ok && setRequests(r.data.requests));
    /*
     * The half of the relationship the phone could not see. A request you sent
     * was invisible here and unactionable on their profile, so the only way to
     * find out whether you had already asked somebody was to remember.
     */
    void client
      .get<{ requests: UserRow[] }>('/friends/requests/outgoing')
      .then((r) => r.ok && setSent(r.data.requests));
  }, [client]);

  useFocusEffect(useCallback(() => loadLists(), [loadLists]));

  /*
   * Suggestions load once, not on every focus like the three lists above.
   *
   * Who you may know is a friends-of-friends join the API itself calls expensive
   * and rate limits to 30/min — and it is answering a question that does not
   * change between two visits to a tab. The other three do change, because
   * acting on a request anywhere else in the app changes them.
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

  const respond = useCallback(
    async (userId: string, accept: boolean) => {
      if (accept) haptic('tap');
      await client.post(`/friends/requests/${userId}/${accept ? 'accept' : 'decline'}`);
      loadLists();
    },
    [client, loadLists],
  );

  /* the same words the profile uses to withdraw the same request */
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
   * Ask, and take them off the list of people to ask.
   *
   * Dropped locally rather than by refetching: they have just moved from
   * "suggested" to "requested", the suggestion query is the expensive one, and
   * a row that stays put after a tap reads as a tap that did not register.
   */
  const addFriend = useCallback(
    (userId: string) => {
      setSuggestions((prev) => prev.filter((s) => s.userId !== userId));
      haptic('tap');
      void client.post('/friends/requests', { userId }).then(loadLists);
    },
    [client, loadLists],
  );

  const openProfile = (userId: string) => navigation.navigate('UserProfile', { userId });

  /**
   * One person.
   *
   * `subtitle` replaces the display name rather than joining it: on a suggestion
   * the reason it is being suggested at all — how many friends you share — is
   * the more useful of the two, and a phone row has space for one.
   */
  const row = (u: UserRow, right?: React.ReactNode, subtitle?: string) => {
    const sub = subtitle ?? u.displayName;
    return (
      <Pressable
        key={u.userId}
        style={[styles.row, { backgroundColor: colors.controlTrack }]}
        onPress={() => openProfile(u.userId)}
        accessibilityRole="button"
        accessibilityLabel={
          u.displayName
            ? t('friends.openProfileNamed', { username: u.username, name: u.displayName })
            : t('friends.openProfile', { username: u.username })
        }
      >
        <InitialsAvatar name={u.username} id={u.userId} size={36} />
        <View style={styles.rowMain}>
          <Text style={[styles.username, { color: colors.textPrimary }]}>{u.username}</Text>
          {sub ? <Text style={[styles.display, { color: colors.textSecondary }]}>{sub}</Text> : null}
        </View>
        {right}
      </Pressable>
    );
  };

  /** Takes a key, not a word: the two headings here were plain English, and
      a label built at the call site is invisible to the i18n gate. */
  const section = (key: TranslationKey) => (
    <Text style={[styles.section, { color: colors.textSecondary }]}>{t(key)}</Text>
  );

  const showingSearch = results !== null;

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        {/* Library and Memes used to be two links here, into two screens
            showing halves of the same wall. Both now live on the Civak tab,
            together, which is what this tab stopped being about. */}
        <LargeTitle
          left={<BackButton onPress={onExit} />}
          title={t('nav.friends')}
          style={styles.head}
          right={
            <Pressable
              onPress={() => navigation.navigate('Tabs', { screen: 'Messages' })}
              hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 22)}
              style={styles.messagesLink}
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
          <ErrorRetry onRetry={loadLists} />
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(u) => u.userId}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            ListHeaderComponent={
              <View>
                {requests.length > 0 ? (
                  <View>
                    {section('friends.requests')}
                    {requests.map((u) =>
                      row(
                        u,
                        <View style={styles.actions}>
                          <Pressable
                            onPress={() => respond(u.userId, true)}
                            style={[styles.accept, { backgroundColor: colors.primary }]}
                            accessibilityRole="button"
                            accessibilityLabel={t('friends.acceptFrom', { username: u.username })}
                          >
                            <Text style={[styles.acceptText, { color: colors.textOnPrimary }]}>{t('friends.accept')}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => respond(u.userId, false)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={t('friends.declineFrom', { username: u.username })}
                          >
                            <Text style={[styles.decline, { color: colors.danger }]}>✕</Text>
                          </Pressable>
                        </View>,
                      ),
                    )}
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
                          hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 22)}
                          accessibilityRole="button"
                          accessibilityLabel={t('friends.cancelRequest', { name: u.displayName ?? u.username })}
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
            // a friend's row has a Play button: any game, that friend picked (play/InviteSheet)
            renderItem={({ item }) => row(item, <PlayWithButton friendId={item.userId} name={item.displayName ?? item.username} compact />)}
            ListEmptyComponent={
              settled ? <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('friends.searchToStart')}</Text> : <PeopleSkeleton />
            }
            ListFooterComponent={
              suggestions.length > 0 ? (
                <View>
                  {section('friends.suggestions')}
                  {suggestions.map((s) =>
                    row(
                      s,
                      <Pressable
                        onPress={() => addFriend(s.userId)}
                        style={[styles.accept, { backgroundColor: colors.primary }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('friends.add')}
                      >
                        <Text style={[styles.acceptText, { color: colors.textOnPrimary }]}>{t('friends.add')}</Text>
                      </Pressable>,
                      mutualText(t, s.mutualCount),
                    ),
                  )}
                </View>
              ) : null
            }
          />
        )}
      </View>
    </GradientBackground>
  );
}

/** People in grey, row for row: the face, the name and the line under it, the button at the end. */
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
  rowMain: { flex: 1 },
  username: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  display: { fontSize: typography.sizes.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accept: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.sm },
  acceptText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  decline: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  cancel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
