import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HAND_STAMP_CARD,
  HAND_STAMP_FLIP,
  HUES,
  gameEmblemHue,
  gameEmblemSvg,
  handStampCardAt,
  handStampFlip,
  handStampShapesAt,
  handStampSvg,
  stampBox,
  stampLook,
  stampOutline,
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
/** The paper round the print: white by day, a little dimmer by night so it does not glare on the dark page. */
const STAMP_PAPER = { day: '#ffffff', night: '#e6e4de' } as const;
/**
 * The print inside the perforations, in the stamp's own units: a panel in the game's deepest colour, the name across
 * its top and the cover below it, whose foot the thumb covers as it holds the stamp.
 */
const PRINT = { inset: 6.5, cover: { top: 33, left: 11, size: C.w - 22 } } as const;

/** The stamp's moves through a turn, worked out once. */
const FLIP = handStampFlip().map((transform) => ({ transform }));
const REST = handStampShapesAt(0);

/** How long the gleam takes to cross the stamp once it has come round, and how soon after it faces us it sets off. */
const SETTLE_GLEAM = { ms: 640, after: 60 } as const;

/**
 * The light on each face through a turn, from the stamp's angle at each of its steps: a face darkens smoothly as it
 * turns away and brightens as it comes round, all the way to facing us, and its glow behind the hand grows and fades
 * with it, so nothing switches on when the stamp settles. A faint sheen crosses it while it turns, left to right over
 * both faces; then, once the stamp coming round faces us, one gleam runs across it from corner to corner, as light over
 * gloss, while it rests in the hand. `face` 0 is the front, turned `turn` degrees from us; the back faces us at 180.
 */
function lightOf(face: 0 | 1): { shade: Keyframe[]; gleam: Keyframe[]; glow: Keyframe[] } {
  const times = FLIP.map((_, k) => (k * HAND_STAMP_FLIP.ms) / (FLIP.length - 1));
  const turns = times.map((ms) => handStampCardAt(ms).turn);
  const facing = times[turns.findIndex((turn) => turn >= 175)] ?? HAND_STAMP_FLIP.ms;
  const from = facing + SETTLE_GLEAM.after;
  // how far each step has a face from facing us toward edge-on, from 0 to 1, eased so it leaves and arrives softly
  const off = turns
    .map((turn) => Math.max(0, Math.min(1, (face === 0 ? turn : 180 - turn) / 90)))
    .map((o) => o * o * (3 - 2 * o));
  // Past edge-on a face is turned away, and its shade goes clear: some browsers draw an animated layer's back even in a
  // face that hides its back, which would lay the turned-away face's full shade over the one now facing us.
  const away = turns.map((turn) => (face === 0 ? turn > 90 : turn < 90));
  return {
    shade: off.map((o, k) => ({ opacity: away[k] ? 0 : o })),
    gleam: off.map((o, k) => {
      const p = (times[k]! - from) / SETTLE_GLEAM.ms;
      if (face === 1 && p >= 0 && p <= 1) {
        const eased = p * p * (3 - 2 * p);
        return { transform: `translateX(${Math.round(-150 + eased * 300)}%) skewX(-18deg)`, opacity: Math.sin(Math.PI * p) ** 0.6 };
      }
      const across = face === 0 ? o : 1 - o;
      return { transform: `translateX(${Math.round(-130 + across * 260)}%) skewX(-16deg)`, opacity: 0.5 * Math.sin(Math.PI * o) };
    }),
    glow: off.map((o) => ({ opacity: 1 - o })),
  };
}
const LIGHT = [lightOf(0), lightOf(1)] as const;
/** The stamp's own outline, for the shade, so it darkens the paper and never the background in its perforations. */
const OUTLINE = stampOutline(C.w, C.h, stampShapeFor(C.w));

/** Draws the hand as it is `ms` into a turn: every shape of both its layers, by name. */
function drawHand(shapes: readonly SVGPathElement[], ms: number | null): void {
  const at = ms === null ? REST : handStampShapesAt(ms);
  for (const el of shapes) {
    const d = at[el.dataset.shape ?? ''];
    if (d) el.setAttribute('d', d);
  }
}

/**
 * A game's stamp as a printed postage stamp: perforated paper (one for each scheme, the stylesheet showing one), a panel
 * in the game's deepest colour with a fine line in its own colour round it, the game's name across the top and its
 * cover. Its glow is drawn apart, behind the hand (`StampGlow`). The colours are the drawing's own (`HUES`), as the
 * cover's are.
 */
function StampFace({ game, name }: { game: GameEmblem; name: string }): React.JSX.Element {
  const art = useMemo(() => {
    const paper = (fill: string): { __html: string } => ({ __html: stampSvg({ width: C.w, height: C.h, paper: fill, glow: fill, strength: 0, ...stampShapeFor(C.w) }) });
    return { day: paper(STAMP_PAPER.day), night: paper(STAMP_PAPER.night), cover: { __html: gameEmblemSvg({ game, size: PRINT.cover.size, idPrefix: `fpFlip${game.replace(/-/g, '')}` }) } };
  }, [game]);
  const ink = HUES.light[gameEmblemHue(game)];
  const print = { inset: PRINT.inset, '--fp-stamp-ground': ink.deep, '--fp-stamp-line': ink.base } as React.CSSProperties;
  const { top, left, size } = PRINT.cover;
  return (
    <>
      <span className="fp-flip-paper fp-flip-paper--day" dangerouslySetInnerHTML={art.day} />
      <span className="fp-flip-paper fp-flip-paper--night" dangerouslySetInnerHTML={art.night} />
      <span className="fp-flip-print" style={print}>
        <span className="fp-flip-title" dir="auto">
          {name}
        </span>
      </span>
      <span className="fp-flip-cover" style={{ top, left, width: size, height: size }} dangerouslySetInnerHTML={art.cover} />
      <svg className="fp-flip-shade" viewBox={`0 0 ${C.w} ${C.h}`} aria-hidden="true">
        <path d={OUTLINE} />
      </svg>
      <span className="fp-flip-glint" style={{ inset: PRINT.inset }}>
        <span className="fp-flip-gleam" />
      </span>
    </>
  );
}

/**
 * A game's stamp's glow in the game's own colour, as the games page's stamp put forward shines, one for each scheme.
 * It lies behind the whole hand and turns with the stamp, so the fingers cover it and it never lies over one.
 */
function StampGlow({ game }: { game: GameEmblem }): React.JSX.Element {
  const art = useMemo(() => {
    const glow = (scheme: 'light' | 'dark'): { inset: number; html: { __html: string } } => {
      const look = stampLook(scheme, gameEmblemHue(game), true);
      const { inset } = stampBox(C.w, C.h, look.strength, look.reach);
      return { inset, html: { __html: stampSvg({ width: C.w, height: C.h, paper: 'none', glow: look.glow, strength: look.strength, reach: look.reach, ...stampShapeFor(C.w) }) } };
    };
    return { day: glow('light'), night: glow('dark') };
  }, [game]);
  return (
    <>
      <span className="fp-flip-paper fp-flip-paper--day" style={{ inset: -art.day.inset }} dangerouslySetInnerHTML={art.day.html} />
      <span className="fp-flip-paper fp-flip-paper--night" style={{ inset: -art.night.inset }} dangerouslySetInnerHTML={art.night.html} />
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
  const glowTurn = useRef<HTMLSpanElement>(null);
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
    // the glow behind the hand turns with the stamp, on the same clock
    const glowed = glowTurn.current?.animate(FLIP, { duration: HAND_STAMP_FLIP.ms, easing: 'linear', fill: 'forwards' });
    // the light on both faces and their glows, on the same clock as the turn
    const timing = { duration: HAND_STAMP_FLIP.ms, easing: 'linear' };
    const lit = Array.from(card.querySelectorAll('.fp-flip-face')).flatMap((face, f) => {
      const light = LIGHT[f === 0 ? 0 : 1];
      return [face.querySelector('.fp-flip-shade')?.animate(light.shade, timing), face.querySelector('.fp-flip-gleam')?.animate(light.gleam, timing)];
    });
    const glows = Array.from(glowTurn.current?.querySelectorAll('.fp-flip-glow') ?? []).map((glow, f) => glow.animate(LIGHT[f === 0 ? 0 : 1].glow, timing));
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
      glowed?.cancel();
      for (const a of lit) a?.cancel();
      for (const a of glows) a.cancel();
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
          {/* The stamp's glow lies behind the whole hand; the stamp sits between its two layers, the fingers behind it and the thumb in front. */}
          <span className="fp-flip-card" style={place}>
            <span className="fp-flip-turn" ref={glowTurn} style={{ transform: `rotate(${C.turn}deg)` }}>
              <span className="fp-flip-glow">
                <StampGlow game={GAMES[index]!.id} />
              </span>
              {!still && (
                <span className="fp-flip-glow is-back">
                  <StampGlow game={next.id} />
                </span>
              )}
            </span>
          </span>
          <span className="fp-flip-layer" dangerouslySetInnerHTML={BACK} />
          <span className="fp-flip-card" style={place}>
            <span className="fp-flip-turn" ref={turn} style={{ transform: `rotate(${C.turn}deg)` }}>
              <span className="fp-flip-face">
                <StampFace game={GAMES[index]!.id} name={t(GAMES[index]!.name)} />
              </span>
              {!still && (
                <span className="fp-flip-face is-back">
                  <StampFace game={next.id} name={t(next.name)} />
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
