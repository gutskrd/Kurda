import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { GiftCard, GiftTier } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { SkeletonList } from '../theme/Skeleton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useChatSocket } from './useChatSocket';
import { useI18n } from '../i18n/I18nContext';
import { MessageContent, hasControls, isCardMessage } from './MessageContent';
import { giftBatchCard, openGift as openGiftApi, withCard, type ChatMessage } from '../gifts/api';
import { useGiftEvents, useOpenChat } from '../gifts/events';
import { GiftPickerSheet } from '../gifts/GiftPickerSheet';
import { GiftSendAnimation } from '../gifts/GiftSendAnimation';
import { GiftUnwrap, type UnwrapTarget } from '../gifts/GiftUnwrap';
import { ReportSheet } from '../reports/ReportSheet';
import { SendErrorNotice } from '../reports/SendError';

const MAX_LEN = 2000;

/**
 * 1:1 conversation thread (KUR-083).
 *
 * A message is what its kind says (chat/MessageContent): words, a gift to
 * unwrap, a game card. The gift button beside the composer gives this friend
 * something; their gifts arrive here wrapped, and `openGift` (the gift banner
 * and its notification) unwraps one as soon as the thread is open. Pressing
 * and holding one of their messages reports it. A send the server refuses
 * says why above the composer — and keeps what was typed.
 */
export function ChatScreen({
  userId,
  username,
  openGift,
  onExit,
}: {
  userId: string;
  /** '' when the way in only knew the id: the thread names them from the messages */
  username: string;
  openGift?: string;
  onExit: () => void;
}) {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const me = user?.id ?? '';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [picking, setPicking] = useState(false);
  const [flying, setFlying] = useState<{ tier: GiftTier; key: number } | null>(null);
  const [unwrapping, setUnwrapping] = useState<UnwrapTarget | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  // the gift the way in asked for, once unwrapped — by id, so a second banner
  // for this same chat (brought forward with a new gift) unwraps that one too
  const autoOpened = useRef<string | null>(null);
  useOpenChat({ kind: 'dm', userId });

  // their name from the conversation when the way in did not bring it
  const name = username || messages.find((m) => m.senderId === userId)?.username || '';
  // the gift picker's one friend, the same array until the friend changes
  const giftFriends = useMemo(() => [{ userId, name }], [userId, name]);

  const markRead = useCallback(() => void client.post(`/chat/${userId}/read`), [client, userId]);

  useEffect(() => {
    let active = true;
    void client.get<{ messages: ChatMessage[] }>(`/chat/${userId}/messages`).then((res) => {
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
          const message = ev.message as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
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

  // their gift to you was opened elsewhere, or yours to them was: draw the card again
  useGiftEvents((ev) => {
    const batchId = ev.batchId;
    if (!messages.some((m) => m.gift?.batchId === batchId)) return;
    if (ev.type === 'gift_received') setMessages((prev) => withCard(prev, ev.card));
    else void giftBatchCard(client, batchId).then((res) => res.ok && setMessages((prev) => withCard(prev, res.data.card)));
  });

  const startUnwrap = useCallback(
    (giftId: string) => {
      const message = messages.find((m) => m.gift?.myGiftId === giftId);
      if (message?.gift) {
        setUnwrapping({ giftId, card: message.gift, fromName: message.username || name });
        return;
      }
      // older than the page the thread loaded: the server has its card
      void openGiftApi(client, giftId).then((res) => {
        if (res.ok) setUnwrapping({ giftId, card: res.data.card, fromName: name });
      });
    },
    [client, messages, name],
  );

  // arrived from the gift banner or its notification: unwrap it once the thread is here
  useEffect(() => {
    if (!openGift || loading || autoOpened.current === openGift) return;
    autoOpened.current = openGift;
    startUnwrap(openGift);
  }, [openGift, loading, startUnwrap]);

  const onType = (text: string) => {
    setDraft(text);
    setSendError(null);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      void client.post(`/chat/${userId}/typing`);
    }
  };

  /** Send words into the thread: null when they went, else the refusal, for whoever asked to say. */
  const post = useCallback(
    async (body: string): Promise<ApiError | null> => {
      const res = await client.post<ChatMessage>(`/chat/${userId}/messages`, { body });
      if (!res.ok) return res.error;
      setMessages((prev) => [...prev, res.data]);
      return null;
    },
    [client, userId],
  );

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setSendError(null);
    const refused = await post(body);
    if (!refused) return;
    // a refused message is put back, so nothing typed is lost
    setSendError(refused);
    setDraft(body);
  }, [draft, post]);

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title={name} onBack={onExit} hairline />

        {loading ? (
          <SkeletonList style={{ marginTop: spacing.md, paddingHorizontal: spacing.lg }} />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const mine = item.senderId === me;
              const card = isCardMessage(item);
              // one element for a screen reader, with Report among its actions, unless it holds a control of its own
              const whole = !hasControls(item);
              // the controls inside a message (a gift, an invite link) report it too
              const report = mine ? undefined : () => setReporting(item.id);
              return (
                <Pressable
                  onLongPress={report}
                  delayLongPress={350}
                  accessible={whole}
                  accessibilityActions={mine || !whole ? undefined : [{ name: 'report', label: t('moderation.report') }]}
                  onAccessibilityAction={() => setReporting(item.id)}
                  style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}
                >
                  {card ? (
                    <MessageContent message={item} mine={mine} senderName={item.username || name} onOpenGift={startUnwrap} onReport={report} />
                  ) : (
                    <View
                      style={[
                        styles.bubble,
                        mine
                          ? { backgroundColor: colors.primary }
                          : { backgroundColor: colors.glassFill, borderWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      <MessageContent message={item} mine={mine} senderName={item.username || name} onOpenGift={startUnwrap} onReport={report} />
                    </View>
                  )}
                  {mine && item.readAt ? <Text style={[styles.receipt, { color: colors.textSecondary }]}>{t('chat.receipt.read')}</Text> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>{t('chat.sayHello')}</Text>}
          />
        )}

        {peerTyping ? <Text style={[styles.typing, { color: colors.textSecondary }]}>{t('chat.typing.one', { name })}</Text> : null}

        <SendErrorNotice error={sendError} onDismiss={() => setSendError(null)} />

        <View style={[styles.inputRow, { borderTopColor: colors.separator }]}>
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={t('gift.button')}
            style={({ pressed }) => [styles.giftBtn, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="gift" size={22} color={colors.gold} />
          </Pressable>
          <TextInput
            style={[styles.input, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
            placeholder={t('chat.messagePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={onType}
            maxLength={MAX_LEN}
            multiline
            accessibilityLabel={t('chat.messagePlaceholder')}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            accessibilityRole="button"
            style={[styles.sendBtn, { backgroundColor: draft.trim() ? colors.primary : colors.controlTrack }]}
          >
            <Text style={[styles.sendText, { color: draft.trim() ? colors.textOnPrimary : colors.textSecondary }]}>{t('chat.send')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {flying ? <GiftSendAnimation key={flying.key} tier={flying.tier} announce={t('gift.sent', { name })} onDone={() => setFlying(null)} /> : null}

      <GiftPickerSheet
        visible={picking}
        chat={{ kind: 'dm', userId }}
        friends={giftFriends}
        onClose={() => setPicking(false)}
        onSent={(result, item) => {
          setPicking(false);
          const sent = result.message;
          if (sent) setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
          setFlying({ tier: item.tier, key: Date.now() });
        }}
      />

      {unwrapping ? (
        <GiftUnwrap
          target={unwrapping}
          onClose={() => setUnwrapping(null)}
          onOpened={(card: GiftCard) => setMessages((prev) => withCard(prev, card))}
          onThanks={() => post(t('gift.thanksMessage'))}
        />
      ) : null}

      <ReportSheet
        visible={reporting !== null}
        target={{ type: 'dm_message', messageId: reporting ?? '' }}
        blockable={{ userId, name: name || null }}
        onClose={() => setReporting(null)}
        // blocked from the report: the conversation is over for you
        onBlocked={() => {
          setReporting(null);
          onExit();
        }}
      />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.xs },
  bubbleRow: { maxWidth: '80%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubble: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  receipt: { fontSize: typography.sizes.xs, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  typing: { fontStyle: 'italic', paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, fontSize: typography.sizes.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  giftBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: MIN_TOUCH_TARGET, flex: 1, maxHeight: 120, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  sendBtn: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.md },
  sendText: { fontWeight: typography.weights.bold },
});
