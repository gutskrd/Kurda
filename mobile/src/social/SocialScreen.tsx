import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
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

  const openProfile = (userId: string) => navigation.navigate('Profile', { userId });

  const row = (u: UserRow, right?: React.ReactNode) => (
    <Pressable
      key={u.userId}
      style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}
      onPress={() => openProfile(u.userId)}
      accessibilityRole="button"
      accessibilityLabel={`${u.username}${u.displayName ? `, ${u.displayName}` : ''} — open profile`}
    >
      <InitialsAvatar name={u.username} id={u.userId} size={36} />
      <View style={styles.rowMain}>
        <Text style={[styles.username, { color: colors.textPrimary }]}>{u.username}</Text>
        {u.displayName ? <Text style={[styles.display, { color: colors.textSecondary }]}>{u.displayName}</Text> : null}
      </View>
      {right}
    </Pressable>
  );

  const section = (label: string) => <Text style={[styles.section, { color: colors.textSecondary }]}>{label}</Text>;

  const showingSearch = results !== null;

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.primary }]}>Social</Text>
          <View style={styles.headerLinks}>
            <Pressable onPress={() => navigation.navigate('Memes')} hitSlop={8} style={styles.messagesLink} accessibilityRole="button" accessibilityLabel="Meme feed">
              <Icon name="flame" size={18} tone="primary" />
              <Text style={[styles.messages, { color: colors.primary }]}>Memes</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Chats')} hitSlop={8} style={styles.messagesLink} accessibilityRole="button" accessibilityLabel="Messages">
              <Icon name="chat" size={18} tone="primary" />
              <Text style={[styles.messages, { color: colors.primary }]}>Messages</Text>
            </Pressable>
          </View>
        </View>
        <TextInput
          style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
          placeholder="Search by username…"
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
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
              ) : (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>No users found.</Text>
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
                  {section('Requests')}
                  {requests.map((u) =>
                    row(
                      u,
                      <View style={styles.actions}>
                        <Pressable
                          onPress={() => respond(u.userId, true)}
                          style={[styles.accept, { backgroundColor: colors.primary }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Accept friend request from ${u.username}`}
                        >
                          <Text style={[styles.acceptText, { color: colors.textOnPrimary }]}>Accept</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => respond(u.userId, false)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Decline friend request from ${u.username}`}
                        >
                          <Text style={[styles.decline, { color: colors.danger }]}>✕</Text>
                        </Pressable>
                      </View>,
                    ),
                  )}
                  {section('Friends')}
                </View>
              ) : (
                section('Friends')
              )
            }
            renderItem={({ item }) => row(item)}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>Search for friends to get started.</Text>}
          />
        )}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold },
  headerLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  messagesLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messages: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  input: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  list: { paddingVertical: spacing.md, gap: spacing.xs },
  section: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs },
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
