import { useCallback, useEffect, useRef, useState } from 'react';
import type { GiftCard, GiftRecipient } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { CheckIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { Confetti, GiftBox, GiftItemArt } from './GiftArt';
import { GiftReveal, GiftStage, type GiftActions } from './GiftReveal';
import { playChime, unwrapMs } from './motion';

type Phase = 'idle' | 'unwrapping' | 'revealed';

/**
 * A gift in the chat (a message of kind 'gift').
 *
 * To its recipient, a wrapped present until they open it — a tap plays the
 * unwrap sized by the gift's tier: a burst right here in the bubble for an
 * everyday gift, a sheet with confetti for a rare one, the whole screen with
 * a Newroz fire for a legendary one. Every one can be skipped with a tap, and
 * with reduced motion it is a short fade. Then the item, who it is from, and
 * Wear it / Say thanks / Close.
 *
 * To its sender, the present they sent and whether it has been opened — "Opened ✓"
 * arrives live. In a group, everyone sees who it was for and who has opened
 * theirs; the item stays a surprise to anyone who has not opened one.
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
  /** the viewer sent it */
  mine: boolean;
  /** it was given in a group chat, where who it was for is not obvious */
  inGroup?: boolean;
  senderName: string;
  actions: GiftActions;
  /** open it as soon as it is on screen (arrived from a notification or the banner) */
  autoOpen?: boolean;
  /** it has been opened from the address; the caller can forget the request */
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
  }, []);

  const unwrap = useCallback(() => {
    if (!card.myGiftId || phase !== 'idle') return;
    setFailed(false);
    if (card.myOpened) {
      // opened before: straight to the item, no second performance
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

  // from a notification or the banner: open it now, once. Through a ref, so
  // `unwrap` changing as the phase moves does not ask again.
  const unwrapRef = useRef(unwrap);
  unwrapRef.current = unwrap;
  useEffect(() => {
    if (!autoOpen) return;
    bubbleRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    unwrapRef.current();
    onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);

  const close = useCallback(() => {
    setPhase('idle');
    bubbleRef.current?.focus();
  }, []);

  // ---- the sender's view, and a group member's who was not given one ----
  if (!recipient) {
    const anyOpened = card.recipients.some((r) => r.opened);
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
            {/* the item's name is the sender's to know; to anyone else it is a surprise */}
            {mine ? t('gift.youSent', { item: card.name }) : t('gift.someoneSent', { name: senderName })}
          </span>
          <Recipients recipients={card.recipients} named={inGroup} />
        </span>
      </div>
    );
  }

  // ---- the recipient's ----
  const legendaryOrRare = card.tier !== 'common';
  return (
    <>
      {phase === 'revealed' && !legendaryOrRare ? (
        <div className="gift-bubble is-revealed">
          <GiftReveal card={shown} from={senderName} actions={actions} onClose={close} compact />
        </div>
      ) : phase === 'unwrapping' && !legendaryOrRare ? (
        // the everyday unwrap: a burst here in the bubble; a tap skips it
        <button type="button" className="gift-bubble is-bursting" onClick={() => void finish()} aria-label={t('gift.skip')}>
          <span className="gift-burst">
            <GiftBox tier="common" size={96} className="gift-opening" />
            <Confetti count={14} spread={0.7} />
          </span>
          <span className="gift-bubble-title" role="status">
            {t('gift.unwrapping')}
          </span>
        </button>
      ) : (
        <button
          ref={bubbleRef}
          type="button"
          className={`gift-bubble is-mine-to-open${shown.myOpened ? ' is-opened' : ' is-wrapped'} gift-bubble-${card.tier}`}
          onClick={unwrap}
          aria-label={shown.myOpened ? t('gift.seeAgain', { item: shown.name }) : t('gift.openFrom', { name: senderName })}
        >
          <span className="gift-bubble-art">
            {shown.myOpened ? (
              <GiftItemArt assetUrl={shown.assetUrl} category={shown.category} size={64} />
            ) : (
              <GiftBox tier={card.tier} size={72} className="gift-waiting" />
            )}
          </span>
          <span className="gift-bubble-text">
            <span className="gift-bubble-title">
              {shown.myOpened ? shown.name : t('gift.forYou')}
            </span>
            <span className="gift-bubble-sub">
              {shown.myOpened ? (
                <>
                  <CheckIcon size={13} /> {t('gift.opened')}
                </>
              ) : (
                t('gift.tapToOpen')
              )}
            </span>
          </span>
        </button>
      )}
      {failed && (
        <span className="gift-bubble-error" role="alert">
          {t('gift.openFailed')}
        </span>
      )}
      {legendaryOrRare && phase !== 'idle' && (
        <GiftStage
          tier={card.tier as 'rare' | 'legendary'}
          card={shown}
          from={senderName}
          revealed={phase === 'revealed'}
          onSkip={() => void finish()}
          onClose={close}
          actions={actions}
        />
      )}
    </>
  );
}

/**
 * Who a gift was for, and who has opened theirs. In a direct chat there is
 * only one person it can have been for, so it is just "Opened ✓"; in a group
 * each recipient is named, even when there is only one.
 */
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
