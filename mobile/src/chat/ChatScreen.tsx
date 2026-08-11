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
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
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
  const { colors } = useTheme();
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
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: colors.glassBorder }]}>
          <Pressable onPress={onExit} hitSlop={10}><Text style={[styles.close, { color: colors.primary }]}>‹ Back</Text></Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{username}</Text>
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
                  <View
                    style={[
                      styles.bubble,
                      mine
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.glassFill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
                    ]}
                  >
                    <Text style={[styles.body, { color: mine ? colors.textOnPrimary : colors.textPrimary }]}>{item.body}</Text>
                  </View>
                  {mine && item.readAt ? <Text style={[styles.receipt, { color: colors.textSecondary }]}>Read</Text> : null}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>Say hello</Text>}
          />
        )}

        {peerTyping ? <Text style={[styles.typing, { color: colors.textSecondary }]}>{username} is typing…</Text> : null}

        <View style={[styles.inputRow, { borderTopColor: colors.glassBorder }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
            placeholder="Message…"
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={onType}
            maxLength={MAX_LEN}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            style={[styles.sendBtn, { backgroundColor: draft.trim() ? colors.primary : colors.controlTrack }]}
          >
            <Text style={[styles.sendText, { color: draft.trim() ? colors.textOnPrimary : colors.textSecondary }]}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, width: 40 },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  list: { padding: spacing.lg, gap: spacing.xs },
  bubbleRow: { maxWidth: '80%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubble: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  body: { fontSize: typography.sizes.md },
  receipt: { fontSize: typography.sizes.xs, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  typing: { fontStyle: 'italic', paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, fontSize: typography.sizes.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  sendBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.md },
  sendText: { fontWeight: typography.weights.bold },
});
