import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GiftCard, GiftTier } from '@kurda/shared';
import { Button } from '../components/Button';
import { wrapTab } from '../components/Sheet';
import { CheckIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { ApiError } from '../lib/types';
import { lockPageScroll } from '../lib/scrollLock';
import { SendError } from '../reports/SendError';
import { Confetti, GiftBox, GiftItemArt, NewrozFlame } from './GiftArt';

/** What a thread lets a gift do: open it, say thanks in the chat, or wear it. */
export interface GiftActions {
  /** Opens the gift on the server, returning the opened card or null on failure. */
  open(giftId: string): Promise<GiftCard | null>;
  /** Sends the thanks message into this chat; null when sent, else the refusal, such as a chat mute. */
  thank(): Promise<ApiError | null>;
  /** Wears the gift (a background or icon); null when done. */
  wear(card: GiftCard): Promise<ApiError | null>;
}

/** The opened gift: the item, who it is from, and Wear it (when wearable), Say thanks and Close. No "send one back". */
export function GiftReveal({
  card,
  from,
  actions,
  onClose,
  compact = false,
}: {
  card: GiftCard;
  from: string;
  actions: GiftActions;
  onClose: () => void;
  /** Inside a chat bubble rather than a sheet. */
  compact?: boolean;
}): React.JSX.Element {
  const t = useT();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState<'wear' | 'thank' | null>(null);
  const [worn, setWorn] = useState(false);
  const [thanked, setThanked] = useState(false);
  const [failed, setFailed] = useState<ApiError | null>(null);

  // The moment is over: announce the item and move focus to it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function run(kind: 'wear' | 'thank'): Promise<void> {
    setBusy(kind);
    setFailed(null);
    const refused = kind === 'wear' ? await actions.wear(card) : await actions.thank();
    setBusy(null);
    if (refused) setFailed(refused);
    else if (kind === 'wear') setWorn(true);
    else setThanked(true);
  }

  const Heading = compact ? 'h3' : 'h2';
  return (
    <div className={`gift-reveal${compact ? ' is-compact' : ''} gift-reveal-${card.tier}`}>
      <GiftItemArt assetUrl={card.assetUrl} category={card.category} size={compact ? 88 : 132} className="gift-reveal-art" />
      <Heading className="gift-reveal-name" ref={headingRef} tabIndex={-1}>
        {card.name}
      </Heading>
      <p className="gift-reveal-from">{t('gift.from', { name: from })}</p>
      <p className="sr-only" role="status">
        {t('gift.revealed', { item: card.name, name: from })}
      </p>
      <div className="gift-reveal-actions">
        {card.equippable &&
          (worn ? (
            <span className="gift-done" role="status">
              <CheckIcon size={15} /> {t('gift.wearing')}
            </span>
          ) : (
            <Button size="sm" onClick={() => void run('wear')} disabled={busy !== null}>
              {t('gift.wear')}
            </Button>
          ))}
        {thanked ? (
          <span className="gift-done" role="status">
            <CheckIcon size={15} /> {t('gift.thanked')}
          </span>
        ) : (
          <Button size="sm" variant={card.equippable && !worn ? 'secondary' : 'primary'} onClick={() => void run('thank')} disabled={busy !== null}>
            {t('gift.sayThanks')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('gift.close')}
        </Button>
      </div>
      {/* An account limit says what and until when; anything else is a plain "try again". */}
      <SendError error={failed} describe={() => t('gift.actionFailed')} className="gift-reveal-error" />
    </div>
  );
}

/**
 * The stage a rare or legendary gift opens on: a confetti sheet for rare, a full-screen Newroz fire for legendary. It
 * plays for its tier's time (or fades under Reduce Motion), then gives way to the reveal; a tap or Skip jumps ahead.
 */
export function GiftStage({
  tier,
  card,
  from,
  revealed,
  onSkip,
  onClose,
  actions,
}: {
  tier: Exclude<GiftTier, 'common'>;
  card: GiftCard;
  from: string;
  revealed: boolean;
  onSkip: () => void;
  onClose: () => void;
  actions: GiftActions;
}): React.JSX.Element {
  const t = useT();
  const restore = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  // Escape skips while playing and closes once the item shows, read through a ref so the listener is set up once.
  const escape = useRef(onSkip);
  escape.current = revealed ? onClose : onSkip;

  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    // Focus Skip at once, so Enter or Space ends the moment early.
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      // Focus stays on the stage while it is up, as in any dialog.
      if (stageRef.current) wrapTab(e, stageRef.current);
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      escape.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      unlock();
      restore.current?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={stageRef}
      className={`gift-stage gift-stage-${tier}${revealed ? ' is-revealed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('gift.fromLabel', { name: from })}
      onClick={revealed ? undefined : onSkip}
    >
      <div className="gift-stage-panel" onClick={(e) => revealed && e.stopPropagation()}>
        {!revealed ? (
          <div className="gift-stage-play">
            {tier === 'legendary' && <NewrozFlame className="gift-stage-flame" />}
            <GiftBox tier={tier} size={tier === 'legendary' ? 200 : 150} className="gift-opening" />
            <Confetti count={tier === 'legendary' ? 30 : 20} spread={tier === 'legendary' ? 1.6 : 1.1} />
            <p className="gift-stage-label" role="status">
              {t('gift.unwrapping')}
            </p>
            <button
              ref={skipRef}
              type="button"
              className="gift-skip"
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
            >
              {t('gift.skip')}
            </button>
          </div>
        ) : (
          <>
            {tier === 'legendary' && <NewrozFlame className="gift-stage-flame is-settled" />}
            <GiftReveal card={card} from={from} actions={actions} onClose={onClose} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
