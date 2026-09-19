import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { SkeletonList } from '../theme/Skeleton';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { LargeTitle } from '../navigation/LargeTitle';
import { InitialsAvatar } from '../profile/InitialsAvatar';

interface UserRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

/** Social tab (KUR-082): find people + see friends and pending requests. */
export function SocialScreen() {
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
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadLists = useCallback(() => {
    void client.get<{ friends: UserRow[] }>('/friends').then((r) => {
      if (r.ok) {
        setFriends(r.data.friends);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    void client.get<{ requests: UserRow[] }>('/friends/requests').then((r) => r.ok && setRequests(r.data.requests));
  }, [client]);

  useFocusEffect(useCallback(() => loadLists(), [loadLists]));

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
      await client.post(`/friends/requests/${userId}/${accept ? 'accept' : 'decline'}`);
      loadLists();
    },
    [client, loadLists],
  );

  const openProfile = (userId: string) => navigation.navigate('UserProfile', { userId });

  const row = (u: UserRow, right?: React.ReactNode) => (
    <Pressable
      key={u.userId}
      style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}
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
        {u.displayName ? <Text style={[styles.display, { color: colors.textSecondary }]}>{u.displayName}</Text> : null}
      </View>
      {right}
    </Pressable>
  );

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
          title={t('nav.friends')}
          style={styles.head}
          right={
            <Pressable onPress={() => navigation.navigate('Chats')} hitSlop={8} style={styles.messagesLink} accessibilityRole="button" accessibilityLabel={t('nav.messages')}>
              <Icon name="chat" size={18} tone="primary" />
              <Text style={[styles.messages, { color: colors.primary }]}>{t('nav.messages')}</Text>
            </Pressable>
          }
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder={t('friends.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          value={query}
          onChangeText={search}
        />

        {showingSearch ? (
          <FlatList
            data={results}
            keyExtractor={(u) => u.userId}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            renderItem={({ item }) => row(item)}
            ListEmptyComponent={
              searching ? (
                <SkeletonList count={5} style={{ marginTop: spacing.sm }} />
              ) : (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('friends.noResults')}</Text>
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
              requests.length > 0 ? (
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
                  {section('friends.title')}
                </View>
              ) : (
                section('friends.title')
              )
            }
            renderItem={({ item }) => row(item)}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>{t('friends.searchToStart')}</Text>}
          />
        )}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg },
  head: { marginBottom: spacing.md },
  messagesLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messages: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  input: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  list: { paddingVertical: spacing.md, gap: spacing.xs },
  section: { ...sectionLabel, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.sm },
  rowMain: { flex: 1 },
  username: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  display: { fontSize: typography.sizes.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accept: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.sm },
  acceptText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  decline: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
