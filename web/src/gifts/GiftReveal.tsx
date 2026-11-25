import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { giftMeaning, type GiftCard, type GiftTier } from '@kurda/shared';
import { Button } from '../components/Button';
import { wrapTab } from '../components/Sheet';
import { CheckIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { ApiError } from '../lib/types';
import { lockPageScroll } from '../lib/scrollLock';
import { useOptimisticSend } from '../lib/optimistic';
import { SendError } from '../reports/SendError';
import { Confetti, GiftBox, GiftItemArt, NewrozFlame, NightSky } from './GiftArt';

/** What a thread lets a gift do: open it, say thanks in the chat, or wear it. */
export interface GiftActions {
  /** Opens the gift on the server, returning the opened card or null on failure. */
  open(giftId: string): Promise<GiftCard | null>;
  /** Sends the thanks message into this chat; null when sent, else the refusal, such as a chat mute. */
  thank(): Promise<ApiError | null>;
  /** Wears the gift (a background or icon); null when done. */
  wear(card: GiftCard): Promise<ApiError | null>;
  /** Opens the gift sheet for the sender, the bag first; absent where nothing can be sent back. */
  sendBack?(card: GiftCard): void;
}

/**
 * The opened gift: the item with its Kurmancî name and meaning, who it is from, and Wear it (when wearable), Say thanks,
 * Send one back (the gift sheet for the sender, opening on the free gifts of the bag) and Close.
 */
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
  const { locale } = useI18n();
  const meaning = giftMeaning(card.sku, locale);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sendShown = useOptimisticSend();
  const [worn, setWorn] = useState(false);
  const [thanked, setThanked] = useState(false);
  const [failed, setFailed] = useState<ApiError | null>(null);

  // The moment is over: announce the item and move focus to it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /** Worn or thanked at once; a refusal takes it back and says why under the buttons. */
  async function run(kind: 'wear' | 'thank'): Promise<void> {
    const shown = kind === 'wear' ? setWorn : setThanked;
    setFailed(null);
    shown(true);
    await sendShown(
      async () => {
        const refused = kind === 'wear' ? await actions.wear(card) : await actions.thank();
        return refused ? { ok: false as const, error: refused } : { ok: true as const, data: null };
      },
      { undo: () => shown(false) },
      { onFailed: setFailed },
    );
  }

  const Heading = compact ? 'h3' : 'h2';
  const artSize = compact ? 88 : card.tier === 'grand' ? 200 : 132;
  return (
    <div className={`gift-reveal${compact ? ' is-compact' : ''} gift-reveal-${card.tier}`}>
      <GiftItemArt assetUrl={card.assetUrl} category={card.category} size={artSize} className="gift-reveal-art" />
      <Heading className="gift-reveal-name" ref={headingRef} tabIndex={-1} lang={meaning ? 'ku' : undefined}>
        {card.name}
      </Heading>
      {meaning && <p className="gift-reveal-meaning">{meaning}</p>}
      <p className="gift-reveal-from">{from ? t('gift.from', { name: from }) : t('gift.fromMember')}</p>
      <p className="sr-only" role="status">
        {t('gift.revealed', { item: card.name, name: from || t('gift.someone') })}
      </p>
      <div className="gift-reveal-actions">
        {card.equippable &&
          (worn ? (
            <span className="gift-done" role="status">
              <CheckIcon size={15} /> {t('gift.wearing')}
            </span>
          ) : (
            <Button size="sm" onClick={() => void run('wear')}>
              {t('gift.wear')}
            </Button>
          ))}
        {thanked ? (
          <span className="gift-done" role="status">
            <CheckIcon size={15} /> {t('gift.thanked')}
          </span>
        ) : (
          <Button size="sm" variant={card.equippable && !worn ? 'secondary' : 'primary'} onClick={() => void run('thank')}>
            {t('gift.sayThanks')}
          </Button>
        )}
        {actions.sendBack && card.from && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onClose();
              actions.sendBack!(card);
            }}
          >
            {t('gift.sendBack')}
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
 * The stage a rare, legendary or grand gift opens on: a confetti sheet for rare, a full-screen Newroz fire for
 * legendary, and for a grand gift the whole screen going to night as the stars come out and the gift rises into its
 * glow. It plays for its tier's time (or fades under Reduce Motion), then gives way to the reveal; a tap or Skip jumps
 * ahead.
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
      aria-label={from ? t('gift.fromLabel', { name: from }) : t('gift.fromMember')}
      onClick={revealed ? undefined : onSkip}
    >
      <div className="gift-stage-panel" onClick={(e) => revealed && e.stopPropagation()}>
        {tier === 'grand' && <NightSky className={revealed ? 'is-settled' : undefined} />}
        {!revealed ? (
          <div className="gift-stage-play">
            {tier === 'legendary' && <NewrozFlame className="gift-stage-flame" />}
            <GiftBox tier={tier} size={tier === 'rare' ? 150 : 200} className="gift-opening" />
            <Confetti count={tier === 'rare' ? 20 : 30} spread={tier === 'rare' ? 1.1 : 1.6} />
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
