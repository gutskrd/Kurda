import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { InitialsAvatar } from '../profile/InitialsAvatar';

interface Conversation {
  userId: string;
  username: string;
  lastMessage: string;
  lastFromMe: boolean;
  unread: number;
}

/** Conversation list (KUR-083). */
export function ChatListScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const [convos, setConvos] = useState<Conversation[]>([]);

  useFocusEffect(
    useCallback(() => {
      void client.get<{ conversations: Conversation[] }>('/chat/conversations').then((r) => {
        if (r.ok) setConvos(r.data.conversations);
      });
    }, [client]),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={10}><Text style={styles.close}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Messages</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={convos}
        keyExtractor={(c) => c.userId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Chat', { userId: item.userId, username: item.username })}
          >
            <InitialsAvatar name={item.username} id={item.userId} size={44} />
            <View style={styles.main}>
              <Text style={styles.name}>{item.username}</Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.lastFromMe ? 'You: ' : ''}{item.lastMessage}
              </Text>
            </View>
            {item.unread > 0 ? (
              <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No conversations yet. Message a friend from their profile.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  close: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold, width: 40 },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary },
  list: { padding: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  preview: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  badge: { minWidth: 22, height: 22, borderRadius: radii.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: colors.textOnPrimary, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
});
