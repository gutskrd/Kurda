import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { giftSenderName, type GiftCard, type GiftChatRef, type GiftUserEvent } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ApiError, DmMessage, GroupMessage } from '../lib/types';
import { CloseIcon, GiftIcon } from '../components/icons';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { useT } from '../i18n/I18nProvider';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { canGiveGifts } from './access';
import { GiftBubble } from './GiftBubble';
import { ThanksLine } from './ThanksLine';
import { GiftPicker, type GiftPerson, type GiftSent } from './GiftPicker';
import { GiftSentMoment, type GiftActions } from './GiftMoment';
import { isKnownAdult } from './nudges';

type ChatMessage = DmMessage | GroupMessage;

/**
 * Everything a chat thread needs for gifts: `button` for the composer, `overlays` (picker, the sender's moment, announcements),
 * `renderBody` to draw gift messages, and `notice` for who was skipped in a group gift.
 *
 * Cards stay current without a reload: the reader's own unwrap updates at once, and `gift_opened` (sender's channel)
 * or `group_msg_gift_opened` (group room) refetch the card (`GET /gifts/batches/:id`), since cards are per viewer. A
 * `?gift=<id>` opens that gift once its bubble shows. In a group the room's card names nobody as "me", while the
 * recipient's own card comes with `gift_received`; either may arrive first, so own cards are kept by batch and
 * `adopt` applies them to the room's message.
 */
export function useChatGifts<M extends ChatMessage>({
  chat,
  loadPeople,
  setMessages,
  sendText,
  onSentScroll,
}: {
  chat: GiftChatRef;
  /** Who may be given a gift here: the friend in a DM, or the reader's friends among a group's members. */
  loadPeople: () => Promise<GiftPerson[]>;
  setMessages: Dispatch<SetStateAction<M[] | null>>;
  /** Sends a message in this thread, with `thanksFor` a one-tap thanks for that gift batch; null when sent, else the refusal. */
  sendText: (body: string, thanksFor?: string) => Promise<ApiError | null>;
  /** Scrolls the thread to its end once the sent gift is in it. */
  onSentScroll: () => void;
}): {
  button: ReactNode;
  overlays: ReactNode;
  renderBody: (m: M) => ReactNode | undefined;
  /** Draws a one-tap thanks as its line across the thread. */
  renderEvent: (m: M) => ReactNode;
  /** Applies the reader's own card to a live message's gift, if it came first. */
  adopt: (m: M) => M;
  notice: ReactNode;
} {
  const t = useT();
  const { client, user } = useAuth();
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState<GiftPerson[] | null>(null);
  /** The friend a gift is being sent back to, chosen already when the sheet opens. */
  const [backTo, setBackTo] = useState<string[] | undefined>(undefined);
  const [sentMoment, setSentMoment] = useState<GiftSent | null>(null);
  const [announce, setAnnounce] = useState('');
  /** Who got the last gift and why the others did not, when some were skipped. */
  const [partial, setPartial] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  /** The gift the address asks to open (`?gift=`), until its bubble has opened it. */
  const [autoGift, setAutoGift] = useState<string | null>(() => params.get('gift'));
  const wanted = params.get('gift');
  useEffect(() => {
    if (wanted) setAutoGift(wanted);
  }, [wanted]);

  // Once opened, clear the address so a reload does not open it again.
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

  /** The reader's own cards for gifts in this chat, by batch, from `gift_received`. */
  const ownCards = useRef(new Map<string, GiftCard>());

  /** Puts a fresh card on every message of its batch. */
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

  // The reader's own channel: a gift for them, with their card to open.
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

  // The sender's own channel: one of their gifts was opened.
  const onOpened = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { batchId?: unknown };
      if (typeof ev.batchId === 'string') void refetch(ev.batchId);
    },
    [refetch],
  );
  useRealtimeEvent('gift_opened', onOpened);

  // A group's room: someone opened a gift in it.
  const onGroupOpened = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: unknown; batchId?: unknown };
      if (chat.kind !== 'group' || ev.groupId !== chat.groupId || typeof ev.batchId !== 'string') return;
      void refetch(ev.batchId);
    },
    [chat, refetch],
  );
  useRealtimeEvent('group_msg_gift_opened', onGroupOpened);

  // Recipients are fetched each time the picker opens, since a group's members change while the thread is open.
  const openPicker = useCallback(() => {
    setBackTo(undefined);
    setPicking(true);
    setPartial(null);
    setPeople(null);
    void loadPeople().then(setPeople, () => setPeople([]));
  }, [loadPeople]);

  /** Opens the sheet for the one who sent a gift, once they are known to be a friend here, so it opens on what to give. */
  const sendBackTo = useCallback(
    (senderId: string) => {
      setPartial(null);
      void loadPeople().then(
        (list) => {
          setPeople(list);
          setBackTo(list.some((p) => p.userId === senderId) ? [senderId] : undefined);
          setPicking(true);
        },
        () => undefined,
      );
    },
    [loadPeople],
  );

  const actions: GiftActions = useMemo(
    () => ({
      open: async (giftId) => {
        const res = await client.post<{ card: GiftCard }>(`/gifts/${giftId}/open`);
        if (!res.ok) return null;
        setCard(res.data.card.batchId, res.data.card);
        giftsWereOpened();
        return res.data.card;
      },
      // A thanks names the gift it answers, so the thread draws it as a thanks rather than as typed words, and the card
      // offers no second one.
      thank: async (card) => {
        const refused = await sendText(t('gift.thanksMessage'), card.batchId);
        if (!refused) setCard(card.batchId, { ...card, myThanked: true });
        return refused;
      },
      wear: async (card) => {
        if (!card.equippable) return { kind: 'client', message: 'not something to wear' };
        const res = await client.put(`/me/cosmetics/${card.equippable}`, { sku: card.sku });
        return res.ok ? null : res.error;
      },
      // A gift back to whoever sent this one, from the bag first, is offered to a known adult only: to anyone else it
      // would be a prompt to spend, which nobody under 18 or of unknown age is shown.
      ...(canGiveGifts(user) && isKnownAdult(user)
        ? {
            sendBack: (card: GiftCard) => {
              const from = card.from?.userId;
              if (from && from !== user?.id) sendBackTo(from);
            },
          }
        : {}),
    }),
    [client, sendText, setCard, t, user, sendBackTo],
  );

  const onSent = useCallback(
    (sent: GiftSent) => {
      setPicking(false);
      if (sent.message) {
        const message = sent.message as M;
        // The room's copy may have come first; the sender's own card is the one to keep.
        setMessages((list) => {
          const now = list ?? [];
          return now.some((m) => m.id === message.id) ? now.map((m) => (m.id === message.id ? message : m)) : [...now, message];
        });
      }
      setSentMoment(sent);
      // The note is announced once and stays on screen until dismissed.
      setPartial(sent.partialNote);
      setAnnounce(sent.partialNote ?? t('gift.sentAnnounce', { item: sent.item.name }));
    },
    [setMessages, t],
  );

  const renderBody = useCallback(
    (m: M): ReactNode | undefined => {
      if (m.kind !== 'gift' || !m.gift) return undefined;
      return (
        <GiftBubble
          card={m.gift}
          mine={m.senderId === user?.id}
          // As the server names the sender to this viewer; an older server sends no sender, and the message's stands in.
          senderName={m.gift.from === undefined ? m.username : (giftSenderName(m.gift.from) ?? '')}
          actions={actions}
          autoOpen={autoGift !== null && m.gift.myGiftId === autoGift}
          onAutoOpened={autoOpened}
          inGroup={chat.kind === 'group'}
        />
      );
    },
    [actions, autoGift, autoOpened, chat.kind, user?.id],
  );

  const renderEvent = useCallback(
    (m: M): ReactNode => <ThanksLine mine={m.senderId === user?.id} name={m.username} gift={m.thanks?.name ?? null} at={m.createdAt} />,
    [user?.id],
  );

  // A child's profile never gives gifts (gifts/access.ts).
  const button = canGiveGifts(user) ? (
    <button type="button" className="chat-gift-btn" onClick={openPicker} aria-label={t('gift.button')} title={t('gift.button')}>
      <GiftIcon size={20} />
    </button>
  ) : null;

  const overlays = (
    <>
      <GiftPicker open={picking} onClose={() => setPicking(false)} chat={chat} people={people} onSent={onSent} initialChosen={backTo} />
      {sentMoment && (
        <GiftSentMoment
          item={sentMoment.item}
          line={sentLine(sentMoment, people, t)}
          onDone={() => {
            setSentMoment(null);
            onSentScroll();
          }}
        />
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  );

  const notice = partial ? (
    <div className="msg send-error is-limit chat-senderr gift-partial">
      <span>{partial}</span>
      <button type="button" className="gift-partial-close" aria-label={t('gift.close')} onClick={() => setPartial(null)}>
        <CloseIcon size={15} />
      </button>
    </div>
  ) : null;

  return { button, overlays, renderBody, renderEvent, adopt, notice };
}

/** Who a gift went to, for the sender's moment: "Sent to Rojda.", or what was sent when the names are not known here. */
function sentLine(sent: GiftSent, people: readonly GiftPerson[] | null, t: ReturnType<typeof useT>): string {
  const names = sent.sent.map((id) => people?.find((p) => p.userId === id)?.name).filter((n): n is string => !!n);
  return names.length > 0 ? t('gift.sentTo', { names: names.join(', ') }) : t('gift.sentAnnounce', { item: sent.item.name });
}
