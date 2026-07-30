import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { useChatSocket } from './useChatSocket';

interface Message {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
}

const MAX_LEN = 2000;

/** 1:1 conversation thread (KUR-083). */
export function ChatScreen({ userId, username, onExit }: { userId: string; username: string; onExit: () => void }) {
  const { client, user } = useAuth();
  const me = user?.id ?? '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  const markRead = useCallback(() => void client.post(`/chat/${userId}/read`), [client, userId]);

  useEffect(() => {
    let active = true;
    void client.get<{ messages: Message[] }>(`/chat/${userId}/messages`).then((res) => {
      if (active && res.ok) setMessages(res.data.messages);
      if (active) setLoading(false);
      markRead();
    });
    return () => {
      active = false;
    };
  }, [client, userId, markRead]);

  useChatSocket(
    useCallback(
      (ev) => {
        if (ev.type === 'dm' && ev.from === userId && ev.message) {
          setMessages((prev) => [...prev, ev.message as Message]);
          markRead();
        } else if (ev.type === 'dm_read' && ev.by === userId) {
          setMessages((prev) => prev.map((m) => (m.senderId === me ? { ...m, readAt: new Date().toISOString() } : m)));
        } else if (ev.type === 'dm_typing' && ev.from === userId) {
          setPeerTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setPeerTyping(false), 3000);
        }
      },
      [userId, me, markRead],
    ),
  );

  const onType = (text: string) => {
    setDraft(text);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      void client.post(`/chat/${userId}/typing`);
    }
  };

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    const res = await client.post<Message>(`/chat/${userId}/messages`, { body });
    if (res.ok) setMessages((prev) => [...prev, res.data]);
  }, [client, draft, userId]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={10}><Text style={styles.close}>‹ Back</Text></Pressable>
        <Text style={styles.title}>{username}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.senderId === me;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                </View>
                {mine && item.readAt ? <Text style={styles.receipt}>Read</Text> : null}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Say hello 👋</Text>}
        />
      )}

      {peerTyping ? <Text style={styles.typing}>{username} is typing…</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor={colors.textSecondary}
          value={draft}
          onChangeText={onType}
          maxLength={MAX_LEN}
          multiline
        />
        <Pressable onPress={send} disabled={!draft.trim()} style={[styles.sendBtn, !draft.trim() && styles.sendMuted]}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold, width: 40 },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary },
  list: { padding: spacing.lg, gap: spacing.xs },
  bubbleRow: { maxWidth: '80%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubble: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  body: { fontSize: typography.sizes.md, color: colors.textPrimary },
  bodyMine: { color: colors.textOnPrimary },
  receipt: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
  typing: { color: colors.textSecondary, fontStyle: 'italic', paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, fontSize: typography.sizes.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, fontSize: typography.sizes.md },
  sendBtn: { backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.md },
  sendMuted: { backgroundColor: colors.border },
  sendText: { color: colors.textOnPrimary, fontWeight: typography.weights.bold },
});
