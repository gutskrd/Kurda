import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HAND_STAMP_CARD,
  HAND_STAMP_FLIP,
  HAND_STAMP_PARTS,
  HAND_STAMP_WRIST,
  gameEmblemHue,
  gameEmblemSvg,
  handStampFlip,
  handStampSvg,
  stampBox,
  stampLook,
  stampShapeFor,
  stampSvg,
  type GameEmblem,
} from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { prefersReducedMotion } from '../lib/motion';
import { ChevronIcon } from '../components/icons';
import { useOnScreen } from './parts';

/**
 * The front page's games moment: a hand holds up one game's stamp at a time, and every couple of seconds turns it over
 * to show the next game's, through every game the games page lists. The turn is the shared one (art/hand-stamp.ts):
 * the stamp and every finger move together, frame by frame, and the stamp's other face, the next game, comes round as
 * it passes edge-on. A tap turns it at once, and the link under it goes to the games page. It rests while off screen,
 * hovered or focused; under Reduce Motion it holds one stamp, with buttons for the one before and after.
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

/** The whole hand turns about its wrist. */
const WRIST = { transformOrigin: `${HAND_STAMP_WRIST[0]}px ${HAND_STAMP_WRIST[1]}px` } as React.CSSProperties;
/** Every part's moves through a turn, worked out once. */
const FLIP = handStampFlip();

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
  // A turn runs from rest to rest; past edge-on its words are the next game's.
  const [turning, setTurning] = useState(false);
  const [past, setPast] = useState(false);
  const [held, setHeld] = useState(false);
  // Counts the moments it waited in a hidden tab, so it waits again rather than turning unseen.
  const [waited, setWaited] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const turn = useRef<HTMLSpanElement>(null);
  const on = useOnScreen(box, 0.3);
  const step = (by: number): void => setIndex((i) => (i + by + GAMES.length) % GAMES.length);

  // Held up for a moment, then turned, while it is seen and nobody is pointing at it.
  useEffect(() => {
    if (still || !on || held || turning) return;
    const timer = window.setTimeout(() => (document.hidden ? setWaited((n) => n + 1) : setTurning(true)), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [still, on, held, turning, index, waited]);

  // The turn: every part played from its frames. It ends on the next game's face, which is then shown as the front at
  // rest in the same paint (a layout effect), so nothing flickers. Where nothing can be animated it simply moves on.
  useLayoutEffect(() => {
    if (!turning) return;
    const root = art.current;
    const card = turn.current;
    if (!root || !card || typeof card.animate !== 'function') {
      step(1);
      setTurning(false);
      return;
    }
    const timing: KeyframeAnimationOptions = { duration: HAND_STAMP_FLIP.ms, easing: 'linear', fill: 'forwards' };
    const play = (el: Element, frames: string[]): Animation => el.animate(frames.map((transform) => ({ transform })), timing);
    const running: Animation[] = [play(card, FLIP.card)];
    for (const part of HAND_STAMP_PARTS) {
      if (part === 'card') continue;
      const els = part === 'hand' ? root.querySelectorAll('.fp-flip-hand') : root.querySelectorAll(`[data-part="${part}"]`);
      els.forEach((el) => running.push(play(el, FLIP[part])));
    }
    // Its words change as it passes edge-on, on the turn's own clock.
    const edge = card.animate([], { duration: HAND_STAMP_FLIP.ms * HAND_STAMP_FLIP.edgeOn });
    let live = true;
    edge.finished.then(() => live && setPast(true), () => undefined);
    running[0]!.finished.then(
      () => {
        if (!live) return;
        step(1);
        setPast(false);
        setTurning(false);
      },
      () => undefined,
    );
    return () => {
      live = false;
      edge.cancel();
      running.forEach((a) => a.cancel());
    };
  }, [turning]);

  const begin = (): void => {
    if (still) step(1);
    else if (!turning) setTurning(true);
  };

  const shown = GAMES[(index + (past ? 1 : 0)) % GAMES.length]!;
  const next = GAMES[(index + 1) % GAMES.length]!;
  const name = t(shown.name);
  const meaning = shown.meaning ? t(shown.meaning) : null;
  const place = { left: C.cx - C.w / 2, top: C.cy - C.h / 2, width: C.w, height: C.h };
  return (
    <div
      ref={box}
      className={`fp-flip${turning ? ' is-turning' : ''}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="fp-flip-frame">
        <div className="fp-flip-art" ref={art} aria-hidden="true">
          {/* The stamp sits between the hand's two layers, the fingers behind it and the thumb in front. */}
          <span className="fp-flip-hand fp-flip-layer" style={WRIST} dangerouslySetInnerHTML={BACK} />
          <span className="fp-flip-card" style={place}>
            <span className="fp-flip-turn" ref={turn} style={{ transform: `rotate(${C.turn}deg)` }}>
              <span className="fp-flip-face">
                <StampFace game={GAMES[index]!.id} />
              </span>
              {!still && (
                <span className="fp-flip-face is-back">
                  <StampFace game={next.id} />
                </span>
              )}
            </span>
          </span>
          <span className="fp-flip-hand fp-flip-layer" style={WRIST} dangerouslySetInnerHTML={FRONT} />
        </div>
        <button type="button" className="fp-flip-hit" aria-label={`${name}. ${t('landing.games.next')}`} onClick={begin} />
      </div>
      <div className="fp-flip-words">
        <p className="fp-flip-line">{t('landing.games.line')}</p>
        {/* each game's words are new ones, not the last game's moved about, so a longer name shifts nothing */}
        <p className="fp-flip-name" key={shown.id}>
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
