import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GiftCard, GiftChatRef, GiftUserEvent } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ApiError, DmMessage, GroupMessage } from '../lib/types';
import { GiftIcon } from '../components/icons';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { useT } from '../i18n/I18nProvider';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { GiftBubble } from './GiftBubble';
import { GiftFlight } from './GiftFlight';
import { GiftPicker, type GiftPerson, type GiftSent } from './GiftPicker';
import type { GiftActions } from './GiftReveal';

type ChatMessage = DmMessage | GroupMessage;

/**
 * Everything a chat thread needs for gifts, so the direct and group threads
 * stay two short insertions apart from each other's code:
 *
 * - `button`: the gift button for the composer's tools;
 * - `overlays`: the picker, the send's flight, and what is announced;
 * - `renderBody`: draws a gift message as a GiftBubble (MessageList's hook).
 *
 * It keeps the thread's gift cards true without a reload: your own unwrap
 * updates the card at once; the sender hears `gift_opened` on their own
 * channel and a group hears `group_msg_gift_opened` in its room, on which the
 * card is fetched again (`GET /gifts/batches/:id`), since a card is drawn per
 * viewer. A `?gift=<id>` in the address (from the banner or a notification)
 * opens that gift as soon as its bubble is on screen.
 *
 * In a group the card the room hears with `group_msg` is nobody's in
 * particular (no one is "me" on it); a recipient's own card, theirs to open,
 * comes on their own channel with `gift_received`. The two can arrive in
 * either order, so the own card is kept by batch and `adopt` puts it on the
 * room's message when that arrives later.
 */
export function useChatGifts<M extends ChatMessage>({
  chat,
  loadPeople,
  setMessages,
  sendText,
  threadRef,
  onSentScroll,
}: {
  chat: GiftChatRef;
  /** who may be given a gift here: the friend in a DM, your friends among a group's members */
  loadPeople: () => Promise<GiftPerson[]>;
  setMessages: Dispatch<SetStateAction<M[] | null>>;
  /** send a text message in this thread (the thanks); null when it went, else the refusal */
  sendText: (body: string) => Promise<ApiError | null>;
  /** the scrolling list of messages, which the sent gift flies into */
  threadRef: RefObject<HTMLElement | null>;
  /** bring the thread to its end once your gift is in it */
  onSentScroll: () => void;
}): {
  button: ReactNode;
  overlays: ReactNode;
  renderBody: (m: M) => ReactNode | undefined;
  /** a message arriving live: given your own card for its gift, if one came first */
  adopt: (m: M) => M;
} {
  const t = useT();
  const { client, user } = useAuth();
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState<GiftPerson[] | null>(null);
  const [flight, setFlight] = useState<{ sent: GiftSent; target: DOMRect | null } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [params, setParams] = useSearchParams();
  /** the gift the address asks to open (`?gift=`), until its bubble has opened it */
  const [autoGift, setAutoGift] = useState<string | null>(() => params.get('gift'));
  const wanted = params.get('gift');
  useEffect(() => {
    if (wanted) setAutoGift(wanted);
  }, [wanted]);

  // once it has opened, the address has done its job: a reload should not open it again
  const autoOpened = useCallback(() => {
    setAutoGift(null);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('gift');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  /** your own cards for gifts in this chat, by batch, as `gift_received` brought them */
  const ownCards = useRef(new Map<string, GiftCard>());

  /** Put a fresh card on every message of its batch. */
  const setCard = useCallback(
    (batchId: string, card: GiftCard) => {
      if (ownCards.current.has(batchId)) ownCards.current.set(batchId, card);
      setMessages((list) => (list ?? []).map((m) => (m.gift?.batchId === batchId ? { ...m, gift: card } : m)) as M[]);
    },
    [setMessages],
  );

  const adopt = useCallback((m: M): M => {
    const own = m.gift ? ownCards.current.get(m.gift.batchId) : undefined;
    return own ? { ...m, gift: own } : m;
  }, []);

  // your own channel: a gift for you, with the card that is yours to open
  const onReceived = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as Partial<Extract<GiftUserEvent, { type: 'gift_received' }>>;
      if (typeof ev.batchId !== 'string' || !ev.card || !ev.chat) return;
      const here =
        ev.chat.kind === 'group'
          ? chat.kind === 'group' && ev.chat.groupId === chat.groupId
          : chat.kind === 'dm' && ev.chat.userId === chat.userId;
      if (!here) return;
      ownCards.current.set(ev.batchId, ev.card);
      setCard(ev.batchId, ev.card);
    },
    [chat, setCard],
  );
  useRealtimeEvent('gift_received', onReceived);

  const refetch = useCallback(
    async (batchId: string) => {
      const res = await client.get<{ card: GiftCard }>(`/gifts/batches/${batchId}`);
      if (res.ok && res.data.card) setCard(batchId, res.data.card);
    },
    [client, setCard],
  );

  // the sender's own channel: one of their gifts was opened
  const onOpened = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { batchId?: unknown };
      if (typeof ev.batchId === 'string') void refetch(ev.batchId);
    },
    [refetch],
  );
  useRealtimeEvent('gift_opened', onOpened);

  // a group's room: a gift in it was opened, by someone
  const onGroupOpened = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: unknown; batchId?: unknown };
      if (chat.kind !== 'group' || ev.groupId !== chat.groupId || typeof ev.batchId !== 'string') return;
      void refetch(ev.batchId);
    },
    [chat, refetch],
  );
  useRealtimeEvent('group_msg_gift_opened', onGroupOpened);

  const actions: GiftActions = useMemo(
    () => ({
      open: async (giftId) => {
        const res = await client.post<{ card: GiftCard }>(`/gifts/${giftId}/open`);
        if (!res.ok) return null;
        setCard(res.data.card.batchId, res.data.card);
        giftsWereOpened();
        return res.data.card;
      },
      thank: () => sendText(t('gift.thanksMessage')),
      wear: async (card) => {
        if (!card.equippable) return { kind: 'client', message: 'not something to wear' };
        const res = await client.put(`/me/cosmetics/${card.equippable}`, { sku: card.sku });
        return res.ok ? null : res.error;
      },
    }),
    [client, sendText, setCard, t],
  );

  // who may be given one is asked each time the picker opens: a group's
  // members (and which of them are your friends) change while a thread is
  // open, and a first ask can come before the thread knew its own roster
  const openPicker = useCallback(() => {
    setPicking(true);
    setPeople(null);
    void loadPeople().then(setPeople, () => setPeople([]));
  }, [loadPeople]);

  const onSent = useCallback(
    (sent: GiftSent) => {
      setPicking(false);
      if (sent.message) {
        const message = sent.message as M;
        // the room's copy may have come first; the sender's own card is the one to keep
        setMessages((list) => {
          const now = list ?? [];
          return now.some((m) => m.id === message.id) ? now.map((m) => (m.id === message.id ? message : m)) : [...now, message];
        });
      }
      setFlight({ sent, target: threadRef.current?.getBoundingClientRect() ?? null });
      setAnnounce(t('gift.sentAnnounce', { item: sent.item.name }));
    },
    [setMessages, t, threadRef],
  );

  const renderBody = useCallback(
    (m: M): ReactNode | undefined => {
      if (m.kind !== 'gift' || !m.gift) return undefined;
      return (
        <GiftBubble
          card={m.gift}
          mine={m.senderId === user?.id}
          senderName={m.username}
          actions={actions}
          autoOpen={autoGift !== null && m.gift.myGiftId === autoGift}
          onAutoOpened={autoOpened}
          inGroup={chat.kind === 'group'}
        />
      );
    },
    [actions, autoGift, autoOpened, chat.kind, user?.id],
  );

  const button = (
    <button
      type="button"
      className="chat-gift-btn"
      onClick={openPicker}
      aria-label={t('gift.button')}
      title={t('gift.button')}
    >
      <GiftIcon size={20} />
    </button>
  );

  const overlays = (
    <>
      <GiftPicker open={picking} onClose={() => setPicking(false)} chat={chat} people={people} onSent={onSent} />
      {flight && (
        <GiftFlight
          item={flight.sent.item}
          target={flight.target}
          onDone={() => {
            setFlight(null);
            onSentScroll();
          }}
        />
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  );

  return { button, overlays, renderBody, adopt };
}
