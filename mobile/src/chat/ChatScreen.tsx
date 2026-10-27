import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { haptic } from '../feedback/haptics';
import type { ApiError } from '../api/types';
import { describeError, isMaintenance } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, lineOf } from '../theme/Skeleton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { showActions } from '../theme/actionSheet';
import { blockUser } from '../social/blocks';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { COMPOSER_FIELD, SendButton } from './SendButton';
import { messageA11y, openMessageOptions } from './messageOptions';
import { InitialsAvatar } from '../profile/InitialsAvatar';
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
import { ChatGameButton } from '../play/ChatGameButton';
import { appendOnce, mergeLatest, useCatchUp } from '../realtime/catchUp';

const MAX_LEN = 2000;
/** The face beside the name in the header: big enough to know them by, small enough for a bar. */
const HEADER_FACE = 28;

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
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  // in Soranî and Arabic the thread is mirrored: your own words on the left, the composer's Send on the left too
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const bottom = useScreenBottomInset(spacing.md);
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
  // the header's report: about the person, not one message
  const [reportingPerson, setReportingPerson] = useState(false);
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
  // newest first, for the inverted list below — once per change to the thread, not per keystroke
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);

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

  // what arrived while the connection was away, and the card of a game started from here
  useCatchUp(
    useCallback(() => {
      void client.get<{ messages: ChatMessage[] }>(`/chat/${userId}/messages`).then((res) => {
        if (!res.ok) return;
        setMessages((prev) => mergeLatest(prev, res.data.messages));
        markRead();
      });
    }, [client, userId, markRead]),
  );

  useChatSocket(
    useCallback(
      (ev) => {
        if (ev.type === 'dm' && ev.from === userId && ev.message) {
          setMessages((prev) => appendOnce(prev, ev.message as ChatMessage));
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
      setMessages((prev) => appendOnce(prev, res.data));
      return null;
    },
    [client, userId],
  );

  // the person, not one message: their profile, a report, or a block
  const personMenu = useCallback(() => {
    showActions({
      title: name,
      cancel: t('common.cancel'),
      actions: [
        { label: t('chat.viewProfile'), onPress: () => navigation.navigate('UserProfile', { userId }) },
        { label: t('report.title.named', { name }), onPress: () => setReportingPerson(true) },
        {
          label: t('report.done.block', { name }),
          destructive: true,
          onPress: () =>
            Alert.alert(t('moderation.blockWhoTitle', { name }), t('moderation.blockNote'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('moderation.block'),
                style: 'destructive',
                // blocked: the conversation is over for you
                onPress: () =>
                  void blockUser(client, userId).then((res) => {
                    if (res.ok) onExit();
                    else if (!isMaintenance(res.error)) Alert.alert(describeError(res.error, t));
                  }),
              },
            ]),
        },
      ],
    });
  }, [client, name, navigation, onExit, t, userId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setSendError(null);
    // felt as it goes; and if it did not go, felt again as an error — it is in the way
    haptic('tap');
    const refused = await post(body);
    if (!refused) return;
    haptic('error');
    // a refused message is put back, so nothing typed is lost
    setSendError(refused);
    setDraft(body);
  }, [draft, post]);

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/*
          Report and block where anybody would look for them: at the top of
          the conversation, about the person, as well as on a held message
          about that message.
        */}
        <ScreenHeader
          title={name}
          titleAvatar={<InitialsAvatar name={name} id={userId} size={HEADER_FACE} />}
          onTitlePress={() => navigation.navigate('UserProfile', { userId })}
          titleHint={t('chat.viewProfile')}
          onBack={onExit}
          hairline
          right={
            <HeaderButton icon="more" label={t('chat.moreAbout', { name })} onPress={personMenu} edge="end" />
          }
        />

        {loading ? (
          <ThreadSkeleton mirrored={mirrored} />
        ) : (
          /*
           * Newest at the bottom, and the thread opens there: inverted, as a
           * club's thread is. Drawn top-down it opened on the oldest message
           * of the page, and a reply arriving — or the one just sent — landed
           * below the fold.
           */
          <FlatList
            data={newestFirst}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const mine = item.senderId === me;
              const card = isCardMessage(item);
              // one element for a screen reader, with Copy and Report among its actions, unless it holds a control of its own
              const whole = !hasControls(item);
              // the controls inside a message (a gift, an invite link) report it too
              const report = mine ? undefined : () => setReporting(item.id);
              // held, a message offers its words to copy and, if it is someone else's, a report
              const options = { words: card ? null : item.body, onReport: report };
              return (
                <Pressable
                  onLongPress={() => openMessageOptions(t, options)}
                  delayLongPress={350}
                  accessible={whole}
                  {...(whole ? messageA11y(t, options) : null)}
                  style={({ pressed }) => [styles.bubbleRow, mine !== mirrored ? styles.rowEnd : styles.rowStart, pressed && styles.held]}
                >
                  {card ? (
                    <MessageContent message={item} mine={mine} senderName={item.username || name} onOpenGift={startUnwrap} onReport={report} />
                  ) : (
                    <View
                      style={[
                        styles.bubble,
                        mine
                          ? { backgroundColor: colors.primary }
                          : // a soft fill, no edge: the hairline had no colour of its own and drew black
                  { backgroundColor: colors.controlTrack },
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

        {peerTyping ? <Text style={[styles.typing, dir.text, { color: colors.textSecondary }]}>{t('chat.typing.one', { name })}</Text> : null}

        <SendErrorNotice error={sendError} onDismiss={() => setSendError(null)} />

        <View style={[styles.inputRow, { flexDirection: dir.row, paddingBottom: bottom, borderTopColor: colors.separator }]}>
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={t('gift.button')}
            style={({ pressed }) => [styles.giftBtn, pressed && { backgroundColor: colors.controlTrack }]}
          >
            <Icon name="gift" size={22} color={colors.goldText} />
          </Pressable>
          <ChatGameButton target={{ kind: 'dm', friendId: userId }} />
          <TextInput
            style={[styles.input, dir.free, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
            placeholder={t('chat.messagePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={onType}
            maxLength={MAX_LEN}
            multiline
            accessibilityLabel={t('chat.messagePlaceholder')}
          />
          <SendButton ready={draft.trim().length > 0} onPress={() => void send()} />
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
        visible={reportingPerson}
        target={{ type: 'user', userId }}
        name={name || undefined}
        blockable={{ userId, name: name || null }}
        onClose={() => setReportingPerson(false)}
        onBlocked={() => {
          setReportingPerson(false);
          onExit();
        }}
      />
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

/**
 * The thread while it loads: bubbles in grey, theirs at the start and yours
 * at the end, sitting on the composer the way the newest messages do — the
 * thread opens at its foot, so that is where the grey is.
 */
function ThreadSkeleton({ mirrored }: { mirrored: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const shape: Array<[boolean, number]> = [
    [false, 0.62],
    [false, 0.4],
    [true, 0.55],
    [false, 0.7],
    [true, 0.34],
    [true, 0.6],
    [false, 0.48],
  ];
  return (
    <View style={[styles.flex, styles.list, styles.skeletonThread]} accessibilityLabel={t('common.loading')}>
      {shape.map(([mine, share], i) => (
        <View key={i} style={[styles.bubbleRow, mine !== mirrored ? styles.rowEnd : styles.rowStart, { width: `${Math.round(share * 100)}%` }]}>
          <Skeleton height={BUBBLE_LINE} radius={radii.md} />
        </View>
      ))}
    </View>
  );
}

/** a one-line bubble: 8 above and below a 17pt line */
const BUBBLE_LINE = spacing.sm * 2 + lineOf(typography.sizes.md);

const styles = StyleSheet.create({
  // a held message sinks a little under the finger, so the hold is felt to be doing something
  held: { transform: [{ scale: 0.97 }] },
  flex: { flex: 1 },
  skeletonThread: { justifyContent: 'flex-end', overflow: 'hidden' },
  screen: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.xs },
  bubbleRow: { maxWidth: '80%' },
  // your own words at the end of the line and theirs at its start, whichever side that is
  rowEnd: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowStart: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  receipt: { fontSize: typography.sizes.xs, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  typing: { fontStyle: 'italic', paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, fontSize: typography.sizes.sm },
  // the buttons stay by the last line as a long message grows the field upwards
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // a plain glyph beside the field, as the tools by a message field are; the touch is still 44pt
  giftBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  input: COMPOSER_FIELD,
});
