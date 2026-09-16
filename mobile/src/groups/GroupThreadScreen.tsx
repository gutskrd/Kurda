import { useCallback, useEffect, useState } from 'react';
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
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { SkeletonList } from '../theme/Skeleton';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { useI18n } from '../i18n/I18nContext';
import { groupHistory, markGroupRead, sendToGroup, type GroupMessage } from './api';

const MAX_LEN = 2000;

/**
 * A group channel (KUR-085).
 *
 * The same thread the browser shows, and deliberately the same shape as the DM
 * screen next door — with the one difference a room forces: a message carries
 * who sent it. Two people need no names; twenty do, so the name and the face
 * belong to the message rather than to the header.
 *
 * History pages backwards on `before`, which is the oldest message held. The
 * window is the server's, not ours.
 */
export function GroupThreadScreen({
  groupId,
  name,
  onExit,
}: {
  groupId: string;
  name: string;
  onExit: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const me = user?.id ?? '';

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void groupHistory(client, groupId).then((res) => {
      if (!active) return;
      setLoading(false);
      if (!res.ok) {
        setError(describeError(res.error, t));
        return;
      }
      setMessages(res.data.messages);
      void markGroupRead(client, groupId);
    });
    return () => {
      active = false;
    };
  }, [client, groupId, t]);

  /** Older messages, from the top. The list is inverted, so "end" is the past. */
  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (loadingOlder || exhausted || !oldest) return;
    setLoadingOlder(true);
    const res = await groupHistory(client, groupId, oldest.createdAt);
    setLoadingOlder(false);
    if (!res.ok) return;
    if (res.data.messages.length === 0) {
      setExhausted(true);
      return;
    }
    setMessages((prev) => [...res.data.messages, ...prev]);
  }, [client, groupId, messages, loadingOlder, exhausted]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    const res = await sendToGroup(client, groupId, body);
    if (res.ok) setMessages((prev) => [...prev, res.data]);
    // the draft is already gone, so a failure has to say so or the message
    // simply vanishes
    else setError(describeError(res.error, t));
  }, [client, draft, groupId, t]);

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: colors.glassBorder, paddingTop: topInset }]}>
          <Pressable onPress={onExit} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.close, { color: colors.primary }]}>‹ {t('common.back')}</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <SkeletonList style={{ marginTop: spacing.md, paddingHorizontal: spacing.lg }} />
        ) : (
          <FlatList
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingOlder ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null
            }
            renderItem={({ item }) => <Bubble message={item} mine={item.senderId === me} />}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>{t('groups.sayHello')}</Text>}
          />
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={[styles.inputRow, { borderTopColor: colors.glassBorder }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
            placeholder={t('chat.messagePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={setDraft}
            maxLength={MAX_LEN}
            multiline
            accessibilityLabel={t('chat.messagePlaceholder')}
          />
          <Pressable onPress={send} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('chat.send')}>
            <Text style={[styles.send, { color: draft.trim() ? colors.primary : colors.textSecondary }]}>
              {t('chat.send')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

/**
 * A deleted message keeps its place. Removing the row instead would renumber
 * the conversation around whoever was moderated, which reads as though nothing
 * happened — and the person who was replying to it is left talking to nobody.
 */
function Bubble({ message, mine }: { message: GroupMessage; mine: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      {!mine ? (
        <InitialsAvatar name={message.username} id={message.senderId} size={28} photoUrl={message.avatarUrl} />
      ) : null}
      <View style={styles.bubbleMain}>
        {!mine ? <Text style={[styles.sender, { color: colors.textSecondary }]}>{message.username}</Text> : null}
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: colors.primary }
              : { backgroundColor: colors.glassFill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
          ]}
        >
          {message.deleted ? (
            <View style={styles.deletedRow}>
              <Icon name="close" size={13} tone="secondary" />
              <Text style={[styles.deleted, { color: mine ? colors.textOnPrimary : colors.textSecondary }]}>
                {t('groups.messageDeleted')}
              </Text>
            </View>
          ) : (
            <Text style={[styles.body, { color: mine ? colors.textOnPrimary : colors.textPrimary }]}>{message.body}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: { fontSize: typography.sizes.md },
  title: { flex: 1, textAlign: 'center', fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  list: { padding: spacing.lg, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: '86%' },
  rowMine: { alignSelf: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubbleMain: { flexShrink: 1 },
  sender: { fontSize: typography.sizes.xs, marginBottom: 2, marginLeft: spacing.xs },
  bubble: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg },
  body: { fontSize: typography.sizes.md },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  deleted: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  empty: { textAlign: 'center', marginTop: spacing.xl, transform: [{ scaleY: -1 }] },
  error: { textAlign: 'center', fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    fontSize: typography.sizes.md,
  },
  send: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, paddingHorizontal: spacing.sm },
});
