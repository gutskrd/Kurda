import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { canModerateGroup, type GiftCard, type GiftTier, type GroupChatCleared } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { EmptyState } from '../theme/EmptyState';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GroupAvatar } from './GroupAvatar';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { MessageField } from '../chat/SendButton';
import { useI18n } from '../i18n/I18nContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { RUN_FACE } from '../chat/Bubble';
import { MessageRow } from '../chat/MessageRow';
import { JumpToLatest, useAwayFromLatest, useUnseenBelow } from '../chat/ThreadParts';
import { TypingBubble } from '../chat/TypingBubble';
import { placeMessages } from '../chat/thread';
import { groupDetail, groupHistory, markGroupRead, sendGroupTyping, sendToGroup, type GroupDetail, type GroupMessage } from './api';
import { useRoomEvents } from '../realtime/useRoomEvents';
import { useTypingSignal, useTypingWatch } from '../chat/typing';
import { giftBatchCard, openGift as openGiftApi, withCard, type ChatMessage } from '../gifts/api';
import { useGiftEvents, useOpenChat } from '../gifts/events';
import { GiftPickerSheet, skippedText, type GiftFriend } from '../gifts/GiftPickerSheet';
import { GiftSendAnimation } from '../gifts/GiftSendAnimation';
import { GiftUnwrap, type UnwrapTarget } from '../gifts/GiftUnwrap';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { SendErrorNotice } from '../reports/SendError';
import { restrictionOf } from '../reports/sendErrors';
import { ChatGameButton } from '../play/ChatGameButton';
import { appendOnce, mergeLatest, useCatchUp } from '../realtime/catchUp';
import { restoredDraft, useOutgoing } from '../chat/sending';
import { showActions } from '../theme/actionSheet';
import { afterClear, clearedSince, clearedView, useClearChat, useClearedHere } from './clearing';
import { ClearedLine, WelcomeCard } from './Welcome';
import { StandingCard, type Banned } from './Standing';
import { AddFriendsSheet } from './AddFriendsSheet';
import { Loading } from '../theme/Loading';
import { heldDim } from '../theme/MotionParts';

const MAX_LEN = 2000;

type Message = Omit<GroupMessage, 'body'> & ChatMessage & {
  /** sent from here and not yet answered for by the server (chat/sending.ts) */
  pending?: boolean;
};

/** A refusal that means the reader is not in the group (any more): removed, banned, or never in it. */
const isOutside = (error: ApiError): boolean => error.code === 'NOT_A_MEMBER' || error.code === 'GROUP_BANNED';

/** The group's own page refused as not found: deleted, or private and the reader is neither in it nor banned from it. */
const isMissing = (error: ApiError): boolean => error.code === 'GROUP_NOT_FOUND' || error.status === 404;

/**
 * The ban a refusal tells of, when the group's page did not say: until when,
 * from the refusal itself. Null for any other refusal.
 */
function bannedFrom(error: ApiError): Banned | null {
  if (error.code !== 'GROUP_BANNED') return null;
  const until = (error.details as { until?: unknown } | undefined)?.until;
  return { kind: 'banned', until: typeof until === 'string' ? until : null, reason: null, request: { kind: 'can_ask' } };
}

/**
 * A group channel (KUR-085).
 *
 * The same thread the browser shows, and deliberately the same shape as the DM
 * screen next door (both draw chat/MessageRow.tsx) — with the one difference
 * a room forces: a message carries who sent it. Two people need no names;
 * twenty do, so each run of one member's messages has their name over it and
 * their face at its foot. Whoever is writing shows as a bubble of dots under
 * the newest message, with their name over it.
 *
 * History pages backwards on `before`, which is the oldest message held. The
 * window is the server's, not ours.
 *
 * Gifts: the gift button gives something to your friends among the members
 * (only friends can be given anything); a gift posted here reaches the room
 * as a card that is nobody's in particular, and each recipient's own card —
 * theirs to unwrap — comes on their own channel (`gift_received`) and is
 * swapped in. When one is opened the room is told (`group_msg_gift_opened`)
 * and the card is fetched again, since it is drawn per viewer.
 *
 * Pressing and holding a message offers its options (Copy, and Report for
 * someone else's). The ⋯ in the header clears the chat — for the reader, or,
 * as its owner or an admin, for everyone — and reports the group.
 *
 * An empty chat welcomes (Welcome.tsx); a chat an admin cleared says so at
 * the top of its history. A group made a moment ago opens with the sheet for
 * adding friends up (`addFriends`), since nobody else is in it until its
 * owner brings them.
 *
 * A group is private, so only its members see it here. Someone removed or
 * banned while it is open finds, at the next read or send, where they stand
 * in place of the chat (Standing.tsx), never a raw error; someone banned who
 * opens it sees the same card. Anyone else is told there is no such group,
 * which is all the server tells them.
 */
export function GroupThreadScreen({
  groupId,
  name: nameParam,
  openGift,
  addFriends = false,
  onExit,
  onOpenMembers,
  onLeft,
  onFindPeople,
}: {
  groupId: string;
  /** '' when the way in only knew the id: looked up */
  name: string;
  openGift?: string;
  /** open with the add-friends sheet up: the group was made a moment ago */
  addFriends?: boolean;
  onExit: () => void;
  onOpenMembers: () => void;
  /** left the group from a report's done screen */
  onLeft: () => void;
  /** to where people are found, from the add-friends sheet of someone with no friends yet */
  onFindPeople: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  // mirrored in Soranî and Arabic, as a chat with one friend is
  const dir = useDirection();
  const bottom = useScreenBottomInset(spacing.md);
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const me = user?.id ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  // what the room's listener (made once) reads: the messages held now
  const held = useRef<Message[]>([]);
  held.current = messages;
  // the messages sent from here that the server has not answered for yet, drawn after the ones it has
  const { outgoing, begin, settle, echoed } = useOutgoing();
  const thread = useMemo<Message[]>(
    () => [
      ...messages,
      ...outgoing.map(
        (m): Message => ({ ...m, senderId: me, username: user?.username ?? '', avatarUrl: null, deleted: false, kind: 'text', gift: null, game: null, pending: true }),
      ),
    ],
    [messages, outgoing, me, user?.username],
  );
  // newest first, for the inverted list — once per change to the thread, not per keystroke
  const newestFirst = useMemo<Message[]>(() => [...thread].reverse(), [thread]);
  // where each message sits: its day, its place in its run, whether it says the time
  const places = useMemo(
    () => placeMessages(thread, new Date(), { locale, today: t('chat.day.today'), yesterday: t('chat.day.yesterday'), earlier: t('chat.day.earlier') }),
    [thread, locale, t],
  );
  const list = useRef<FlatList<Message>>(null);
  const { away, onScroll } = useAwayFromLatest();
  const unseen = useUnseenBelow(messages, away, me);
  const toLatest = useCallback(() => list.current?.scrollToOffset({ offset: 0, animated: !reduce }), [reduce]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [name, setName] = useState(nameParam);
  // null until the club says: its menu waits rather than flash a report button at its owner
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [cleared, setCleared] = useState<GroupChatCleared | null>(null);
  // a read or a send refused because the reader is not in the group; `left` when they were in it as this screen showed it
  const [outside, setOutside] = useState<{ left: boolean; error: ApiError } | null>(null);
  // the group's own page answered that there is no such group for this reader
  const [missing, setMissing] = useState(false);
  // false once the server said the reader may not post here (muted, restricted): the greetings go
  const [canPost, setCanPost] = useState(true);
  const [addingFriends, setAddingFriends] = useState(addFriends);
  // asks for the history again: when the reader turns out to be back in the group the card said they were out of
  const [reloadKey, setReloadKey] = useState(0);
  const outsideNow = useRef(false);
  outsideNow.current = outside !== null;
  const readOnce = useRef(false);
  const [friends, setFriends] = useState<GiftFriend[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [flying, setFlying] = useState<{ tier: GiftTier; count: number; key: number } | null>(null);
  // a group gift that reached some of them: who it did not reach, and why
  const [giftNote, setGiftNote] = useState<string | null>(null);
  const [unwrapping, setUnwrapping] = useState<UnwrapTarget | null>(null);
  const [reporting, setReporting] = useState<{ target: ReportTarget; senderId?: string; sender?: string } | null>(null);
  const { typing, note } = useTypingWatch();
  // a recipient's own card can arrive before the room's message does
  const pendingCards = useRef(new Map<string, GiftCard>());
  // by id, as in the DM thread: a second gift here from a banner unwraps too
  const autoOpened = useRef<string | null>(null);
  useOpenChat({ kind: 'group', groupId });

  /**
   * The group's name, picture, roster and where the reader stands with it —
   * asked each time the thread comes back into view, so a rename made on its
   * info page shows here at once, and again when a refusal says the reader
   * is out of it. "Not found" is an answer too: what was read before is kept,
   * for the name and picture of a group they were just taken out of.
   */
  const loadDetail = useCallback(() => {
    let active = true;
    void groupDetail(client, groupId).then((res) => {
      if (!active) return;
      if (!res.ok) {
        if (isMissing(res.error)) {
          setMissing(true);
          // read as a member a moment ago, and now there is no such group for them: taken out (or the group is gone)
          if (readOnce.current) setOutside((was) => was ?? { left: true, error: res.error });
        }
        return;
      }
      setMissing(false);
      setDetail(res.data);
      setName(res.data.name);
      // a member again (added back, or a request approved) while the card stood in for the chat: the chat returns
      if (res.data.myRole && outsideNow.current) {
        setOutside(null);
        setLoading(true);
        setReloadKey((k) => k + 1);
      }
    });
    return () => {
      active = false;
    };
  }, [client, groupId]);
  useFocusEffect(loadDetail);

  /** Not in the group (any more): the chat gives way to where the reader stands. */
  const goOutside = useCallback(
    (refusal: ApiError) => {
      setOutside({ left: readOnce.current, error: refusal });
      loadDetail();
    },
    [loadDetail],
  );

  useEffect(() => {
    let active = true;
    void groupHistory(client, groupId).then((res) => {
      if (!active) return;
      setLoading(false);
      if (!res.ok) {
        if (isOutside(res.error)) goOutside(res.error);
        else setError(describeError(res.error, t));
        return;
      }
      readOnce.current = true;
      setCleared(res.data.cleared ?? null);
      setMessages(res.data.messages as Message[]);
      void markGroupRead(client, groupId);
    });
    return () => {
      active = false;
    };
  }, [client, groupId, t, goOutside, reloadKey]);

  // what was said while the connection was away, and the card of a game started from here
  useCatchUp(
    useCallback(() => {
      void groupHistory(client, groupId).then((res) => {
        if (!res.ok) {
          if (isOutside(res.error)) goOutside(res.error);
          return;
        }
        // cleared while away: what is held from before it goes too
        const since = clearedSince(res.data.cleared);
        setCleared(res.data.cleared ?? null);
        setMessages((prev) => mergeLatest(afterClear(prev, since), res.data.messages as Message[]));
        void markGroupRead(client, groupId);
      });
    }, [client, groupId, goOutside]),
  );

  /** A clear made on this phone (here or on the group's info page): what is held from before it goes at once. */
  const applyCleared = useCallback((next: GroupChatCleared) => {
    setCleared(next);
    setMessages((prev) => afterClear(prev, clearedSince(next)));
    // nothing older is left to page back to
    setExhausted(true);
  }, []);
  useClearedHere(groupId, applyCleared);
  const clearChat = useClearChat(groupId, detail?.memberCount ?? 0, setError);

  /**
   * Who here can be given a gift: your friends among the members, as the
   * roster shows them. Asked when the picker opens, not before — most visits
   * to a thread give nothing.
   */
  const loadFriends = useCallback(async () => {
    const [roster, mine] = await Promise.all([
      groupDetail(client, groupId),
      client.get<{ friends: Array<{ userId: string; username: string; displayName?: string | null; avatarUrl?: string | null }> }>(
        '/friends?limit=500',
      ),
    ]);
    if (roster.ok && !nameParam) setName(roster.data.name);
    const members = new Set(roster.ok ? roster.data.members.map((m) => m.userId) : []);
    setFriends(
      mine.ok
        ? mine.data.friends
            .filter((f) => members.has(f.userId) && f.userId !== me)
            .map((f) => ({ userId: f.userId, name: f.displayName || f.username, avatarUrl: f.avatarUrl ?? null }))
        : [],
    );
  }, [client, groupId, me, nameParam]);

  /** Older messages, from the top. The list is inverted, so "end" is the past. */
  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (loadingOlder || exhausted || !oldest) return;
    setLoadingOlder(true);
    const res = await groupHistory(client, groupId, oldest.createdAt);
    setLoadingOlder(false);
    if (!res.ok) {
      if (isOutside(res.error)) goOutside(res.error);
      return;
    }
    if (res.data.messages.length === 0) {
      setExhausted(true);
      return;
    }
    setMessages((prev) => [...(res.data.messages as Message[]), ...prev]);
  }, [client, groupId, messages, loadingOlder, exhausted, goOutside]);

  /**
   * The room, which this screen used to have no connection to at all.
   *
   * History loaded once on mount and nothing after it, so a reply to a group
   * message did not appear until you left the thread and came back — the browser
   * has joined `group:{id}` and listened for these three since the thread was
   * built. Our own send is in the thread at once, as one on its way
   * (chat/sending.ts), and takes the server's copy from whichever arrives
   * first, the send's answer or the room's echo: the other is dropped by id.
   */
  useRoomEvents(
    `group:${groupId}`,
    useCallback(
      (ev) => {
        if (ev.groupId !== groupId) return;
        if (ev.type === 'group_msg') {
          const message = ev.message as Message | undefined;
          if (!message?.id) return;
          const own = message.gift ? pendingCards.current.get(message.gift.batchId) : undefined;
          const shown = own ? { ...message, gift: own } : message;
          // our own words back from the room before the send was answered: the one drawn as on its way gives them its place
          if (message.senderId === me && message.body && !held.current.some((m) => m.id === message.id)) echoed(message.body);
          setMessages((prev) => (prev.some((m) => m.id === shown.id) ? prev : [...prev, shown]));
          // it is on screen, so it counts as read
          void markGroupRead(client, groupId);
          return;
        }
        if (ev.type === 'group_msg_deleted' && typeof ev.id === 'string') {
          const id = ev.id;
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, body: '' } : m)));
          return;
        }
        // someone banned with their messages: each keeps its place, emptied, as one deleted does
        if (ev.type === 'group_msgs_deleted' && typeof ev.senderId === 'string') {
          const sender = ev.senderId;
          setMessages((prev) => prev.map((m) => (m.senderId === sender ? { ...m, deleted: true, body: '' } : m)));
          return;
        }
        // an admin cleared the chat for everyone: gone from this view at once, and the line says who
        if (ev.type === 'group_chat_cleared' && typeof ev.at === 'string') {
          const at = ev.at;
          const by = typeof ev.by === 'string' ? ev.by : null;
          setCleared((prev) => ({ forEveryone: { at, by }, forMe: prev?.forMe ?? null }));
          setMessages((prev) => afterClear(prev, at));
          setExhausted(true);
          return;
        }
        // a gift here was opened: each member's card is their own, so fetch it again
        if (ev.type === 'group_msg_gift_opened' && typeof ev.batchId === 'string') {
          void giftBatchCard(client, ev.batchId).then((res) => res.ok && setMessages((prev) => withCard(prev, res.data.card)));
          return;
        }
        // the room includes us, so our own pings come back — ignore those
        if (ev.type === 'group_typing' && typeof ev.username === 'string' && ev.userId !== me) {
          note(ev.username);
        }
      },
      [groupId, client, me, note, echoed],
    ),
  );

  // your own card for a gift posted here (the room's names nobody as "me")
  useGiftEvents((ev) => {
    if (ev.type !== 'gift_received' || ev.chat.kind !== 'group' || ev.chat.groupId !== groupId) return;
    pendingCards.current.set(ev.batchId, ev.card);
    setMessages((prev) => withCard(prev, ev.card));
  });

  const startUnwrap = useCallback(
    (giftId: string) => {
      const message = messages.find((m) => m.gift?.myGiftId === giftId);
      if (message?.gift) {
        setUnwrapping({ giftId, card: message.gift, fromName: message.username });
        return;
      }
      void openGiftApi(client, giftId).then((res) => {
        if (res.ok) setUnwrapping({ giftId, card: res.data.card, fromName: '' });
      });
    },
    [client, messages],
  );

  useEffect(() => {
    if (!openGift || loading || autoOpened.current === openGift) return;
    autoOpened.current = openGift;
    startUnwrap(openGift);
  }, [openGift, loading, startUnwrap]);

  const signalTyping = useTypingSignal(
    useCallback(() => void sendGroupTyping(client, groupId), [client, groupId]),
  );

  /** Send words into the room: null when they went, else the refusal, for whoever asked to say. */
  const post = useCallback(
    async (body: string): Promise<ApiError | null> => {
      // in the thread at once, as one on its way; the server's copy takes its place, or it is taken out
      const sending = begin(body);
      const res = await sendToGroup(client, groupId, body);
      settle(sending);
      if (!res.ok) return res.error;
      // once: the room may have echoed it already
      setMessages((prev) => appendOnce(prev, res.data as Message));
      return null;
    },
    [client, groupId, begin, settle],
  );

  /**
   * A message the server would not take: out of the group, the card that says
   * where the reader stands; a limit on the account, what and until when, with
   * the way to Account standing (and no more greetings to tap); anything else
   * as it always did.
   */
  const refusedSend = useCallback(
    (refused: ApiError) => {
      if (isOutside(refused)) {
        goOutside(refused);
        return;
      }
      if (restrictionOf(refused)) {
        setSendError(refused);
        setCanPost(false);
      } else setError(describeError(refused, t));
    },
    [goOutside, t],
  );

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setError(null);
    setSendError(null);
    haptic('tap');
    // sending is what takes you back down to the newest message, wherever you were reading
    toLatest();
    const refused = await post(body);
    if (!refused) return;
    haptic('error');
    // the draft comes back when the message did not go, before anything typed since, so nothing is lost
    setDraft((now) => restoredDraft(body, now));
    refusedSend(refused);
  }, [draft, post, refusedSend, toLatest]);

  /** A greeting from the welcome, sent as it is. */
  const greet = useCallback(
    async (greeting: string) => {
      setError(null);
      setSendError(null);
      haptic('tap');
      const refused = await post(greeting);
      if (!refused) return;
      haptic('error');
      refusedSend(refused);
    },
    [post, refusedSend],
  );

  const openPicker = (): void => {
    setPicking(true);
    if (friends === null) void loadFriends();
  };

  const role = detail?.myRole ?? null;
  const member = role !== null && !outside && !missing;
  /** The ⋯ in the header, a member's: report the group (not its owner), clear the chat (for everyone, its owner and admins). */
  const menu = member
    ? [
        ...(role !== 'owner' ? [{ label: t('groups.report'), onPress: () => setReporting({ target: { type: 'group' as const, groupId } }) }] : []),
        { label: t('groups.clear.forMe'), destructive: true, onPress: () => clearChat('me') },
        ...(canModerateGroup(role) ? [{ label: t('groups.clear.forEveryone'), destructive: true, onPress: () => clearChat('everyone') }] : []),
      ]
    : [];
  const view = clearedView(cleared);
  const group = { id: groupId, name, photoUrl: detail?.photoUrl ?? null };
  // out of the group: banned, as its page says (or, before it has answered, the refusal alone)
  const banned: Banned | null = !outside || missing ? null : detail?.standing?.kind === 'banned' ? detail.standing : bannedFrom(outside.error);
  // there is no such group for this reader, and they were not in it a moment ago
  const notFound = missing && !outside?.left;
  // the owner or an admin with nobody else in the group yet: the welcome offers the way to bring people in
  const staff = member && canModerateGroup(role);
  const lonely = staff && detail !== null && detail.memberCount <= 1;

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title={notFound ? t('groups.missing.title') : name}
          titleAvatar={notFound ? undefined : <GroupAvatar name={name} id={groupId} size={30} photoUrl={group.photoUrl} />}
          // the group's page is its members': out of it, the name is only a name
          onTitlePress={member ? onOpenMembers : undefined}
          titleHint={member ? t('groups.info') : undefined}
          onBack={onExit}
          hairline
          right={
            <View style={styles.headerActions}>
              {member ? (
                <Pressable
                  onPress={onOpenMembers}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('groups.info')}
                  style={({ pressed }) => [styles.headerBtn, pressed && heldDim]}
                >
                  <Icon name="people" size={20} tone="primary" />
                </Pressable>
              ) : null}
              {menu.length === 0 ? null : (
                <Pressable
                  onPress={() => showActions({ title: name, actions: menu, cancel: t('common.cancel') })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('groups.chatOptions')}
                  style={({ pressed }) => [styles.headerBtn, pressed && heldDim]}
                >
                  <Icon name="more" size={20} tone="secondary" />
                </Pressable>
              )}
            </View>
          }
        />

        {loading ? (
          <ClubThreadSkeleton />
        ) : notFound ? (
          <ScrollView contentContainerStyle={styles.centred}>
            <EmptyState title={t('groups.missing.title')} body={t('groups.missing.body')} action={{ label: t('groups.missing.back'), onPress: onExit }} />
          </ScrollView>
        ) : outside ? (
          <ScrollView contentContainerStyle={styles.centred}>
            {banned || missing ? (
              <StandingCard
                group={group}
                banned={banned}
                left={outside.left}
                onStanding={(next) => setDetail((d) => (d ? { ...d, standing: next } : d))}
                onReload={loadDetail}
              />
            ) : (
              <Loading />
            )}
          </ScrollView>
        ) : thread.length === 0 ? (
          <ScrollView contentContainerStyle={styles.welcome}>
            {view.kind === 'everyone' ? <ClearedLine by={view.by} at={view.at} me={user?.username ?? ''} /> : null}
            <View style={styles.centred}>
              <WelcomeCard
                group={group}
                view={view}
                canGreet={canPost}
                onGreet={(greeting) => void greet(greeting)}
                onAddFriends={lonely ? () => setAddingFriends(true) : undefined}
              />
            </View>
          </ScrollView>
        ) : (
          <View style={styles.flex}>
            <FlatList
              ref={list}
              data={newestFirst}
              inverted
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              onScroll={onScroll}
              scrollEventThrottle={64}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.4}
              // under the newest message, where theirs is about to land (the head of an inverted list is its foot)
              ListHeaderComponent={<TypingBubble names={typing} named />}
              // the top of the history: older messages on their way, or above all that is held, who cleared the chat
              ListFooterComponent={
                loadingOlder ? (
                  <Loading style={{ marginVertical: spacing.md }} />
                ) : view.kind === 'everyone' ? (
                  <ClearedLine by={view.by} at={view.at} me={user?.username ?? ''} />
                ) : null
              }
              renderItem={({ item }) => (
                <MessageRow
                  message={item}
                  mine={item.senderId === me}
                  place={places.get(item.id) ?? LONE}
                  named
                  senderName={item.username}
                  onOpenGift={startUnwrap}
                  onReport={() => setReporting({ target: { type: 'group_message', messageId: item.id }, senderId: item.senderId, sender: item.username })}
                />
              )}
            />
            {away ? <JumpToLatest unseen={unseen} onPress={toLatest} /> : null}
          </View>
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {giftNote ? (
          <Text style={[styles.giftNote, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {giftNote}
          </Text>
        ) : null}
        <SendErrorNotice error={sendError} onDismiss={() => setSendError(null)} />

        {/* out of the group, there is nothing to send: the card says where they stand */}
        {outside || missing ? null : (
          <View style={[styles.inputRow, { flexDirection: dir.row, paddingBottom: bottom, borderTopColor: colors.separator }]}>
            <Pressable
              onPress={openPicker}
              accessibilityRole="button"
              accessibilityLabel={t('gift.button')}
              style={({ pressed }) => [styles.giftBtn, pressed && { backgroundColor: colors.controlTrack }]}
            >
              <Icon name="gift" size={22} color={colors.goldText} />
            </Pressable>
            <ChatGameButton target={{ kind: 'group', groupId }} />
            <MessageField
              value={draft}
              onChangeText={(next) => {
                setDraft(next);
                setSendError(null);
                setGiftNote(null);
                signalTyping();
              }}
              onSend={() => void send()}
              maxLength={MAX_LEN}
            />
          </View>
        )}
      </KeyboardAvoidingView>

      {flying ? (
        <GiftSendAnimation
          key={flying.key}
          tier={flying.tier}
          announce={t('gift.sentMany', { count: flying.count })}
          onDone={() => setFlying(null)}
        />
      ) : null}

      <GiftPickerSheet
        visible={picking && friends !== null}
        chat={{ kind: 'group', groupId }}
        friends={friends ?? []}
        onClose={() => setPicking(false)}
        onSent={(result, item, to) => {
          setPicking(false);
          const sent = result.message as Message | null;
          if (sent) setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
          setFlying({ tier: item.tier, count: to.length, key: Date.now() });
          setGiftNote(result.skipped.length > 0 ? skippedText(result.skipped, friends ?? [], t) : null);
        }}
      />
      {picking && friends === null ? (
        <View style={[styles.picking, { backgroundColor: colors.scrim }]}>
          <ActivityIndicator color={colors.textOnPrimary} />
        </View>
      ) : null}

      {unwrapping ? (
        <GiftUnwrap
          target={unwrapping}
          onClose={() => setUnwrapping(null)}
          onOpened={(card) => setMessages((prev) => withCard(prev, card))}
          onThanks={() => post(t('gift.thanksMessage'))}
        />
      ) : null}

      {staff && detail ? (
        <AddFriendsSheet
          visible={addingFriends}
          groupId={groupId}
          memberIds={detail.members.map((m) => m.userId)}
          onClose={() => {
            setAddingFriends(false);
            loadDetail();
          }}
          onFindPeople={() => {
            setAddingFriends(false);
            onFindPeople();
          }}
        />
      ) : null}

      <ReportSheet
        visible={reporting !== null}
        target={reporting?.target ?? { type: 'group', groupId }}
        name={reporting?.target.type === 'group' ? name : null}
        blockable={reporting?.senderId && reporting.senderId !== me ? { userId: reporting.senderId, name: reporting.sender ?? null } : null}
        // its owner cannot leave a club (the server says so in English): not offered
        leavable={member && role !== 'owner' ? { groupId, name } : null}
        onClose={() => setReporting(null)}
        onLeftGroup={() => {
          setReporting(null);
          onLeft();
        }}
      />
    </GradientBackground>
  );
}

/**
 * The thread while it loads: the members' bubbles at the start with a face
 * and a name over them, yours at the end, sitting on the composer where the
 * newest are — the shapes the thread is about to draw.
 */
function ClubThreadSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const shape: Array<[boolean, number]> = [
    [false, 0.56],
    [false, 0.42],
    [true, 0.5],
    [false, 0.66],
    [true, 0.38],
  ];
  return (
    <View style={[styles.flex, styles.list, styles.skeletonThread]} accessibilityLabel={t('common.loading')}>
      {shape.map(([mine, share], i) => (
        <View key={i} style={[styles.skeletonRow, { flexDirection: dir.row, width: `${Math.round(share * 100)}%` }, mine !== mirrored ? styles.rowEnd : styles.rowStart]}>
          {!mine ? <Skeleton width={RUN_FACE} height={RUN_FACE} radius={radii.pill} /> : null}
          <View style={[styles.skeletonMain, styles.flex]}>
            {!mine ? <SkeletonText size={typography.sizes.xs} width={56} style={[styles.senderSkeleton, { alignItems: mirrored ? 'flex-end' : 'flex-start' }]} /> : null}
            <Skeleton height={18 + lineOf(typography.sizes.md)} radius={radii.lg} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A message the thread has not placed yet (it arrived between two draws): a bubble on its own. */
const LONE = { day: null, first: true, last: true, timed: false } as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeletonThread: { justifyContent: 'flex-end', overflow: 'hidden', gap: spacing.sm },
  skeletonRow: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: '86%' },
  skeletonMain: { flexShrink: 1 },
  senderSkeleton: { marginBottom: 2, marginHorizontal: spacing.xs },
  screen: { flex: 1 },
  // the runs keep their own distance (chat/MessageRow.tsx); the tails reach a little into the margin
  list: { paddingHorizontal: spacing.md - 4, paddingVertical: spacing.md },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  rowEnd: { alignSelf: 'flex-end' },
  rowStart: { alignSelf: 'flex-start' },
  // a card in the middle of what the chat would fill
  centred: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  welcome: { flexGrow: 1, paddingTop: spacing.sm },
  error: { textAlign: 'center', fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  giftNote: { textAlign: 'center', fontSize: typography.sizes.sm, lineHeight: 20, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  inputRow: {
    flexDirection: 'row',
    // the buttons stay by the last line as a long message grows the field upwards
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // a plain glyph beside the field, as the tools by a message field are; the touch is still 44pt
  giftBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  picking: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
