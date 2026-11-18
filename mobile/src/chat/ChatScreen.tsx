import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import type { GiftCard, GiftTier } from '@kurda/shared';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { haptic } from '../feedback/haptics';
import type { ApiError } from '../api/types';
import { describeError, isMaintenance, notReached } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, lineOf } from '../theme/Skeleton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { showActions } from '../theme/actionSheet';
import { useBlock } from '../social/blocks';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { MessageField } from './SendButton';
import { Avatar } from '../profile/Avatar';
import { useChatSocket } from './useChatSocket';
import { useI18n } from '../i18n/I18nContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { DmWelcome } from './DmWelcome';
import { MessageRow, type RowMessage } from './MessageRow';
import { JumpToLatest, useAwayFromLatest, useUnseenBelow } from './ThreadParts';
import { TypingBubble } from './TypingBubble';
import { useTypingSignal, useTypingWatch } from './typing';
import { placeMessages } from './thread';
import { giftBatchCard, openGift as openGiftApi, withCard, type ChatMessage } from '../gifts/api';
import { useGiftEvents, useOpenChat } from '../gifts/events';
import { GiftPickerSheet } from '../gifts/GiftPickerSheet';
import { GiftSendAnimation } from '../gifts/GiftSendAnimation';
import { GiftUnwrap, type UnwrapTarget } from '../gifts/GiftUnwrap';
import { ReportSheet } from '../reports/ReportSheet';
import { SendErrorNotice } from '../reports/SendError';
import { ChatGameButton } from '../play/ChatGameButton';
import { appendOnce, mergeLatest, useCatchUp } from '../realtime/catchUp';
import { restoredDraft, useOutgoing } from './sending';

const MAX_LEN = 2000;
/** The face beside the name in the header: big enough to know them by, small enough for a bar. */
const HEADER_FACE = 28;

/** The online dot on the header face, and the ring that separates it from the face. */
const ONLINE_DOT = 10;

/**
 * A one-to-one conversation, drawn as it is read (chat/MessageRow.tsx, chat/thread.ts), with a typing bubble, a
 * back-to-newest button counting new messages, and a suggested first hello when empty. Messages render by kind
 * (chat/MessageContent); the composer's gift button sends a gift, and `openGift` unwraps one on open. Holding
 * their message reports it. Your messages say whether they were sent, delivered or read, as on the website. Sends show
 * at once as pending (chat/sending.ts): one the server was not reached for stays as "Not sent" with Try again and
 * Cancel; a refused one is removed, its text restored and the reason shown. A failed load shows a retry rather than
 * an empty thread.
 */
export function ChatScreen({
  userId,
  username,
  openGift,
  onExit,
}: {
  userId: string;
  /** '' when the way in only knew the id: the thread names them from the messages. */
  username: string;
  openGift?: string;
  onExit: () => void;
}) {
  const { client, user } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const blockNow = useBlock();
  // In Soranî and Arabic the thread is mirrored: your words on the left, and the composer's Send too.
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const bottom = useScreenBottomInset(spacing.md);
  const me = user?.id ?? '';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  // The conversation failed to load: say so with a retry rather than looking like one nobody has written in.
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [picking, setPicking] = useState(false);
  const [flying, setFlying] = useState<{ tier: GiftTier; key: number } | null>(null);
  const [unwrapping, setUnwrapping] = useState<UnwrapTarget | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  // The header's report: about the person, not one message.
  const [reportingPerson, setReportingPerson] = useState(false);
  // Their picture and presence: the conversation list knows both, the thread's own messages neither.
  const [other, setOther] = useState<{ avatarUrl: string | null; online: boolean } | null>(null);
  const list = useRef<FlatList<ShownMessage>>(null);
  const { away, onScroll } = useAwayFromLatest();
  const { typing, note: noteTyping } = useTypingWatch();
  const signalTyping = useTypingSignal(useCallback(() => void client.post(`/chat/${userId}/typing`), [client, userId]));
  // The gift the entry point asked for, once unwrapped, by id, so a second banner for this chat (with a new gift)
  // unwraps that one too.
  const autoOpened = useRef<string | null>(null);
  useOpenChat({ kind: 'dm', userId });

  // Their name from the conversation when the way in did not bring it.
  const name = username || messages.find((m) => m.senderId === userId)?.username || '';
  // The gift picker's one friend, the same array until the friend changes.
  const giftFriends = useMemo(() => [{ userId, name }], [userId, name]);
  // The messages sent from here that the server has not answered for yet.
  const { outgoing, begin, settle, keyOf, hold, resend, discard } = useOutgoing();
  // The thread as it is read, oldest first, with what is still on its way, or did not go, after what the server has.
  const thread = useMemo<ShownMessage[]>(
    () => [
      ...messages,
      ...outgoing.map((m): ShownMessage => ({ ...m, senderId: me, kind: 'text', gift: null, game: null, pending: m.failed ? 'failed' : 'sending' })),
    ],
    [messages, outgoing, me],
  );
  // Newest first, for the inverted list below — once per change to the thread, not per keystroke.
  const newestFirst = useMemo<ShownMessage[]>(() => [...thread].reverse(), [thread]);
  // Where each message sits: its day, its place in its run, whether it says the time.
  const places = useMemo(
    () => placeMessages(thread, new Date(), { locale, today: t('chat.day.today'), yesterday: t('chat.day.yesterday'), earlier: t('chat.day.earlier') }),
    [thread, locale, t],
  );
  const unseen = useUnseenBelow(messages, away, me);
  const toLatest = useCallback(() => list.current?.scrollToOffset({ offset: 0, animated: !reduce }), [reduce]);

  const markRead = useCallback(() => void client.post(`/chat/${userId}/read`), [client, userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void client.get<{ messages: ChatMessage[] }>(`/chat/${userId}/messages`).then((res) => {
      if (!active) return;
      if (res.ok) {
        setMessages(res.data.messages);
        setLoadError(null);
        markRead();
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // A retry reads the conversation again.
  }, [client, userId, markRead, attempt]);

  useEffect(() => {
    let active = true;
    void client.get<{ conversations: { userId: string; avatarUrl?: string | null; online?: boolean }[] }>('/chat/conversations').then((res) => {
      if (!active || !res.ok) return;
      const found = res.data.conversations.find((c) => c.userId === userId);
      if (found) setOther({ avatarUrl: found.avatarUrl ?? null, online: found.online === true });
    });
    return () => {
      active = false;
    };
  }, [client, userId]);

  // What arrived while the connection was away, and the card of a game started from here.
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
        } else if ((ev.type === 'dm_read' || ev.type === 'dm_delivered') && ev.by === userId) {
          const field = ev.type === 'dm_read' ? 'readAt' : 'deliveredAt';
          const now = new Date().toISOString();
          setMessages((prev) => prev.map((m) => (m.senderId === me && !m[field] ? { ...m, [field]: now } : m)));
        } else if (ev.type === 'dm_typing' && ev.from === userId) {
          noteTyping(name);
        }
      },
      [userId, me, markRead, noteTyping, name],
    ),
  );

  // Their gift to you, or yours to them, was opened elsewhere: redraw the card.
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
      // Older than the page the thread loaded: the server has its card.
      void openGiftApi(client, giftId).then((res) => {
        if (res.ok) setUnwrapping({ giftId, card: res.data.card, fromName: name });
        // A gift that cannot be opened now says so, rather than the tap doing nothing.
        else if (!isMaintenance(res.error)) Alert.alert(t('error.generic'), describeError(res.error, t));
      });
    },
    [client, messages, name, t],
  );

  // Arrived from the gift banner or its notification: unwrap it once the thread is here.
  useEffect(() => {
    if (!openGift || loading || autoOpened.current === openGift) return;
    autoOpened.current = openGift;
    startUnwrap(openGift);
  }, [openGift, loading, startUnwrap]);

  const onType = (text: string) => {
    setDraft(text);
    setSendError(null);
    signalTyping();
  };

  /**
   * Send words into the thread: null when they went, or when the server was not reached and they wait in the thread
   * as not sent; else the refusal, for whoever asked to say. `again` is a not-sent message being tried again.
   */
  const post = useCallback(
    async (body: string, again?: string): Promise<ApiError | null> => {
      // In the thread at once, as one on its way; the server's copy takes its place, or it is taken out.
      const sending = again ?? begin(body);
      const res = await client.post<ChatMessage>(`/chat/${userId}/messages`, { body });
      if (!res.ok && notReached(res.error)) {
        hold(sending);
        haptic('error');
        return null;
      }
      settle(sending, res.ok ? res.data.id : undefined);
      if (!res.ok) return res.error;
      setMessages((prev) => appendOnce(prev, res.data));
      return null;
    },
    [client, userId, begin, settle, hold],
  );

  // The person, not one message: their profile, a report, or a block.
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
                // Blocked: the conversation is over for you at once; a refusal is said wherever you are.
                onPress: () => {
                  blockNow(userId);
                  onExit();
                },
              },
            ]),
        },
      ],
    });
  }, [blockNow, name, navigation, onExit, t, userId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setSendError(null);
    // Felt as it goes; and if it did not go, felt again as an error — it is in the way.
    haptic('tap');
    // Sending scrolls back down to the newest message, wherever you were reading.
    toLatest();
    const refused = await post(body);
    if (!refused) return;
    haptic('error');
    // A refused message is put back, before anything typed since, so nothing typed is lost.
    setSendError(refused);
    setDraft((now) => restoredDraft(body, now));
  }, [draft, post, toLatest]);

  /** Try again: the not-sent message goes once more; refused this time, its words come back as a fresh send's do. */
  const retry = useCallback(
    async (id: string) => {
      const body = resend(id);
      if (!body) return;
      setSendError(null);
      const refused = await post(body, id);
      if (!refused) return;
      haptic('error');
      setSendError(refused);
      setDraft((now) => restoredDraft(body, now));
    },
    [post, resend],
  );

  /** Cancel: the not-sent message leaves the thread, its words back in the field unless something is typed there. */
  const cancel = useCallback(
    (id: string) => {
      const words = discard(id);
      if (words) setDraft((now) => now || words);
    },
    [discard],
  );

  /** A greeting from the welcome, sent as it is: the first message of the conversation. */
  const greet = useCallback(
    async (greeting: string) => {
      setSendError(null);
      haptic('tap');
      const refused = await post(greeting);
      if (!refused) return;
      haptic('error');
      setSendError(refused);
    },
    [post],
  );

  // Their picture: the conversation list's, or the one their own messages carry.
  const face = other?.avatarUrl ?? messages.find((m) => m.senderId === userId)?.avatarUrl ?? null;

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Report and block at the top of the conversation, about the person, as well as on a held message about that message. */}
        <ScreenHeader
          title={name}
          titleAvatar={
            <View>
              <Avatar name={name} size={HEADER_FACE} photoUrl={face} />
              {/* Online now: a green dot on the face, ringed in the page colour so it reads on any picture. */}
              {other?.online ? <View style={[styles.online, { backgroundColor: colors.success, borderColor: colors.background }]} testID="header-online" /> : null}
            </View>
          }
          onTitlePress={() => navigation.navigate('UserProfile', { userId })}
          titleHint={t('chat.viewProfile')}
          onBack={onExit}
          hairline
          right={
            <HeaderButton icon="more" label={t('chat.moreAbout', { name })} onPress={personMenu} />
          }
        />

        {loading ? (
          <ThreadSkeleton mirrored={mirrored} />
        ) : loadError && messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.welcome}>
            <ErrorRetry message={describeError(loadError, t)} onRetry={() => setAttempt((n) => n + 1)} style={styles.failed} />
          </ScrollView>
        ) : thread.length === 0 ? (
          // Nothing said yet: who it is with, and a first hello to send.
          <ScrollView contentContainerStyle={styles.welcome} keyboardShouldPersistTaps="handled">
            <DmWelcome name={name} photoUrl={face} onGreet={(greeting) => void greet(greeting)} />
            <TypingBubble names={typing} face={{ id: userId, name, photoUrl: face }} />
          </ScrollView>
        ) : (
          <View style={styles.flex}>
            {/* Newest at the bottom and opening there: an inverted list, as a club's thread is, so new replies land in view. */}
            <FlatList
              ref={list}
              data={newestFirst}
              inverted
              keyExtractor={(m) => keyOf(m.id)}
              contentContainerStyle={styles.list}
              onScroll={onScroll}
              scrollEventThrottle={64}
              // Under the newest message, where theirs is about to land (an inverted list's header is its foot).
              ListHeaderComponent={<TypingBubble names={typing} face={{ id: userId, name, photoUrl: face }} />}
              renderItem={({ item }) => {
                const mine = item.senderId === me;
                return (
                  <MessageRow
                    message={item}
                    mine={mine}
                    place={places.get(item.id) ?? LONE}
                    senderName={item.username || name}
                    receipt={mine && !item.pending ? t(item.readAt ? 'chat.receipt.read' : item.deliveredAt ? 'chat.receipt.delivered' : 'chat.receipt.sent') : null}
                    onOpenGift={startUnwrap}
                    // The controls inside a message (a gift, an invite link) report it too.
                    onReport={mine ? undefined : () => setReporting(item.id)}
                    onRetry={() => void retry(item.id)}
                    onDiscard={() => cancel(item.id)}
                  />
                );
              }}
            />
            {away ? <JumpToLatest unseen={unseen} onPress={toLatest} /> : null}
          </View>
        )}

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
          <MessageField value={draft} onChangeText={onType} onSend={() => void send()} maxLength={MAX_LEN} />
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
        // Blocked from the report: the conversation is over for you.
        onBlocked={() => {
          setReporting(null);
          onExit();
        }}
      />
    </GradientBackground>
  );
}

/**
 * The loading placeholder: grey bubbles, theirs at the start and yours at the end, sitting on the composer since
 * the thread opens at its foot.
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
        <View key={i} style={[styles.skeletonRow, mine !== mirrored ? styles.rowEnd : styles.rowStart, { width: `${Math.round(share * 100)}%` }]}>
          <Skeleton height={BUBBLE_LINE} radius={radii.lg} />
        </View>
      ))}
    </View>
  );
}

/** A message in the thread: the server's, or one sent from here still awaiting its answer. */
type ShownMessage = RowMessage;

/** A message the thread has not placed yet (it arrived between two draws): a bubble on its own. */
const LONE = { day: null, first: true, last: true, timed: false } as const;

/** A one-line bubble: 9 above and below a 17pt line. */
const BUBBLE_LINE = 18 + lineOf(typography.sizes.md);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeletonThread: { justifyContent: 'flex-end', overflow: 'hidden', gap: spacing.sm },
  skeletonRow: { maxWidth: '86%' },
  screen: { flex: 1 },
  // The runs keep their own distance (chat/MessageRow.tsx); the tails reach a little into the margin.
  list: { paddingHorizontal: spacing.md - 4, paddingVertical: spacing.md },
  welcome: { flexGrow: 1 },
  // The error in the middle of what the thread would fill.
  failed: { flexGrow: 1, justifyContent: 'center' },
  // Your own words at the end of the line and theirs at its start, whichever side that is.
  rowEnd: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowStart: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  online: { position: 'absolute', right: -2, bottom: -2, width: ONLINE_DOT, height: ONLINE_DOT, borderRadius: radii.pill, borderWidth: 2 },
  // The buttons stay by the last line as a long message grows the field upwards.
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // A plain glyph beside the field, as the tools by a message field are; the touch is still 44pt.
  giftBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
