import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
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
  const { colors } = useTheme();
  const topInset = useScreenTopInset();
  const [convos, setConvos] = useState<Conversation[]>([]);

  useFocusEffect(
    useCallback(() => {
      void client.get<{ conversations: Conversation[] }>('/chat/conversations').then((r) => {
        if (r.ok) setConvos(r.data.conversations);
      });
    }, [client]),
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: topInset }]}>
          <Pressable onPress={onExit} hitSlop={10}><Text style={[styles.close, { color: colors.primary }]}>‹ Back</Text></Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
          <View style={{ width: 40 }} />
        </View>
        <FlatList
          data={convos}
          keyExtractor={(c) => c.userId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}
              onPress={() => navigation.navigate('Chat', { userId: item.userId, username: item.username })}
            >
              <InitialsAvatar name={item.username} id={item.userId} size={44} />
              <View style={styles.main}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{item.username}</Text>
                <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.lastFromMe ? 'You: ' : ''}{item.lastMessage}
                </Text>
              </View>
              {item.unread > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}><Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{item.unread}</Text></View>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>No conversations yet. Message a friend from their profile.</Text>}
        />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  close: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, width: 40 },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  list: { padding: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  preview: { fontSize: typography.sizes.sm },
  badge: { minWidth: 22, height: 22, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
