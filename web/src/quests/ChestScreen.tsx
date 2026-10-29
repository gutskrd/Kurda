import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BURST, type ChestOpening, type ChestTier } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { CloseIcon, CoinIcon, SparkleIcon } from '../components/icons';
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

/** The celebration's colours for each tier (ranks.css `tone-*`): gold, blue, violet. */
const TONE: Record<ChestTier, string> = { common: 'zer', rare: 'ciya', epic: 'lutke' };

type Phase = 'closed' | 'opening' | 'open' | 'gone';

/**
 * A quest's chest, opened: the whole screen in its tier's colour, the tier's
 * name, the chest bobbing among a few sparkles, and "Tap to open". A tap asks
 * the server to open it (POST /me/quests/:id/claim, which decides what it
 * holds); the lid pops, a burst of the tier's colours is thrown out, "+N Zêr"
 * lands with the coin the app uses for Zêr, and the balance in the corner
 * counts up to what it is now. Then the next chest waiting, or on.
 *
 * A failure is said plainly and the chest stays shut and waiting: a tap tries
 * again, and nothing is lost. A chest already opened elsewhere (the phone,
 * another tab) says so and lets the learner go on. Nothing here asks for
 * anything, offers more for watching or paying, or counts down.
 *
 * A dialog over everything: focus goes to the chest and stays inside, Escape
 * or ✕ leaves it shut for later, and focus goes back where it was.
 */
export function ChestScreen({
  chests,
  onOpened,
  onClose,
  doneLabel,
}: {
  /** the chests to open, in order */
  chests: ChestToOpen[];
  /** a chest was opened — with what it held, or null when it had been opened already */
  onOpened: (questId: string, opening: ChestOpening | null) => void;
  onClose: () => void;
  /** the button's words once the last chest is open */
  doneLabel: string;
}): React.JSX.Element | null {
  const t = useT();
  const { client } = useAuth();
  const { refresh } = useRail();
  const titleId = useId();
  // the chests as they were when this opened: those opened since stay in the count
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
        // the lesson's own Escape leaves the lesson: this one only closes the chest
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

  // each chest takes the focus as it arrives, and the way on once it is open
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
      // the purse in the top bar shows the new balance too
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
        {opening && <Balance key={index} opening={opening} />}
      </div>
      <div className="chest-stage">
        <h2 className="chest-tier" id={titleId}>
          {tier}
        </h2>
        {phase === 'open' && opening ? (
          <Opened key={index} tier={chest.chest} amount={opening.amount} />
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
              <Chest tier={chest.chest} open={phase === 'gone'} size={208} />
              <span className="chest-sparkles" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`chest-sparkle s${i}`}>
                    <SparkleIcon size={i % 2 ? 18 : 26} />
                  </span>
                ))}
              </span>
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
          // the Button's own look, as a plain button so the focus can be put on it
          <button type="button" ref={go} className="btn btn-primary btn-lg chest-go" onClick={onward}>
            {more ? t('quests.nextChest') : doneLabel}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The lid pops, the tier's colours are thrown out and "+N Zêr" lands: the app's one celebration, felt once. */
function Opened({ tier, amount }: { tier: ChestTier; amount: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const moment = useCelebrationMoment();
  return (
    <div className={`celebrate chest-opened tone-${TONE[tier]} ${moment.playing ? 'is-playing' : 'is-done'}`} onClick={moment.playing ? moment.skip : undefined}>
      <CelebrationArt flecks={BURST.tier} seed={amount * 7 + tier.length} reach={170}>
        <Chest tier={tier} open size={208} className="is-popping" />
      </CelebrationArt>
      <p className="celebrate-details chest-reward">
        <span className="chest-coin" aria-hidden="true">
          <CoinIcon size={30} weight="fill" />
        </span>
        <span dir="ltr">{t('quests.reward', { amount: new Intl.NumberFormat(locale).format(amount) })}</span>
      </p>
    </div>
  );
}

/** The Zêr held now, in the corner, counting up from what it was by what the chest held. */
function Balance({ opening }: { opening: ChestOpening }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const shown = useCountUp(opening.balance, { from: Math.max(0, opening.balance - opening.amount), delayMs: 500 });
  return (
    <p className="chest-balance">
      <CoinIcon size={20} weight="fill" />
      <span aria-hidden="true">{number(shown)}</span>
      {/* said once, as it lands */}
      <span className="sr-only" role="status">
        {t('quests.got', { amount: number(opening.amount), balance: number(opening.balance) })}
      </span>
    </p>
  );
}
