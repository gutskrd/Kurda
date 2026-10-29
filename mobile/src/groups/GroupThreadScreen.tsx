import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { canModerateGroup, type GiftCard, type GiftTier, type GroupChatCleared, type GroupStanding } from '@kurda/shared';
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
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GroupAvatar } from './GroupAvatar';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { COMPOSER_FIELD, SendButton } from '../chat/SendButton';
import { messageA11y, openMessageOptions } from '../chat/messageOptions';
import { useI18n } from '../i18n/I18nContext';
import { groupDetail, groupHistory, markGroupRead, sendGroupTyping, sendToGroup, type GroupDetail, type GroupMessage } from './api';
import { useRoomEvents } from '../realtime/useRoomEvents';
import { typingLabel, useTypingSignal, useTypingWatch } from '../chat/typing';
import { MessageContent, hasControls, isCardMessage } from '../chat/MessageContent';
import { giftBatchCard, openGift as openGiftApi, withCard, type ChatMessage } from '../gifts/api';
import { useGiftEvents, useOpenChat } from '../gifts/events';
import { GiftPickerSheet, skippedText, type GiftFriend } from '../gifts/GiftPickerSheet';
import { GiftSendAnimation } from '../gifts/GiftSendAnimation';
import { GiftUnwrap, type UnwrapTarget } from '../gifts/GiftUnwrap';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { SendErrorNotice } from '../reports/SendError';
import { restrictionOf } from '../reports/sendErrors';
import { ChatGameButton } from '../play/ChatGameButton';
import { mergeLatest, useCatchUp } from '../realtime/catchUp';
import { showActions } from '../theme/actionSheet';
import { afterClear, clearedSince, clearedView, useClearChat, useClearedHere } from './clearing';
import { ClearedLine, WelcomeCard } from './Welcome';
import { StandingCard } from './Standing';
import { AddFriendsSheet } from './AddFriendsSheet';

const MAX_LEN = 2000;

type Message = Omit<GroupMessage, 'body'> & ChatMessage;

/** A refusal that means the reader is not in the group (any more): removed, banned, or never in it. */
const isOutside = (error: ApiError): boolean => error.code === 'NOT_A_MEMBER' || error.code === 'GROUP_BANNED';

/**
 * Where someone refused stands, when the group's page did not say: banned
 * (with until when, from the refusal) or simply out.
 */
function standingFrom(error: ApiError): Exclude<GroupStanding, { kind: 'member' }> {
  if (error.code !== 'GROUP_BANNED') return { kind: 'out' };
  const until = (error.details as { until?: unknown } | undefined)?.until;
  return { kind: 'banned', until: typeof until === 'string' ? until : null, reason: null, request: { kind: 'can_ask' } };
}

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
 * the top of its history. Someone removed or banned while it is open finds,
 * at the next read or send, where they stand with the group in place of the
 * chat (Standing.tsx), never a raw error.
 */
export function GroupThreadScreen({
  groupId,
  name: nameParam,
  openGift,
  onExit,
  onOpenMembers,
  onLeft,
}: {
  groupId: string;
  /** '' when the way in only knew the id: looked up */
  name: string;
  openGift?: string;
  onExit: () => void;
  onOpenMembers: () => void;
  /** left the group from a report's done screen */
  onLeft: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  // mirrored in Soranî and Arabic, as a chat with one friend is
  const dir = useDirection();
  const bottom = useScreenBottomInset(spacing.md);
  const { t } = useI18n();
  const me = user?.id ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
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
  // false once the server said the reader may not post here (muted, restricted): the greetings go
  const [canPost, setCanPost] = useState(true);
  const [addingFriends, setAddingFriends] = useState(false);
  // asks for the history again: after joining from the card that stood in for it
  const [reloadKey, setReloadKey] = useState(0);
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
   * is out of it.
   */
  const loadDetail = useCallback(() => {
    let active = true;
    void groupDetail(client, groupId).then((res) => {
      if (!active || !res.ok) return;
      setDetail(res.data);
      setName(res.data.name);
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
   * built. Our own send still appends locally; the echo is dropped by id.
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
      [groupId, client, me, note],
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
      const res = await sendToGroup(client, groupId, body);
      if (!res.ok) return res.error;
      setMessages((prev) => [...prev, res.data as Message]);
      return null;
    },
    [client, groupId],
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
    const refused = await post(body);
    if (!refused) return;
    haptic('error');
    // the draft comes back when the message did not go, so nothing is lost
    setDraft(body);
    refusedSend(refused);
  }, [draft, post, refusedSend]);

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
  const member = role !== null && !outside;
  /** The ⋯ in the header: report the group (anyone but its owner), clear the chat (members; for everyone, its owner and admins). */
  const menu = detail
    ? [
        ...(role !== 'owner' ? [{ label: t('groups.report'), onPress: () => setReporting({ target: { type: 'group' as const, groupId } }) }] : []),
        ...(member ? [{ label: t('groups.clear.forMe'), destructive: true, onPress: () => clearChat('me') }] : []),
        ...(member && canModerateGroup(role) ? [{ label: t('groups.clear.forEveryone'), destructive: true, onPress: () => clearChat('everyone') }] : []),
      ]
    : [];
  const view = clearedView(cleared);
  const group = { id: groupId, name, photoUrl: detail?.photoUrl ?? null };
  // where the reader stands, once the group's page says (or, from an older server, the refusal alone)
  const standing = outside && detail ? (detail.standing && detail.standing.kind !== 'member' ? detail.standing : standingFrom(outside.error)) : null;
  // the owner or an admin of an invite-only group nobody else has joined yet: the way to bring people in
  const lonely = detail !== null && detail.privacy === 'invite' && canModerateGroup(role) && detail.memberCount <= 1;

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title={name}
          titleAvatar={<GroupAvatar name={name} id={groupId} size={30} photoUrl={group.photoUrl} />}
          onTitlePress={onOpenMembers}
          titleHint={t('groups.info')}
          onBack={onExit}
          hairline
          right={
            <View style={styles.headerActions}>
              <Pressable
                onPress={onOpenMembers}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('groups.info')}
                style={styles.headerBtn}
              >
                <Icon name="people" size={20} tone="primary" />
              </Pressable>
              {menu.length === 0 ? null : (
                <Pressable
                  onPress={() => showActions({ title: name, actions: menu, cancel: t('common.cancel') })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('groups.chatOptions')}
                  style={styles.headerBtn}
                >
                  <Icon name="more" size={20} tone="secondary" />
                </Pressable>
              )}
            </View>
          }
        />

        {loading ? (
          <ClubThreadSkeleton />
        ) : outside ? (
          <ScrollView contentContainerStyle={styles.centred}>
            {standing && detail ? (
              <StandingCard
                group={{ ...group, privacy: detail.privacy }}
                standing={standing}
                left={outside.left}
                onStanding={(next) => setDetail((d) => (d ? { ...d, standing: next } : d))}
                onReload={loadDetail}
                onJoined={() => {
                  setOutside(null);
                  setLoading(true);
                  setReloadKey((k) => k + 1);
                  loadDetail();
                }}
              />
            ) : (
              <ActivityIndicator color={colors.textSecondary} accessibilityLabel={t('common.loading')} />
            )}
          </ScrollView>
        ) : messages.length === 0 ? (
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
          <FlatList
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            // the top of the history: older messages on their way, or above all that is held, who cleared the chat
            ListFooterComponent={
              loadingOlder ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
              ) : view.kind === 'everyone' ? (
                <ClearedLine by={view.by} at={view.at} me={user?.username ?? ''} />
              ) : null
            }
            renderItem={({ item }) => (
              <Bubble
                message={item}
                mine={item.senderId === me}
                onOpenGift={startUnwrap}
                onReport={() =>
                  setReporting({ target: { type: 'group_message', messageId: item.id }, senderId: item.senderId, sender: item.username })
                }
              />
            )}
          />
        )}

        {/* above the composer, where the browser puts it, and announced when it
            changes rather than read out on every ping */}
        {typing.length > 0 ? (
          <Text style={[styles.typing, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {typingLabel(typing, t)}
          </Text>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {giftNote ? (
          <Text style={[styles.giftNote, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {giftNote}
          </Text>
        ) : null}
        <SendErrorNotice error={sendError} onDismiss={() => setSendError(null)} />

        {/* out of the group, there is nothing to send: the card says where they stand */}
        {outside ? null : (
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
            <TextInput
              style={[styles.input, dir.free, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
              placeholder={t('chat.messagePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={draft}
              onChangeText={(next) => {
                setDraft(next);
                setSendError(null);
                setGiftNote(null);
                signalTyping();
              }}
              maxLength={MAX_LEN}
              multiline
              accessibilityLabel={t('chat.messagePlaceholder')}
            />
            <SendButton ready={draft.trim().length > 0} onPress={() => void send()} />
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

      {lonely ? (
        <AddFriendsSheet
          visible={addingFriends}
          groupId={groupId}
          memberIds={detail.members.map((m) => m.userId)}
          onClose={() => {
            setAddingFriends(false);
            loadDetail();
          }}
        />
      ) : null}

      <ReportSheet
        visible={reporting !== null}
        target={reporting?.target ?? { type: 'group', groupId }}
        name={reporting?.target.type === 'group' ? name : null}
        blockable={reporting?.senderId && reporting.senderId !== me ? { userId: reporting.senderId, name: reporting.sender ?? null } : null}
        // its owner cannot leave a club (the server says so in English): not offered
        leavable={detail && role !== 'owner' ? { groupId, name } : null}
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
        <View key={i} style={[styles.bubbleRow, { flexDirection: dir.row, width: `${Math.round(share * 100)}%` }, mine !== mirrored ? styles.rowEnd : styles.rowStart]}>
          {!mine ? <Skeleton width={28} height={28} radius={radii.pill} /> : null}
          <View style={[styles.bubbleMain, styles.flex]}>
            {!mine ? <SkeletonText size={typography.sizes.xs} width={56} style={[styles.senderSkeleton, { alignItems: mirrored ? 'flex-end' : 'flex-start' }]} /> : null}
            <Skeleton height={spacing.sm * 2 + lineOf(typography.sizes.md)} radius={radii.lg} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A deleted message keeps its place. Removing the row instead would renumber
 * the conversation around whoever was moderated, which reads as though nothing
 * happened — and the person who was replying to it is left talking to nobody.
 */
function Bubble({
  message,
  mine,
  onOpenGift,
  onReport,
}: {
  message: Message;
  mine: boolean;
  onOpenGift: (giftId: string) => void;
  onReport: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const card = isCardMessage(message) && !message.deleted;
  // one element for a screen reader (sender and words), with Copy and Report
  // among its actions, unless it holds a control of its own
  const whole = message.deleted || !hasControls(message);
  // the controls inside a message (a gift, an invite link) report it too
  const report = mine || message.deleted ? undefined : onReport;
  // held, a message offers its words to copy and, if it is someone else's, a report
  const options = { words: card || message.deleted ? null : message.body, onReport: report };
  return (
    <Pressable
      onLongPress={() => openMessageOptions(t, options)}
      delayLongPress={350}
      accessible={whole}
      {...(whole ? messageA11y(t, options) : null)}
      // your own words at the end of the line and theirs (with their face) at its start, whichever side that is
      style={({ pressed }) => [styles.bubbleRow, { flexDirection: dir.row }, mine !== mirrored ? styles.rowEnd : styles.rowStart, pressed && styles.held]}
    >
      {!mine ? (
        <InitialsAvatar name={message.username} id={message.senderId} size={28} photoUrl={message.avatarUrl} />
      ) : null}
      <View style={styles.bubbleMain}>
        {!mine ? <Text style={[styles.sender, dir.text, { color: colors.textSecondary }]}>{message.username}</Text> : null}
        {card ? (
          <MessageContent message={message} mine={mine} senderName={message.username} onOpenGift={onOpenGift} onReport={report} />
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
            {message.deleted ? (
              <View style={styles.deletedRow}>
                <Icon name="close" size={13} tone="secondary" />
                <Text style={[styles.deleted, { color: mine ? colors.textOnPrimary : colors.textSecondary }]}>
                  {t('groups.messageDeleted')}
                </Text>
              </View>
            ) : (
              <MessageContent message={message} mine={mine} senderName={message.username} onOpenGift={onOpenGift} onReport={report} />
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // a held message sinks a little under the finger, so the hold is felt to be doing something
  held: { transform: [{ scale: 0.97 }] },
  flex: { flex: 1 },
  skeletonThread: { justifyContent: 'flex-end', overflow: 'hidden' },
  senderSkeleton: { marginBottom: 2, marginHorizontal: spacing.xs },
  screen: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: '86%' },
  rowEnd: { alignSelf: 'flex-end' },
  rowStart: { alignSelf: 'flex-start' },
  bubbleMain: { flexShrink: 1 },
  sender: { fontSize: typography.sizes.xs, marginBottom: 2, marginHorizontal: spacing.xs },
  bubble: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  deleted: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  // a card in the middle of what the chat would fill
  centred: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  welcome: { flexGrow: 1, paddingTop: spacing.sm },
  typing: { fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
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
  input: COMPOSER_FIELD,
  picking: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
