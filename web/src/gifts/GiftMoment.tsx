/**
 * The moment a gift is opened (shared gift-moment.ts): the screen dims, the gift springs in large in the middle on a
 * round glow of its own colour, a ring of light rays turns slowly behind it and light sparkles drift, under "Gift from
 * Rojda", with its Kurmancî name and meaning below and Say thanks, Send one back (a known adult's only) and Close (a
 * gift on a post, with no chat to thank in, has Close alone). Its
 * tier sets how strong the light is, and a grand gift keeps its night sky. While the server opens it the wrapped box
 * waits in the same light, for the tier's unwrap time; a tap or Skip goes straight to the gift. The rays turn by a CSS
 * transform, so nothing is drawn again frame by frame; under Reduce Motion the light is there and nothing moves.
 *
 * The sender's own (`GiftSentMoment`) is the same light, smaller and brief, as a gift goes.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  GIFT_MOMENT_LOOK,
  GIFT_MOMENT_MS,
  GIFT_SENT_FADE_MS,
  GIFT_SENT_LOOK,
  GIFT_SENT_MS,
  giftGlow,
  giftMeaning,
  giftSenderName,
  giftRaysPath,
  giftSeed,
  giftSparkles,
  type GiftCard,
  type GiftMomentLook,
  type GiftTier,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { wrapTab } from '../components/Sheet';
import { CheckIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { ApiError } from '../lib/types';
import { lockPageScroll } from '../lib/scrollLock';
import { prefersReducedMotion } from '../lib/motion';
import { useOptimisticSend } from '../lib/optimistic';
import { SendError } from '../reports/SendError';
import { CelebrationArt } from '../ranks/Celebration';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { GiftBox, GiftItemArt, NightSky, useSvgId } from './GiftArt';
import { unwrapMs } from './motion';

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

/** How large the gift stands in its light, by tier: a grand gift the largest. */
const ART: Readonly<Record<GiftTier, number>> = { common: 140, rare: 156, legendary: 156, grand: 172 };

/**
 * The light behind a gift: its glow, the rays turning slowly and the sparkles drifting, all in the gift's colour. `lit`
 * brings the rays up to their full strength (the gift is out); `still` keeps everything where it is.
 */
export function GiftLight({
  sku,
  look,
  art,
  lit,
  still,
  children,
}: {
  sku: string;
  look: GiftMomentLook;
  /** the picture's size in the middle, in pixels */
  art: number;
  lit: boolean;
  still: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const gradient = useSvgId('rays');
  const rays = useMemo(() => giftRaysPath(look.rays, look.reach), [look.rays, look.reach]);
  const sparkles = useMemo(() => giftSparkles(look.sparkles, giftSeed(sku)), [look.sparkles, sku]);
  const glow = giftGlow(sku);
  const style = {
    '--glow': glow,
    // the celebration's flecks and ring take the gift's colour too
    '--t-hi': glow,
    '--t-mid': glow,
    '--light': `${Math.round(art * look.halo)}px`,
    '--glow-strength': `${Math.round(look.glow * 100)}%`,
    '--turn': `${look.turnMs}ms`,
    '--rays-in': `${GIFT_MOMENT_MS.raysIn}ms`,
    '--sparkle-ms': `${GIFT_MOMENT_MS.sparkle}ms`,
  } as CSSProperties;
  return (
    <div className={`gift-light${lit ? ' is-lit' : ''}${still ? ' is-still' : ''}`} style={style}>
      <span className="gift-light-glow" aria-hidden="true" />
      <svg className="gift-light-rays" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={gradient} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="100">
            <stop offset="0.1" style={{ stopColor: glow, stopOpacity: look.rayStrength }} />
            <stop offset="1" style={{ stopColor: glow, stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <path d={rays} fill={`url(#${gradient})`} />
      </svg>
      {sparkles.map((s, i) => (
        <span
          key={i}
          className="gift-light-sparkle"
          aria-hidden="true"
          style={
            {
              left: `${50 + s.x * 50}%`,
              top: `${50 + s.y * 50}%`,
              width: s.size,
              height: s.size,
              '--rise': `${Math.round(s.rise * art * look.halo * -0.5)}px`,
              animationDelay: `${Math.round(-s.offset * GIFT_MOMENT_MS.sparkle)}ms`,
            } as CSSProperties
          }
        />
      ))}
      <div className="gift-light-art">{children}</div>
    </div>
  );
}

/**
 * The opened gift's moment, over the whole screen. While `revealed` is false the wrapped box waits in the light and a
 * tap, Skip or Escape goes on; once true the gift is out, with its words and buttons, and Escape closes.
 */
export function GiftMoment({
  card,
  from,
  revealed,
  actions,
  onSkip,
  onClose,
}: {
  card: GiftCard;
  /** who sent it as the server names them to this reader; empty when it may not */
  from: string;
  revealed: boolean;
  /** what the gift's chat lets it do; absent for a gift on a post */
  actions?: GiftActions;
  onSkip: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const look = GIFT_MOMENT_LOOK[card.tier];
  const still = prefersReducedMotion();
  const meaning = giftMeaning(card.sku, locale);
  const art = ART[card.tier];
  const title = from ? t('gift.from', { name: from }) : t('gift.fromMember');
  const restore = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sendShown = useOptimisticSend();
  const [worn, setWorn] = useState(false);
  const [thanked, setThanked] = useState(false);
  const [failed, setFailed] = useState<ApiError | null>(null);
  // Escape skips while the box waits and closes once the gift is out, read through a ref so the listener is set up once.
  const escape = useRef(onSkip);
  escape.current = revealed ? onClose : onSkip;

  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    const onKey = (e: KeyboardEvent): void => {
      // Focus stays on the moment while it is up, as in any dialog.
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
  }, []);

  // Skip first, so Enter or Space goes straight to the gift; then the title, which says who it is from.
  useEffect(() => {
    (revealed ? titleRef.current : skipRef.current)?.focus({ preventScroll: true });
  }, [revealed]);

  /** Worn or thanked at once; a refusal takes it back and says why under the buttons. */
  async function run(kind: 'wear' | 'thank'): Promise<void> {
    if (!actions) return;
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

  return createPortal(
    <div
      ref={stageRef}
      className={`gift-moment scheme-night gift-moment-${card.tier}${revealed ? ' is-revealed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={from ? t('gift.fromLabel', { name: from }) : t('gift.fromMember')}
      onClick={revealed ? undefined : onSkip}
    >
      {look.sky && <NightSky className={revealed || still ? 'is-settled' : undefined} />}
      <div className="gift-moment-panel">
        <h2 className="gift-moment-title" ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        <GiftLight sku={card.sku} look={look} art={art} lit={revealed} still={still}>
          {revealed ? (
            <div className="celebrate is-playing gift-moment-art">
              <CelebrationArt flecks={look.burst} seed={giftSeed(card.sku)} reach={art} still={still}>
                <GiftItemArt assetUrl={card.assetUrl} category={card.category} size={art} />
              </CelebrationArt>
            </div>
          ) : (
            <GiftBox tier={card.tier} size={Math.round(art * 0.82)} className="gift-moment-box" />
          )}
        </GiftLight>
        {revealed ? (
          <div className="gift-moment-words">
            <p className="gift-moment-name">
              <b lang="ku">{card.name}</b>
              {meaning ? ` · ${meaning}` : ''}
            </p>
            <p className="sr-only" role="status">
              {t('gift.revealed', { item: card.name, name: from || t('gift.someone') })}
            </p>
            <div className="gift-moment-actions">
              {!actions ? null : thanked ? (
                <span className="gift-done" role="status">
                  <CheckIcon size={15} /> {t('gift.thanked')}
                </span>
              ) : (
                <Button size="lg" onClick={() => void run('thank')}>
                  {t('gift.sayThanks')}
                </Button>
              )}
              {actions && card.equippable &&
                (worn ? (
                  <span className="gift-done" role="status">
                    <CheckIcon size={15} /> {t('gift.wearing')}
                  </span>
                ) : (
                  <Button variant="secondary" onClick={() => void run('wear')}>
                    {t('gift.wear')}
                  </Button>
                ))}
              {actions?.sendBack && card.from && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    actions.sendBack!(card);
                  }}
                >
                  {t('gift.sendBack')}
                </Button>
              )}
              <Button variant={actions ? 'ghost' : 'primary'} size={actions ? 'md' : 'lg'} onClick={onClose}>
                {t('gift.close')}
              </Button>
            </div>
            {/* An account limit says what and until when; anything else is a plain "try again". */}
            <SendError error={failed} describe={() => t('gift.actionFailed')} className="gift-moment-error" />
          </div>
        ) : (
          <div className="gift-moment-wait">
            <p className="gift-moment-name" role="status">
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
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The sender's moment as a gift goes: the gift in the same light, smaller, with who it went to, gone after a moment or a
 * tap. Under Reduce Motion it is shown still and goes as soon. A chat announces its sends itself, so there this says
 * nothing to a screen reader; elsewhere (`announce`) its line is said once.
 */
export function GiftSentMoment({
  item,
  line,
  announce = false,
  onDone,
}: {
  item: { sku: string; assetUrl: string | null; category: string };
  /** "Sent to Rojda." */
  line: string;
  announce?: boolean;
  onDone: () => void;
}): React.JSX.Element {
  const still = prefersReducedMotion();
  const done = useRef(onDone);
  done.current = onDone;
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), GIFT_SENT_MS);
    const gone = window.setTimeout(() => done.current(), GIFT_SENT_MS + (still ? 0 : GIFT_SENT_FADE_MS));
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(gone);
    };
  }, [still]);

  return createPortal(
    <div
      className={`gift-sent scheme-night${leaving ? ' is-leaving' : ''}`}
      style={{ '--sent-fade': `${GIFT_SENT_FADE_MS}ms` } as CSSProperties}
      onClick={() => done.current()}
      aria-hidden={announce ? undefined : true}
    >
      <GiftLight sku={item.sku} look={GIFT_SENT_LOOK} art={96} lit still={still}>
        <span className="gift-sent-art">
          <GiftItemArt assetUrl={item.assetUrl} category={item.category} size={96} />
        </span>
      </GiftLight>
      <p className="gift-sent-line" role={announce ? 'status' : undefined}>
        {line}
      </p>
    </div>,
    document.body,
  );
}

/**
 * A gift given onto your own post, opened from its notice: it is opened on the server (`POST /gifts/:id/open`), then
 * its moment plays over the post as in a chat, with Close alone, since a post has no chat to thank in. Nothing shows
 * if it cannot be opened (not yours, or gone).
 */
export function PostGiftOpen({ giftId, onDone }: { giftId: string; onDone: () => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const [card, setCard] = useState<GiftCard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let live = true;
    void client.post<{ card: GiftCard }>(`/gifts/${encodeURIComponent(giftId)}/open`).then((res) => {
      if (!live) return;
      if (res.ok) {
        giftsWereOpened();
        setCard(res.data.card);
      } else done.current();
    });
    return () => {
      live = false;
    };
  }, [client, giftId]);

  // the box waits its tier's time, as in a chat; a tap goes on at once
  useEffect(() => {
    if (!card) return;
    const wait = window.setTimeout(() => setRevealed(true), unwrapMs(card.tier));
    return () => window.clearTimeout(wait);
  }, [card]);

  if (!card) return null;
  return <GiftMoment card={card} from={giftSenderName(card.from) ?? ''} revealed={revealed} onSkip={() => setRevealed(true)} onClose={() => done.current()} />;
}
