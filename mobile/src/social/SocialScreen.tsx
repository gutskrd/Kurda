import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface UserRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

function Monogram({ name }: { name: string }) {
  const initial = (name || '?').normalize('NFC').trim()[0]?.toUpperCase() ?? '?';
  return (
    <View style={styles.monogram}>
      <Text style={styles.monogramText}>{initial}</Text>
    </View>
  );
}

/** Social tab (KUR-082): find people + see friends and pending requests. */
export function SocialScreen() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserRow[] | null>(null);
  const [friends, setFriends] = useState<UserRow[]>([]);
  const [requests, setRequests] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);

  const loadLists = useCallback(() => {
    void client.get<{ friends: UserRow[] }>('/friends').then((r) => r.ok && setFriends(r.data.friends));
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
    <Pressable key={u.userId} style={styles.row} onPress={() => openProfile(u.userId)}>
      <Monogram name={u.username} />
      <View style={styles.rowMain}>
        <Text style={styles.username}>{u.username}</Text>
        {u.displayName ? <Text style={styles.display}>{u.displayName}</Text> : null}
      </View>
      {right}
    </Pressable>
  );

  const showingSearch = results !== null;

  return (
    <View style={styles.screen}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Social</Text>
        <Pressable onPress={() => navigation.navigate('Chats')} hitSlop={8}>
          <Text style={styles.messages}>💬 Messages</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
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
          contentContainerStyle={styles.list}
          renderItem={({ item }) => row(item)}
          ListEmptyComponent={
            searching ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
            ) : (
              <Text style={styles.empty}>No users found.</Text>
            )
          }
        />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(u) => u.userId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            requests.length > 0 ? (
              <View>
                <Text style={styles.section}>Requests</Text>
                {requests.map((u) =>
                  row(
                    u,
                    <View style={styles.actions}>
                      <Pressable onPress={() => respond(u.userId, true)} style={styles.accept}>
                        <Text style={styles.acceptText}>Accept</Text>
                      </Pressable>
                      <Pressable onPress={() => respond(u.userId, false)} hitSlop={8}>
                        <Text style={styles.decline}>✕</Text>
                      </Pressable>
                    </View>,
                  ),
                )}
                <Text style={styles.section}>Friends</Text>
              </View>
            ) : (
              <Text style={styles.section}>Friends</Text>
            )
          }
          renderItem={({ item }) => row(item)}
          ListEmptyComponent={<Text style={styles.empty}>Search for friends to get started.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.primary },
  messages: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.primary },
  input: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, fontSize: typography.sizes.md },
  list: { paddingVertical: spacing.md, gap: spacing.xs },
  section: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.textSecondary, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm },
  rowMain: { flex: 1 },
  username: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  display: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accept: { backgroundColor: colors.primary, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.sm },
  acceptText: { color: colors.textOnPrimary, fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  decline: { color: colors.danger, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
  monogram: { width: 36, height: 36, borderRadius: radii.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  monogramText: { color: colors.textOnPrimary, fontWeight: typography.weights.bold },
});
