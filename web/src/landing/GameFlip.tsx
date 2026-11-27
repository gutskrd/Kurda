import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HAND_STAMP_CARD,
  HAND_STAMP_FLIP,
  gameEmblemHue,
  gameEmblemSvg,
  handStampFlip,
  handStampShapesAt,
  handStampSvg,
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
 * The front page's games moment: a hand holds up one game's stamp at a time and turns it over to show the next game's,
 * turn after turn on the reference's own clock, through every game the games page lists. The turn is the shared one (art/hand-stamp.ts):
 * the stamp turns on its own clock and the hand is drawn afresh from it every frame, each shape a whole outline passing
 * smoothly between the hand's drawn poses; the stamp's other face, the next game, comes round as it passes edge-on. A
 * tap turns it at once, and the link under it goes to the games page. It rests while off screen, hovered or focused;
 * under Reduce Motion it holds one stamp, with buttons for the one before and after.
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

/**
 * How long a stamp is held up between turns beyond the turn's own still end: nothing, so turns run on as the
 * reference's loop does. Where nothing can be animated the stamps move on only when tapped.
 */
const HOLD_MS = 0;
const ANIMATES = typeof document !== 'undefined' && typeof document.documentElement.animate === 'function';

const BACK = { __html: handStampSvg({ part: 'back', idPrefix: 'fpFlipBack' }) };
const FRONT = { __html: handStampSvg({ part: 'front', idPrefix: 'fpFlipFront' }) };
const C = HAND_STAMP_CARD;
/** The paper of a stamp in the hand by day. */
const STAMP_DAY_PAPER = '#ffffff';
/** The cover on the stamp, inset from the perforations as on the games page's stamps, and clear of the thumb. */
const COVER = { pad: 14, size: Math.min(C.w - 28, C.clear - 16) } as const;

/** The stamp's moves through a turn, worked out once. */
const FLIP = handStampFlip().map((transform) => ({ transform }));
const REST = handStampShapesAt(0);

/** Draws the hand as it is `ms` into a turn: every shape of both its layers, by name. */
function drawHand(shapes: readonly SVGPathElement[], ms: number | null): void {
  const at = ms === null ? REST : handStampShapesAt(ms);
  for (const el of shapes) {
    const d = at[el.dataset.shape ?? ''];
    if (d) el.setAttribute('d', d);
  }
}

/**
 * A game's stamp without its words: a paper for each scheme and its still cover. A stamp in the hand is flat card, as in
 * the reference: no glow, so nothing darkens the fingers or spills past them. By day the paper is white, since the
 * pale tint the shelf uses would vanish into the pale panel without its glow.
 */
function StampFace({ game }: { game: GameEmblem }): React.JSX.Element {
  const art = useMemo(() => {
    const night = stampLook('dark', gameEmblemHue(game));
    const paper = (fill: string): { __html: string } => ({
      __html: stampSvg({ width: C.w, height: C.h, paper: fill, glow: night.glow, strength: 0, ...stampShapeFor(C.w) }),
    });
    return { day: paper(STAMP_DAY_PAPER), night: paper(night.paper), cover: { __html: gameEmblemSvg({ game, size: COVER.size, idPrefix: `fpFlip${game.replace(/-/g, '')}` }) } };
  }, [game]);
  return (
    <>
      <span className="fp-flip-paper fp-flip-paper--day" dangerouslySetInnerHTML={art.day} />
      <span className="fp-flip-paper fp-flip-paper--night" dangerouslySetInnerHTML={art.night} />
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
    if (still || !on || held || turning || !ANIMATES) return;
    const timer = window.setTimeout(() => (document.hidden ? setWaited((n) => n + 1) : setTurning(true)), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [still, on, held, turning, index, waited]);

  // The turn: the stamp played from its frames, and the hand redrawn on every frame from the stamp's own clock, so the
  // two never drift apart however the page's animations are paced. It ends on the next game's face, which is then
  // shown as the front at rest in the same paint (a layout effect), so nothing flickers. Where nothing can be animated
  // it simply moves on.
  useLayoutEffect(() => {
    if (!turning) return;
    const root = art.current;
    const card = turn.current;
    if (!root || !card || typeof card.animate !== 'function') {
      step(1);
      setTurning(false);
      return;
    }
    const shapes = Array.from(root.querySelectorAll<SVGPathElement>('path[data-shape]'));
    const turned = card.animate(FLIP, { duration: HAND_STAMP_FLIP.ms, easing: 'linear', fill: 'forwards' });
    let frame = 0;
    const draw = (): void => {
      drawHand(shapes, Number(turned.currentTime ?? 0));
      frame = requestAnimationFrame(draw);
    };
    draw();
    // Its words change as it passes edge-on, on the turn's own clock.
    const edge = card.animate([], { duration: HAND_STAMP_FLIP.ms * HAND_STAMP_FLIP.edgeOn });
    let live = true;
    edge.finished.then(() => live && setPast(true), () => undefined);
    turned.finished.then(
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
      cancelAnimationFrame(frame);
      edge.cancel();
      turned.cancel();
      drawHand(shapes, null);
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
          <span className="fp-flip-layer" dangerouslySetInnerHTML={BACK} />
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
          <span className="fp-flip-layer" dangerouslySetInnerHTML={FRONT} />
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
