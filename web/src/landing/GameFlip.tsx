import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HAND_STAMP_CARD, gameEmblemHue, gameEmblemSvg, handStampSvg, stampBox, stampLook, stampShapeFor, stampSvg, type GameEmblem } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { prefersReducedMotion } from '../lib/motion';
import { ChevronIcon } from '../components/icons';
import { useOnScreen } from './parts';

/**
 * The front page's games moment: the hand from the phone panel holds up one game's stamp at a time, and every couple of
 * seconds turns it over to show the next game's, through every game the games page lists. A tap turns it at once, and
 * the link under it goes to the games page. It rests while off screen, hovered or focused; under Reduce Motion it holds
 * one stamp, with buttons for the one before and after.
 */

/** Every game the games page lists, in its order, with its name and what the name means (pages/Games.tsx). */
const GAMES: readonly { id: GameEmblem; name: MessageKey; meaning?: MessageKey }[] = [
  { id: 'peyvok', name: 'games.wordle.name' },
  { id: 'rhyme', name: 'games.rhyme.name', meaning: 'games.rhyme.meaning' },
  { id: 'race', name: 'games.race.name', meaning: 'games.race.meaning' },
  { id: 'memory-thief', name: 'games.memory.name', meaning: 'games.memory.meaning' },
  { id: 'detective', name: 'games.detective.name', meaning: 'games.detective.meaning' },
  { id: 'last-letter', name: 'games.lastLetter.name', meaning: 'games.lastLetter.meaning' },
  { id: 'impostor', name: 'games.impostor.name', meaning: 'games.impostor.meaning' },
  { id: 'who-am-i', name: 'games.whoAmI.name', meaning: 'games.whoAmI.meaning' },
];

/** How long a stamp is held up before it turns. */
const HOLD_MS = 2400;

const BACK = { __html: handStampSvg({ part: 'back', idPrefix: 'fpFlipBack' }) };
const FRONT = { __html: handStampSvg({ part: 'front', idPrefix: 'fpFlipFront' }) };
const C = HAND_STAMP_CARD;
/** The cover on the stamp, inset from the perforations as on the games page's stamps, and clear of the thumb. */
const COVER = { pad: 14, size: Math.min(C.w - 28, C.clear - 16) } as const;

/** A game's stamp without its words: the paper in the game's hue, a paper for each scheme, and its still cover. */
function StampFace({ game }: { game: GameEmblem }): React.JSX.Element {
  const art = useMemo(() => {
    const paper = (scheme: 'light' | 'dark'): { inset: number; html: { __html: string } } => {
      const look = stampLook(scheme, gameEmblemHue(game));
      const { inset } = stampBox(C.w, C.h, look.strength, look.reach);
      return { inset, html: { __html: stampSvg({ width: C.w, height: C.h, paper: look.paper, glow: look.glow, strength: look.strength, reach: look.reach, ...stampShapeFor(C.w) }) } };
    };
    return { day: paper('light'), night: paper('dark'), cover: { __html: gameEmblemSvg({ game, size: COVER.size, idPrefix: `fpFlip${game.replace(/-/g, '')}` }) } };
  }, [game]);
  return (
    <>
      <span className="fp-flip-paper fp-flip-paper--day" style={{ inset: -art.day.inset }} dangerouslySetInnerHTML={art.day.html} />
      <span className="fp-flip-paper fp-flip-paper--night" style={{ inset: -art.night.inset }} dangerouslySetInnerHTML={art.night.html} />
      <span className="fp-flip-cover" style={{ top: COVER.pad, left: COVER.pad, width: COVER.size, height: COVER.size }} dangerouslySetInnerHTML={art.cover} />
    </>
  );
}

export function GameFlip(): React.JSX.Element {
  const t = useT();
  const [still] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(0);
  // A turn gathers itself (the fingers set, the stamp winds back a touch), goes out to the stamp's edge, swaps the
  // face there, and comes back in past rest and settles; the stylesheet moves each finger through each part.
  const [phase, setPhase] = useState<'rest' | 'ready' | 'out' | 'in'>('rest');
  const [held, setHeld] = useState(false);
  // Counts the moments it waited in a hidden tab, so it waits again rather than turning unseen.
  const [waited, setWaited] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const on = useOnScreen(box, 0.3);

  // Held up for a moment, then turned, while it is seen and nobody is pointing at it.
  useEffect(() => {
    if (still || !on || held || phase !== 'rest') return;
    const timer = window.setTimeout(() => (document.hidden ? setWaited((n) => n + 1) : setPhase('ready')), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [still, on, held, phase, index, waited]);

  const step = (by: number): void => setIndex((i) => (i + by + GAMES.length) % GAMES.length);
  const turn = (): void => {
    if (still) step(1);
    else if (phase === 'rest') setPhase('ready');
  };
  const turned = (e: React.AnimationEvent): void => {
    if (e.target !== e.currentTarget) return;
    if (phase === 'ready') setPhase('out');
    else if (phase === 'out') {
      step(1);
      setPhase('in');
    } else if (phase === 'in') setPhase('rest');
  };

  const game = GAMES[index]!;
  const name = t(game.name);
  const meaning = game.meaning ? t(game.meaning) : null;
  // Held a little tilted, as a hand holds a card up; it turns about its own upright.
  const card = { left: C.cx - C.w / 2, top: C.cy - C.h / 2, width: C.w, height: C.h, transform: `rotate(${C.turn}deg)` };
  return (
    <div
      ref={box}
      className={`fp-flip is-${phase}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="fp-flip-frame">
        <div className="fp-flip-art" aria-hidden="true">
          {/* the whole hand, with what it holds, swings a little with the turn and back */}
          <span className="fp-flip-sway">
            <span className="fp-flip-layer" dangerouslySetInnerHTML={BACK} />
            <span className="fp-flip-card" style={card}>
              <span className="fp-flip-turn" onAnimationEnd={turned}>
                <StampFace game={game.id} />
              </span>
            </span>
            <span className="fp-flip-layer" dangerouslySetInnerHTML={FRONT} />
          </span>
        </div>
        <button type="button" className="fp-flip-hit" aria-label={`${name}. ${t('landing.games.next')}`} onClick={turn} />
      </div>
      <div className="fp-flip-words">
        <p className="fp-flip-line">{t('landing.games.line')}</p>
        {/* each game's words are new ones, not the last game's moved about, so a longer name shifts nothing */}
        <p className="fp-flip-name" key={game.id}>
          <span dir="auto">{name}</span>
          {meaning && meaning !== name && (
            <span className="fp-flip-meaning" dir="auto">
              {meaning}
            </span>
          )}
        </p>
        {still && (
          <div className="fp-flip-steps">
            <button type="button" className="fp-flip-step is-back" aria-label={t('landing.games.prev')} onClick={() => step(-1)}>
              <ChevronIcon size={18} />
            </button>
            <button type="button" className="fp-flip-step" aria-label={t('landing.games.next')} onClick={() => step(1)}>
              <ChevronIcon size={18} />
            </button>
          </div>
        )}
        <Link to="/app/games" className="fp-flip-all reach-line">
          {t('landing.games.all')}
        </Link>
      </div>
    </div>
  );
}
