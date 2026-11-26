import { useCallback, useEffect, useRef, useState } from 'react';
import type { GiftCard, GiftRecipient } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { CheckIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { GiftBox, GiftItemArt } from './GiftArt';
import { GiftMoment, type GiftActions } from './GiftMoment';
import { playChime, unwrapMs } from './motion';
import { haptic } from '../lib/haptics';

type Phase = 'idle' | 'unwrapping' | 'revealed';

/**
 * A gift message in the chat. To its recipient it is a wrapped present that hops now and then; a tap opens the gift's
 * moment (GiftMoment.tsx):
 * the box waits in the gift's light for its tier's unwrap time, skippable with a tap and a short fade under Reduce
 * Motion, then the gift springs out with Say thanks, Wear it and Close. The sender sees whether it was opened, live. In a
 * group everyone sees who it was for and who opened theirs; the item stays a surprise to anyone who has not. Everyone
 * else sees who it is from ("Gift from Hamo"), or "a Hevalo member" when the server does not name the sender to them.
 * A grand gift, once opened, stays on show in the chat for everyone in it: its picture large, in its glow.
 */
export function GiftBubble({
  card,
  mine,
  senderName,
  actions,
  autoOpen = false,
  onAutoOpened,
  inGroup = false,
}: {
  card: GiftCard;
  /** The viewer sent it. */
  mine: boolean;
  /** Given in a group chat, where the recipient is not obvious. */
  inGroup?: boolean;
  /** Who sent it as the server names them to this viewer; empty when it may not. */
  senderName: string;
  actions: GiftActions;
  /** Opens it as soon as it is on screen, when arriving from a notification or the banner. */
  autoOpen?: boolean;
  /** Called once it opened from the address, so the caller can forget the request. */
  onAutoOpened?: () => void;
}): React.JSX.Element {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('idle');
  const [opened, setOpened] = useState<GiftCard | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | null>(null);
  const pending = useRef<Promise<GiftCard | null> | null>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const recipient = card.myGiftId !== null;
  const shown = opened ?? card;
  const fromLine = senderName ? t('gift.from', { name: senderName }) : t('gift.fromMember');
  const fromName = senderName || t('gift.someone');

  const finish = useCallback(async () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const result = await pending.current;
    if (!result) {
      setFailed(true);
      setPhase('idle');
      return;
    }
    setOpened(result);
    setPhase('revealed');
    // The item is seen: one haptic, where supported (lib/haptics.ts).
    haptic('celebrate');
  }, []);

  const unwrap = useCallback(() => {
    if (!card.myGiftId || phase !== 'idle') return;
    setFailed(false);
    if (card.myOpened) {
      // Opened before: straight to the item without replaying the unwrap.
      pending.current = Promise.resolve(card);
      void finish();
      return;
    }
    playChime(card.tier);
    pending.current = actions.open(card.myGiftId);
    setPhase('unwrapping');
    timer.current = window.setTimeout(() => void finish(), unwrapMs(card.tier));
  }, [actions, card, finish, phase]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  // From a notification or the banner, open it once, through a ref so `unwrap` changing does not open it again.
  const unwrapRef = useRef(unwrap);
  unwrapRef.current = unwrap;
  useEffect(() => {
    if (!autoOpen) return;
    bubbleRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    unwrapRef.current();
    onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);

  // Refocus the gift once its reveal closes, after the bubble redraws, since an everyday reveal replaces the bubble.
  const refocus = useRef(false);
  const close = useCallback(() => {
    refocus.current = true;
    setPhase('idle');
  }, []);
  useEffect(() => {
    if (phase !== 'idle' || !refocus.current) return;
    refocus.current = false;
    bubbleRef.current?.focus();
  }, [phase]);

  // ---- The sender's view, and a group member's who was not given one ----
  if (!recipient) {
    const anyOpened = card.recipients.some((r) => r.opened);
    if (card.tier === 'grand' && anyOpened) {
      return (
        <div className="gift-bubble is-sent is-opened gift-showpiece">
          <GiftItemArt assetUrl={card.assetUrl} category={card.category} size={132} />
          <span className="gift-bubble-text">
            <span className="gift-bubble-title" lang="ku">
              {card.name}
            </span>
            <span className="gift-bubble-sub">{mine ? t('gift.youSent', { item: card.name }) : fromLine}</span>
            <Recipients recipients={card.recipients} named={inGroup} />
          </span>
        </div>
      );
    }
    return (
      <div className={`gift-bubble is-sent${anyOpened ? ' is-opened' : ''}`}>
        <span className="gift-bubble-art">
          {mine && anyOpened && card.recipients.length === 1 ? (
            <GiftItemArt assetUrl={card.assetUrl} category={card.category} size={64} />
          ) : (
            <GiftBox tier={card.tier} size={64} />
          )}
        </span>
        <span className="gift-bubble-text">
          <span className="gift-bubble-title">
            {/* Only the sender sees the item's name; to anyone else it is a surprise. */}
            {mine ? t('gift.youSent', { item: card.name }) : fromLine}
          </span>
          <Recipients recipients={card.recipients} named={inGroup} />
        </span>
      </div>
    );
  }

  // ---- The recipient's view ----
  return (
    <>
      <button
        ref={bubbleRef}
        type="button"
        className={`gift-bubble is-mine-to-open${shown.myOpened ? ' is-opened' : ' is-wrapped'} gift-bubble-${card.tier}${shown.myOpened && card.tier === 'grand' ? ' gift-showpiece' : ''}`}
        onClick={unwrap}
        aria-label={shown.myOpened ? t('gift.seeAgain', { item: shown.name }) : t('gift.openFrom', { name: fromName })}
      >
        <span className="gift-bubble-art">
          {shown.myOpened ? (
            <GiftItemArt assetUrl={shown.assetUrl} category={shown.category} size={card.tier === 'grand' ? 132 : 64} />
          ) : (
            <GiftBox tier={card.tier} size={72} motion="idle" seed={card.batchId} />
          )}
        </span>
        <span className="gift-bubble-text">
          <span className="gift-bubble-title">{shown.myOpened ? shown.name : fromLine}</span>
          <span className="gift-bubble-sub">{shown.myOpened ? fromLine : t('gift.tapToOpen')}</span>
        </span>
      </button>
      {failed && (
        <span className="gift-bubble-error" role="alert">
          {t('gift.openFailed')}
        </span>
      )}
      {phase !== 'idle' && (
        <GiftMoment card={shown} from={senderName} revealed={phase === 'revealed'} actions={actions} onSkip={() => void finish()} onClose={close} />
      )}
    </>
  );
}

/** Who a gift was for and who opened theirs: just "Opened ✓" in a direct chat, each recipient named in a group. */
function Recipients({ recipients, named }: { recipients: GiftRecipient[]; named: boolean }): React.JSX.Element {
  const t = useT();
  if (recipients.length === 1 && !named) {
    const r = recipients[0]!;
    return (
      <span className="gift-bubble-sub">
        {r.opened ? (
          <>
            <CheckIcon size={13} /> {t('gift.opened')}
          </>
        ) : (
          t('gift.notOpenedYet')
        )}
      </span>
    );
  }
  return (
    <span className="gift-recipients">
      {recipients.map((r, i) => (
        <span key={i} className={`gift-recipient${r.opened ? ' is-opened' : ''}`}>
          <Avatar url={r.avatarUrl} glyphSize={12} />
          <span className="gift-recipient-name">{r.isMe ? t('chat.you') : (r.name ?? t('gift.aMember'))}</span>
          {r.opened && <CheckIcon size={12} />}
          <span className="sr-only">{r.opened ? t('gift.opened') : t('gift.notOpenedYet')}</span>
        </span>
      ))}
    </span>
  );
}
