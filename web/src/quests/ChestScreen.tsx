import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BURST, CHEST_HOP_LAND, CHEST_HOP_MS, celebrationPlan, type ChestOpening, type ChestTier } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { CloseIcon, CoinIcon } from '../components/icons';
import { wrapTab } from '../components/Sheet';
import { CelebrationArt } from '../ranks/Celebration';
import { useRail } from '../social/RailProvider';
import { describeError } from '../lib/api';
import { useCelebrationMoment, useCountUp } from '../lib/motion';
import { lockPageScroll } from '../lib/scrollLock';
import { playLessonSound } from '../lib/sounds';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Chest } from './Chest';
import './quests.css';

/** A chest waiting to be opened: its quest, and how much it holds. */
export interface ChestToOpen {
  id: string;
  chest: ChestTier;
}

const TIER: Record<ChestTier, MessageKey> = {
  common: 'quests.tier.common',
  rare: 'quests.tier.rare',
  epic: 'quests.tier.epic',
};

/** The celebration's colours for each tier (ranks.css `tone-*`): gold, pale gold and copper. */
const TONE: Record<ChestTier, string> = { common: 'zer', rare: 'sterk', epic: 'sifir' };
/** How far the open chest's rays reach, as a multiple of the drawing's own, across most of the screen. */
const RAYS_REACH = 2.4;
/**
 * The celebration starts as the chest lands from its hop (shared CHEST_HOP, played by quests.css), not at its first
 * frame; the stylesheet delays the ring and the words by the same amount.
 */
const LAND_DELAY_MS = CHEST_HOP_MS * CHEST_HOP_LAND - celebrationPlan(false).hapticAtMs;

type Phase = 'closed' | 'opening' | 'open' | 'gone';

/**
 * Opening a quest's chest over the whole screen in its tier's colour. A tap claims it (POST /me/quests/:id/claim,
 * where the server decides the reward); the lid pops, colours burst out, "+N Zêr" lands and the corner balance counts
 * up. Then the next waiting chest, or onward. A failure leaves the chest shut for another tap; one opened elsewhere
 * says so. As a dialog it traps focus, Escape or ✕ leaves it shut for later, and focus returns where it was.
 */
export function ChestScreen({
  chests,
  onOpened,
  onClose,
  doneLabel,
}: {
  /** The chests to open, in order. */
  chests: ChestToOpen[];
  /** A chest was opened, with what it held, or null when it had been opened already. */
  onOpened: (questId: string, opening: ChestOpening | null) => void;
  onClose: () => void;
  /** The button's label once the last chest is open. */
  doneLabel: string;
}): React.JSX.Element | null {
  const t = useT();
  const { client } = useAuth();
  const { refresh } = useRail();
  const titleId = useId();
  // The chests as they were on opening, so those opened since stay in the count.
  const [queue] = useState(chests);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('closed');
  const [opening, setOpening] = useState<ChestOpening | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const tap = useRef<HTMLButtonElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const busy = useRef(false);
  busy.current = phase === 'opening';
  const chest = queue[index];

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // The lesson's own Escape would leave the lesson; this one only closes the chest.
        e.preventDefault();
        if (!busy.current) close.current();
      } else if (box.current) wrapTab(e, box.current);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      unlock();
      restore?.focus?.({ preventScroll: true });
    };
  }, []);

  // Each chest takes focus as it arrives, and the onward button once it is open.
  useEffect(() => {
    if (phase === 'closed') tap.current?.focus({ preventScroll: true });
    else if (phase === 'open' || phase === 'gone') go.current?.focus({ preventScroll: true });
  }, [phase, index]);

  if (!chest) return null;

  const open = async (): Promise<void> => {
    if (sending.current || phase !== 'closed') return;
    sending.current = true;
    setPhase('opening');
    setProblem(null);
    const res = await client.post<ChestOpening>(`/me/quests/${encodeURIComponent(chest.id)}/claim`);
    sending.current = false;
    if (res.ok) {
      setOpening(res.data);
      setPhase('open');
      onOpened(chest.id, res.data);
      playLessonSound('reward');
      // The purse in the top bar shows the new balance too.
      refresh();
      return;
    }
    if (res.error.code === 'QUEST_CLAIMED') {
      setPhase('gone');
      onOpened(chest.id, null);
      return;
    }
    setPhase('closed');
    setProblem(res.error.code === 'QUEST_NOT_DONE' ? t('quests.notDone') : `${describeError(res.error, t)} ${t('quests.stillHere')}`);
  };

  const more = index < queue.length - 1;
  const onward = (): void => {
    if (!more) {
      onClose();
      return;
    }
    setIndex(index + 1);
    setPhase('closed');
    setOpening(null);
    setProblem(null);
  };
  const tier = t(TIER[chest.chest]);

  return createPortal(
    <div className={`chest-screen tier-${chest.chest} is-${phase}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box}>
      <div className="chest-top">
        <button type="button" className="chest-close" aria-label={t('common.close')} onClick={onClose} disabled={phase === 'opening'}>
          <CloseIcon size={22} />
        </button>
        {opening?.earnsZer && <Balance key={index} opening={opening} />}
      </div>
      <div className="chest-stage">
        <h2 className="chest-tier" id={titleId}>
          {tier}
        </h2>
        {phase === 'open' && opening ? (
          <Opened key={index} tier={chest.chest} amount={opening.amount} earnsZer={opening.earnsZer} />
        ) : (
          <button
            type="button"
            ref={tap}
            className="chest-tap"
            onClick={() => void open()}
            aria-label={t('quests.openChest')}
            aria-disabled={phase !== 'closed'}
          >
            <span className="chest-float">
              <Chest tier={chest.chest} open={phase === 'gone'} shine={phase === 'closed'} size={208} />
            </span>
            <span className="chest-hint" aria-hidden="true">
              {phase === 'opening' ? t('quests.opening') : phase === 'gone' ? '' : t('quests.tapToOpen')}
            </span>
          </button>
        )}
        {problem && (
          <p className="chest-problem" role="alert">
            {problem}
          </p>
        )}
        {phase === 'gone' && (
          <p className="chest-note" role="status">
            {t('quests.alreadyOpen')}
          </p>
        )}
      </div>
      <div className="chest-foot">
        {(phase === 'open' || phase === 'gone') && (
          // Styled as a Button, but a plain button so focus can be put on it.
          <button type="button" ref={go} className="btn btn-primary btn-lg chest-go" onClick={onward}>
            {more ? t('quests.nextChest') : doneLabel}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The opened chest: it hops, rays and the tier's colours burst out as it lands, its count rises and "+N Zêr" lands. For
 * someone who does not earn Zêr it says, once, that Zêr is a members' perk instead of counting none.
 */
function Opened({ tier, amount, earnsZer }: { tier: ChestTier; amount: number; earnsZer: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const moment = useCelebrationMoment(LAND_DELAY_MS);
  const number = new Intl.NumberFormat(locale).format(amount);
  return (
    <div className={`celebrate chest-opened tone-${TONE[tier]} ${moment.playing ? 'is-playing' : 'is-done'}`} onClick={moment.playing ? moment.skip : undefined}>
      <CelebrationArt flecks={BURST.tier} seed={amount * 7 + tier.length} reach={170} delayMs={LAND_DELAY_MS}>
        <span className="chest-open-stage">
          {earnsZer && (
            <span className="chest-tile" aria-hidden="true">
              <CoinIcon size={36} weight="fill" />
              <span dir="ltr">{`× ${number}`}</span>
            </span>
          )}
          <Chest tier={tier} open popping reach={RAYS_REACH} size={208} />
        </span>
      </CelebrationArt>
      {earnsZer ? (
        <p className="celebrate-details chest-reward">
          <span className="chest-coin" aria-hidden="true">
            <CoinIcon size={30} weight="fill" />
          </span>
          <span dir="ltr">{t('quests.reward', { amount: number })}</span>
        </p>
      ) : (
        <p className="celebrate-details chest-members" role="status">
          {t('quests.membersZer')}
        </p>
      )}
    </div>
  );
}

/** The Zêr balance in the corner, counting up by what the chest held. */
function Balance({ opening }: { opening: ChestOpening }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const shown = useCountUp(opening.balance, { from: Math.max(0, opening.balance - opening.amount), delayMs: 500 });
  return (
    <p className="chest-balance">
      <CoinIcon size={20} weight="fill" />
      <span aria-hidden="true">{number(shown)}</span>
      {/* Announced once, as it lands. */}
      <span className="sr-only" role="status">
        {t('quests.got', { amount: number(opening.amount), balance: number(opening.balance) })}
      </span>
    </p>
  );
}
