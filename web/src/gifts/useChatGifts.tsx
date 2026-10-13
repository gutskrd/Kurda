import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GiftCard, GiftChatRef } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { DmMessage, GroupMessage } from '../lib/types';
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
  /** send a text message in this thread (the thanks) */
  sendText: (body: string) => Promise<boolean>;
  /** the scrolling list of messages, which the sent gift flies into */
  threadRef: RefObject<HTMLElement | null>;
  /** bring the thread to its end once your gift is in it */
  onSentScroll: () => void;
}): { button: ReactNode; overlays: ReactNode; renderBody: (m: M) => ReactNode | undefined } {
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

  /** Put a fresh card on every message of its batch. */
  const setCard = useCallback(
    (batchId: string, card: GiftCard) =>
      setMessages((list) => (list ?? []).map((m) => (m.gift?.batchId === batchId ? { ...m, gift: card } : m)) as M[]),
    [setMessages],
  );

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
        if (!card.equippable) return false;
        const res = await client.put(`/me/cosmetics/${card.equippable}`, { sku: card.sku });
        return res.ok;
      },
    }),
    [client, sendText, setCard, t],
  );

  const openPicker = useCallback(() => {
    setPicking(true);
    if (people === null) void loadPeople().then(setPeople, () => setPeople([]));
  }, [loadPeople, people]);

  const onSent = useCallback(
    (sent: GiftSent) => {
      setPicking(false);
      if (sent.message) {
        const message = sent.message as M;
        setMessages((list) => {
          const now = list ?? [];
          return now.some((m) => m.id === message.id) ? now : [...now, message];
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
        />
      );
    },
    [actions, autoGift, autoOpened, user?.id],
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

  return { button, overlays, renderBody };
}
