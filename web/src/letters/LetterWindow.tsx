import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_NOTES,
  LETTER_PLANT_SWAY,
  LETTER_PLAY,
  LETTER_PLAY_BESIDE,
  LETTER_SILL,
  LETTER_SILL_SPOTS,
  LETTER_SKY,
  LETTER_WINDOW_DEPTH,
  LETTER_WINDOW_PARTS,
  letterBirdSvg,
  letterDrifts,
  letterEnvelopeSvg,
  letterFlightFrom,
  letterPlayShadow,
  letterPlayShows,
  letterShadowSvg,
  letterSillBox,
  letterSillShift,
  letterSpriteSvg,
  letterWindowSvg,
  treeSeasonAt,
  type LetterDrift,
  type LetterPlay,
  type LetterSpot,
  type LetterWindowPart,
  type LetterWindowScene,
  type PigeonPose,
} from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { useTreeSky } from '../tree/TreeScene';

/**
 * The letters page window (shared/src/art/letters.ts and letter-sky.ts), seen from inside: the hour's landscape, the
 * birds out with letters (`sky`), the reader's bird on the sill, and any visiting bird. Its layers give depth: the
 * landscape follows the pointer and drifts, clouds pass, the shutters and plant stir, the sill light pulses, and the
 * season blows past.
 *
 * The birds' actions are the page's news, played with the shared LETTER_PLAY: the reader's bird (`own`) idles, leaves
 * with a letter, is away, or returns with one; a visiting bird (`visitor`) lands with its letter beside the reader's
 * bird, then leaves with the reply or its own letter; new pen pals' birds chirp to each other. Only transform and
 * opacity animate; under Reduce Motion the window is still and each play shows its end. Decorative, since the page
 * says everything in words.
 */
/**
 * What the window acts out, from the shared window logic (shared/src/letter-window.ts) used by the phone too. The
 * reader's bird can also be `here`: back on the sill with its letter without a flight, staying until the letter is read.
 */
export type WindowScene = LetterWindowScene;

/** A spot's square on the sill as a style, and the middle of it on the window, which a flight turns about. */
function placeOf(spot: LetterSpot): React.CSSProperties {
  const box = letterSillBox(spot);
  return { left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.size * 100}%` };
}
function middleOf(spot: LetterSpot): string {
  const box = letterSillBox(spot);
  return `${(box.left + box.size / 2) * 100}% ${(box.top + box.size / 2) * 100}%`;
}

/** The flight from a spot as keyframes for the whole window's square, from the sill out (or, `back`, from far off in). */
function flightFrames(spot: LetterSpot, back: boolean): Keyframe[] {
  const frames = letterFlightFrom(spot).map((k) => ({ offset: k.at, transform: `translate(${k.x * 100}%, ${k.y * 100}%) scale(${k.scale})`, opacity: k.seen }));
  return back ? frames.reverse().map((f) => ({ ...f, offset: 1 - f.offset })) : frames;
}

/** The moment a pigeon taking off leaves the sill (and, landing backwards, comes down on it): it stands until then, and beats its wings from then on. */
const LIFT = LETTER_FLIGHT.keys[1]!.at;
/** How a flight goes over its time: a pigeon leaving gathers speed, one coming in slows to land. Everything in a flight runs on it, so what happens at a place in the flight happens there. */
const FLIGHT_EASING = { out: 'cubic-bezier(0.5, 0, 0.75, 0.6)', in: 'cubic-bezier(0.2, 0.6, 0.35, 1)' } as const;

/** The shadow of a flight on the sill, as keyframes for the bird's square: under it as it goes, gone as it rises. Measured from the flight's own path. */
function flightShadowFrames(spot: LetterSpot, back: boolean): Keyframe[] {
  const share = LETTER_SILL_SPOTS[spot].share;
  const frames = letterFlightFrom(spot).map((k) => {
    const lift = Math.max(0, (-k.y / share) * 0.7);
    const size = Math.max(0.3, 1 - lift * 3);
    return { offset: k.at, opacity: Math.max(0, 1 - lift * 6), transform: `translate(${(k.x / share) * 100}%, 0) scale(${size})` };
  });
  return back ? frames.reverse().map((f) => ({ ...f, offset: 1 - f.offset })) : frames;
}

/** Shown before `at` and not after (or, `after`, the other way about). */
function seenFrames(at: number, after: boolean): Keyframe[] {
  const [before, then] = after ? [0, 1] : [1, 0];
  return [
    { offset: 0, opacity: before },
    { offset: at, opacity: before },
    { offset: Math.min(1, at + 0.001), opacity: then },
    { offset: 1, opacity: then },
  ];
}

const cleanId = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, '');

/** One picture of a pigeon on its square; its shadow is laid on the sill by itself (`Shade`). */
function Pose({
  bird,
  pose,
  letter = false,
  facingLeft = false,
  className = '',
  style,
}: {
  bird: number;
  pose: PigeonPose;
  letter?: boolean;
  facingLeft?: boolean;
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const id = `b${cleanId(useId())}`;
  const svg = useMemo(() => ({ __html: letterBirdSvg({ bird, pose, letter, facingLeft, shadow: false, size: 120, idPrefix: id }) }), [bird, pose, letter, facingLeft, id]);
  return <span className={`lw-pose ${className}`} style={style} dangerouslySetInnerHTML={svg} />;
}

/** The shadow a pigeon casts on the sill, on its square, with the shadow of a letter in its beak (`letter`). */
function Shade({ pose = 'perched', letter = false, facingLeft = false }: { pose?: PigeonPose; letter?: boolean; facingLeft?: boolean }): React.JSX.Element {
  const id = `s${cleanId(useId())}`;
  const svg = useMemo(() => ({ __html: letterShadowSvg({ pose, letter, facingLeft, size: 120, idPrefix: id }) }), [pose, letter, facingLeft, id]);
  return <span className="lw-pose" dangerouslySetInnerHTML={svg} />;
}

/** A pigeon asleep on the sill at night, breathing over its shadow. */
function Asleep({ bird, spot }: { bird: number; spot: LetterSpot }): React.JSX.Element {
  return (
    <>
      <span className="lw-bird" style={placeOf(spot)}>
        <Shade pose="sleep" />
      </span>
      <span className="lw-bird lw-bird--asleep" style={placeOf(spot)}>
        <Pose bird={bird} pose="sleep" />
      </span>
    </>
  );
}

/** Where a letter lies on the sill: its own square, as a share of a pigeon's, and how far down that square the bottom of the envelope is. */
const SILL_LETTER = { share: 0.24, foot: 92 / 120 } as const;

/** A letter lying on the sill `at` (shares of the pigeon's square) in front of the feet of a pigeon facing the way `dir` says. */
function sillLetterPlace(at: number, dir: number): React.CSSProperties {
  const feet = LETTER_BIRD_FEET;
  return {
    left: `${(feet.x / 120 + at * dir - SILL_LETTER.share / 2) * 100}%`,
    top: `${(feet.y / 120 - SILL_LETTER.foot * SILL_LETTER.share) * 100}%`,
    width: `${SILL_LETTER.share * 100}%`,
  };
}

/** An envelope on the sill over its shadow, placed by the pigeon's play, which animates its descent (`innerRef`, `shadeRef`). */
function SillLetter({
  spot,
  style,
  seen = 1,
  shadeSeen = seen,
  innerRef,
  shadeRef,
}: {
  spot: LetterSpot;
  style: React.CSSProperties;
  seen?: number;
  shadeSeen?: number;
  innerRef?: React.Ref<HTMLSpanElement>;
  shadeRef?: React.Ref<HTMLSpanElement>;
}): React.JSX.Element {
  const id = `e${cleanId(useId())}`;
  const svg = useMemo(() => ({ __html: letterEnvelopeSvg({ size: 120, idPrefix: id }) }), [id]);
  const shade = useMemo(() => ({ __html: letterEnvelopeSvg({ shadow: true, size: 120, idPrefix: `${id}s` }) }), [id]);
  return (
    <span className="lw-bird" style={placeOf(spot)}>
      <span className="lw-sill-letter" style={style}>
        <span className="lw-sill-letter-art lw-sill-letter-shade" ref={shadeRef} style={{ opacity: shadeSeen }} dangerouslySetInnerHTML={shade} />
        <span className="lw-sill-letter-art" ref={innerRef} style={{ opacity: seen }} dangerouslySetInnerHTML={svg} />
      </span>
    </span>
  );
}

/**
 * A pigeon's play on the sill (LETTER_PLAY): its frames stacked and switched on the play's clock, the bird moved about
 * its feet over its shadow (letterPlayShadow), with a letter when the play has one. It plays once and calls `onEnd`, or
 * loops when idle; without animation or under Reduce Motion it shows the end.
 */
function Playing({ bird, spot, play, facingLeft = false, onEnd }: { bird: number; spot: LetterSpot; play: LetterPlay; facingLeft?: boolean; onEnd?: () => void }): React.JSX.Element {
  const body = useRef<HTMLSpanElement>(null);
  const layers = useRef<Array<HTMLSpanElement | null>>([]);
  const letter = useRef<HTMLSpanElement>(null);
  const shade = useRef<HTMLSpanElement>(null);
  const shades = useRef<Array<HTMLSpanElement | null>>([]);
  const letterShade = useRef<HTMLSpanElement>(null);
  const shows = useMemo(() => letterPlayShows(play), [play]);
  const shadow = useMemo(() => letterPlayShadow(play), [play]);
  const ended = useRef(onEnd);
  ended.current = onEnd;
  const [still, setStill] = useState(false);
  const dir = facingLeft ? -1 : 1;

  useEffect(() => {
    const el = body.current;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) {
      setStill(true);
      ended.current?.();
      return;
    }
    setStill(false);
    const timing = { duration: play.ms, iterations: play.loop ? Infinity : 1, fill: 'forwards' as const };
    const moving = el.animate(
      play.moves.map((m) => ({ offset: m.at, easing: 'ease-in-out', transform: `translate(${m.x * dir * 100}%, ${m.y * 100}%) rotate(${m.tilt * dir}deg) scale(${m.sx}, ${m.sy})` })),
      timing,
    );
    const runs = [moving];
    shows.forEach((show, i) => {
      const layer = layers.current[i];
      if (layer) runs.push(layer.animate(show.steps.map(([at, seen]) => ({ offset: at, opacity: seen })), timing));
    });
    if (letter.current && play.letter.length) {
      runs.push(letter.current.animate(play.letter.map((k) => ({ offset: k.at, opacity: k.seen, transform: `translateY(${(k.y / SILL_LETTER.share) * 100}%)` })), timing));
    }
    if (letterShade.current && shadow.letter.length) {
      runs.push(letterShade.current.animate(shadow.letter.map((k) => ({ offset: k.at, opacity: k.seen, transform: `scale(${k.size})` })), timing));
    }
    // the shadow keeps to the sill: it goes along under the pigeon but never up with it
    if (shade.current) {
      runs.push(
        shade.current.animate(
          shadow.moves.map((k) => ({ offset: k.at, easing: 'ease-in-out', opacity: k.seen, transform: `translate(${k.x * dir * 100}%, 0) scale(${k.sx}, ${k.sy})` })),
          timing,
        ),
      );
    }
    // the shadow's shape is switched with the pigeon's pictures: side on, turned or facing you, with the letter's while it holds one
    shadow.shapes.forEach((shape, i) => {
      const layer = shades.current[i];
      if (layer) runs.push(layer.animate(shape.steps.map(([at, seen]) => ({ offset: at, opacity: seen })), timing));
    });
    if (!play.loop) moving.onfinish = () => ended.current?.();
    return () => runs.forEach((r) => r.cancel());
  }, [play, shows, shadow, dir]);

  // standing still, it is seen as the play leaves it (or, going round, as it starts)
  const settled = (show: { steps: ReadonlyArray<readonly [number, 0 | 1]> }): number => (play.loop ? show.steps[0]![1] : show.steps[show.steps.length - 1]![1]);
  // the letter is seen as the play starts it until its own clock runs, so it never shows for a moment where it has not yet fallen
  const letterSeen = (still ? play.letter[play.letter.length - 1] : play.letter[0])?.seen ?? 0;
  const letterShadeSeen = (still ? shadow.letter[shadow.letter.length - 1] : shadow.letter[0])?.seen ?? 0;
  return (
    <>
      <span className="lw-bird" style={placeOf(spot)}>
        <span className="lw-shadow" ref={shade}>
          {shadow.shapes.map((shape, i) => (
            <span
              key={`${shape.pose}${shape.letter}`}
              className="lw-play-pose"
              ref={(el) => void (shades.current[i] = el)}
              style={{ opacity: still ? settled(shape) : shape.steps[0]![1] }}
            >
              <Shade pose={shape.pose} letter={shape.letter} facingLeft={facingLeft} />
            </span>
          ))}
        </span>
      </span>
      {play.letter.length > 0 && (
        <SillLetter spot={spot} style={sillLetterPlace(play.letterAt, dir)} seen={letterSeen} shadeSeen={letterShadeSeen} innerRef={letter} shadeRef={letterShade} />
      )}
      <span className="lw-bird" style={placeOf(spot)}>
        <span className="lw-play" ref={body}>
          {shows.map((show, i) => (
            <span key={`${show.pose}${show.letter}`} className="lw-play-pose" ref={(el) => void (layers.current[i] = el)} style={{ opacity: still ? settled(show) : show.steps[0]![1] }}>
              <Pose bird={bird} pose={show.pose} letter={show.letter} facingLeft={facingLeft} />
            </span>
          ))}
        </span>
      </span>
    </>
  );
}

/** A pigeon in flight, beating its wings and standing only while on the sill, switched on the flight's clock (`useFlight`). */
function Flying({ bird, spot, facingLeft, back }: { bird: number; spot: LetterSpot; facingLeft: boolean; back: boolean }): React.JSX.Element {
  return (
    <span className="lw-bird" style={placeOf(spot)}>
      <Pose bird={bird} pose="perched" letter facingLeft={facingLeft} className="lw-flight-stand" style={{ opacity: back ? 0 : 1 }} />
      <span className="lw-wings" style={{ opacity: back ? 1 : 0 }}>
        <Pose bird={bird} pose="wings-up" letter facingLeft={facingLeft} className="lw-pose--up" />
        <Pose bird={bird} pose="wings-down" letter facingLeft={facingLeft} className="lw-pose--down" />
      </span>
    </span>
  );
}

/** One layer of the window, moved by the pointer as far as its depth says. */
function Layer({ part, sky, id }: { part: LetterWindowPart; sky: ReturnType<typeof useTreeSky>; id: string }): React.JSX.Element {
  const svg = useMemo(() => ({ __html: letterWindowSvg({ sky, part, size: 480, idPrefix: `${id}${part}` }) }), [sky, part, id]);
  return (
    <span className={`lw-layer lw-layer--${part}`} style={{ '--depth': LETTER_WINDOW_DEPTH[part] } as React.CSSProperties}>
      <span className="lw-layer-art" dangerouslySetInnerHTML={svg} />
    </span>
  );
}

/** Keyframes for something on the window's square, a box `size` wide whose middle goes where `keys` say, turned and seen as they say. */
function placeFrames(keys: LetterDrift['keys'], size: number): Keyframe[] {
  return keys.map((k) => ({ offset: k.at, opacity: k.seen, transform: `translate(${(k.x / size - 0.5) * 100}%, ${(k.y / size - 0.5) * 100}%) rotate(${k.turn}deg)` }));
}

/**
 * Small drifting things, each looping on its own path (or once with `once`), offset so none move in step. Under Reduce
 * Motion or without animation they are not drawn.
 */
function Drifts({ drifts, depth, once = false, className = '' }: { drifts: readonly LetterDrift[]; depth: number; once?: boolean; className?: string }): React.JSX.Element | null {
  const els = useRef<Array<HTMLSpanElement | null>>([]);
  const id = `d${cleanId(useId())}`;
  const svgs = useMemo(() => drifts.map((d, i) => ({ __html: letterSpriteSvg({ sprite: d.sprite, size: 60, idPrefix: `${id}${i}` }) })), [drifts, id]);
  const [moving] = useState(() => !prefersReducedMotion() && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function');
  useEffect(() => {
    if (!moving) return;
    const runs = drifts.flatMap((d, i) => {
      const el = els.current[i];
      if (!el) return [];
      return [el.animate(placeFrames(d.keys, d.size), { duration: d.ms, delay: once ? 0 : -d.delay * d.ms, iterations: once ? 1 : Infinity, easing: 'linear', fill: once ? 'forwards' : 'none' })];
    });
    return () => runs.forEach((r) => r.cancel());
  }, [drifts, once, moving]);
  if (!moving) return null;
  return (
    <span className={`lw-layer lw-life ${className}`} style={{ '--depth': depth } as React.CSSProperties}>
      {drifts.map((d, i) => (
        <span key={i} className="lw-drift" ref={(el) => void (els.current[i] = el)} style={{ width: `${d.size * 100}%`, opacity: 0 }}>
          <span className={`lw-drift-art${d.flap ? ' lw-drift-art--flap' : ''}`} dangerouslySetInnerHTML={svgs[i]!} />
        </span>
      ))}
    </span>
  );
}

/** The birds out with letters, each circling on its own path (LETTER_SKY); still under Reduce Motion. */
function SkyBirds({ birds }: { birds: readonly number[] }): React.JSX.Element {
  const els = useRef<Array<HTMLSpanElement | null>>([]);
  const flips = useRef<Array<HTMLSpanElement | null>>([]);
  const shown = useMemo(() => birds.slice(0, LETTER_SKY.length), [birds]);
  const which = shown.join(',');
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const runs = which.split(',').flatMap((_, i) => {
      const route = LETTER_SKY[i];
      const el = els.current[i];
      const flip = flips.current[i];
      if (!route || !el || !flip || typeof el.animate !== 'function') return [];
      // a turn is sudden, as a bird turns: its facing changes between two keys a moment apart
      const turns: Keyframe[] = [];
      route.keys.forEach((k, j) => {
        const before = j === 0 ? k.facing : route.keys[j - 1]!.facing;
        if (before !== k.facing) turns.push({ offset: Math.max(0, k.at - 0.001), transform: `scaleX(${before})` });
        turns.push({ offset: k.at, transform: `scaleX(${k.facing})` });
      });
      const timing = { duration: route.ms, iterations: Infinity, easing: 'linear' };
      const path = placeFrames(
        route.keys.map((k) => ({ ...k, turn: 0, seen: 1 })),
        route.size,
      );
      return [el.animate(path, timing), flip.animate(turns, timing)];
    });
    return () => runs.forEach((r) => r.cancel());
  }, [which]);
  return (
    <span className="lw-layer lw-life" style={{ '--depth': 0.016 } as React.CSSProperties}>
      {shown.map((bird, i) => {
        const route = LETTER_SKY[i]!;
        const start = route.keys[0]!;
        return (
          <span
            key={`${i}-${bird}`}
            className="lw-drift lw-sky-bird"
            ref={(el) => void (els.current[i] = el)}
            style={{ width: `${route.size * 100}%`, transform: `translate(${(start.x / route.size - 0.5) * 100}%, ${(start.y / route.size - 0.5) * 100}%)` }}
          >
            <span className="lw-drift-art" ref={(el) => void (flips.current[i] = el)}>
              <Pose bird={bird} pose="wings-up" letter className="lw-pose--up" />
              <Pose bird={bird} pose="wings-down" letter className="lw-pose--down" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Where one bird's story on the sill has got to: standing, playing before it goes, flying, playing after it comes, or at home again after a letter. */
type Phase = 'rest' | 'play' | 'flight' | 'after' | 'settled';
/** One bird's part in the scene, the same for your own and a visitor. */
type Life = { kind: 'none' } | { kind: 'home'; bird: number } | { kind: 'here'; bird: number } | { kind: 'leaving'; bird: number; play: LetterPlay } | { kind: 'arriving'; bird: number };

interface Flight {
  phase: Phase;
  setPhase: (p: Phase) => void;
  inside: React.RefObject<HTMLSpanElement | null>;
  outside: React.RefObject<HTMLSpanElement | null>;
  shade: React.RefObject<HTMLSpanElement | null>;
}

/**
 * A bird's flight off or onto the sill, as two copies (behind the room and in front) swapped as it passes the window,
 * all on one eased clock with its shadow. Returns the phase and the elements to place.
 */
function useFlight(life: Life, spot: LetterSpot, onGone: () => void): Flight {
  const [phase, setPhase] = useState<Phase>(life.kind === 'here' ? 'settled' : 'rest');
  const inside = useRef<HTMLSpanElement>(null);
  const outside = useRef<HTMLSpanElement>(null);
  const shade = useRef<HTMLSpanElement>(null);
  const gone = useRef(onGone);
  gone.current = onGone;
  // a bird leaving plays first and then flies; one coming flies first and then plays
  useLayoutEffect(() => {
    setPhase(life.kind === 'leaving' ? 'play' : life.kind === 'arriving' ? 'flight' : life.kind === 'here' ? 'settled' : 'rest');
  }, [life]);
  const back = life.kind === 'arriving';
  useEffect(() => {
    if (phase !== 'flight') return;
    const finish = (): void => {
      if (back) setPhase('after');
      else gone.current();
    };
    const copies = [inside.current, outside.current];
    // a page that cannot animate, or a reader who asked for less motion, sees the flight as it ends
    if (prefersReducedMotion() || copies.some((c) => !c || typeof c.animate !== 'function')) {
      finish();
      return;
    }
    // One eased clock, so the pigeon goes behind the room only once through the window, and stands only on the sill.
    const timing = { duration: LETTER_FLIGHT.ms, easing: back ? FLIGHT_EASING.in : FLIGHT_EASING.out, fill: 'forwards' as const };
    const swap = back ? 1 - LETTER_FLIGHT.behindAt : LETTER_FLIGHT.behindAt;
    const lift = back ? 1 - LIFT : LIFT;
    const runs = copies.flatMap((copy, i) => {
      const flight = [copy!.animate(flightFrames(spot, back), timing), (copy!.firstElementChild as HTMLElement).animate(seenFrames(swap, (i === 1) !== back), timing)];
      const stand = copy!.querySelector<HTMLElement>('.lw-flight-stand');
      const wings = copy!.querySelector<HTMLElement>('.lw-wings');
      if (stand) flight.push(stand.animate(seenFrames(lift, back), timing));
      if (wings) flight.push(wings.animate(seenFrames(lift, !back), timing));
      return flight;
    });
    if (shade.current) runs.push(shade.current.animate(flightShadowFrames(spot, back), timing));
    runs[0]!.onfinish = finish;
    return () => runs.forEach((r) => r.cancel());
  }, [phase, back, spot]);
  return { phase, setPhase, inside, outside, shade };
}

/** The bird a life is about, while it has one. */
const birdOf = (life: Life): number | null => (life.kind === 'none' ? null : life.bird);

/** One copy of a flying bird, outside the room or in it. */
function FlightCopy({ copyRef, life, spot, facingLeft }: { copyRef: React.Ref<HTMLSpanElement>; life: Life; spot: LetterSpot; facingLeft: boolean }): React.JSX.Element | null {
  const bird = birdOf(life);
  if (bird === null) return null;
  return (
    <span className="lw-flight" ref={copyRef} style={{ transformOrigin: middleOf(spot) }}>
      <span className="lw-flight-seen">
        <Flying bird={bird} spot={spot} facingLeft={facingLeft} back={life.kind === 'arriving'} />
      </span>
    </span>
  );
}

/**
 * A bird on the sill between flights: standing (asleep at night if allowed), playing, or settled with its letter. To
 * face the other way it turns on the spot through facing the viewer.
 */
function OnSill({
  life,
  flight,
  spot,
  facingLeft,
  asleep,
  beside,
}: {
  life: Life;
  flight: Flight;
  spot: LetterSpot;
  facingLeft: boolean;
  asleep: boolean;
  /** another bird is on the sill: it plays without turning round toward it */
  beside: boolean;
}): React.JSX.Element | null {
  const bird = birdOf(life);
  const { phase, setPhase } = flight;
  const [facing, setFacing] = useState(facingLeft);
  // in the air it faces the way it flies, so it lands facing the way it is meant to
  useEffect(() => {
    if (phase === 'flight') setFacing(facingLeft);
  }, [phase, facingLeft]);
  if (bird === null || phase === 'flight') return null;
  if (facing !== facingLeft) return <Playing key="turn" bird={bird} spot={spot} play={LETTER_PLAY.turn} facingLeft={facing} onEnd={() => setFacing(facingLeft)} />;
  const dir = facingLeft ? -1 : 1;
  const plays = beside ? LETTER_PLAY_BESIDE : LETTER_PLAY;
  if (phase === 'play' && life.kind === 'leaving') return <Playing key="play" bird={bird} spot={spot} play={life.play} facingLeft={facingLeft} onEnd={() => setPhase('flight')} />;
  if (phase === 'after') return <Playing key="after" bird={bird} spot={spot} play={plays.after} facingLeft={facingLeft} onEnd={() => setPhase('settled')} />;
  if (phase === 'settled')
    return (
      <>
        <SillLetter spot={spot} style={sillLetterPlace(LETTER_PLAY.after.letterAt, dir)} />
        <Playing key="settled" bird={bird} spot={spot} play={plays.idle} facingLeft={facingLeft} />
      </>
    );
  return asleep ? <Asleep bird={bird} spot={spot} /> : <Playing key="idle" bird={bird} spot={spot} play={plays.idle} facingLeft={facingLeft} />;
}

/** The shadow a flying bird leaves on the sill, from its spot, moved by its flight (`useFlight`). */
function FlightShade({ flight, spot, facingLeft, back }: { flight: Flight; spot: LetterSpot; facingLeft: boolean; back: boolean }): React.JSX.Element | null {
  if (flight.phase !== 'flight') return null;
  return (
    <span className="lw-bird" style={placeOf(spot)}>
      <span className="lw-shadow" ref={flight.shade} style={{ opacity: back ? 0 : 1 }}>
        <Shade letter facingLeft={facingLeft} />
      </span>
    </span>
  );
}

/** The reader's bird hops aside, with its letter and shadow, when a visitor comes, and back when it goes. */
function useHop(spot: LetterSpot): React.RefObject<HTMLSpanElement | null> {
  const el = useRef<HTMLSpanElement>(null);
  const was = useRef(spot);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = spot;
    const node = el.current;
    if (from === spot || !node || typeof node.animate !== 'function' || prefersReducedMotion()) return;
    // drawn at its new place, it starts where it stood and hops across, a little up in the middle of the hop
    const back = letterSillShift(spot, from);
    const along = back.x * LETTER_SILL_SPOTS[spot].share * 100;
    const run = node.animate(
      [
        { transform: `translate(${along}%, 0) scale(${back.scale})` },
        { offset: 0.5, transform: `translate(${along / 2}%, -4%) scale(${(1 + back.scale) / 2})` },
        { transform: 'none' },
      ],
      { duration: 650, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
    );
    return () => run.cancel();
  }, [spot]);
  return el;
}

const BACK: readonly LetterWindowPart[] = LETTER_WINDOW_PARTS.filter((p) => p === 'sky' || p === 'clouds' || p === 'far' || p === 'near');
const ROOM: readonly LetterWindowPart[] = ['room', 'left', 'right', 'plant'];

/** Your own bird's part in the scene, as a life on the sill. */
function ownLife(own: WindowScene['own']): Life {
  if (own.kind === 'away') return { kind: 'none' };
  if (own.kind === 'leaving') return { kind: 'leaving', bird: own.bird, play: LETTER_PLAY.before };
  return own;
}
/** A visitor's part in the scene, as a life on the sill: answered, your letter drops before it and it takes it; sent on, it picks its own up again. */
function visitorLife(visitor: WindowScene['visitor']): Life {
  if (visitor.kind === 'none') return visitor;
  if (visitor.kind === 'leaving') return { kind: 'leaving', bird: visitor.bird, play: visitor.how === 'answered' ? LETTER_PLAY.take : LETTER_PLAY.fetch };
  return visitor;
}

export function LetterWindow({
  scene,
  onOwnGone,
  onVisitorGone,
  onVisitorLanded,
  onOwnLanded,
  onTouchdown,
}: {
  scene: WindowScene;
  /** your bird has flown off through the window */
  onOwnGone?: () => void;
  /** the visiting bird has flown off through the window */
  onVisitorGone?: () => void;
  /** the bird in the visitor's spot, called or bringing a pen pal's letter, has landed and laid its letter down */
  onVisitorLanded?: () => void;
  /** your own bird has flown home and laid the letter it brought on the sill */
  onOwnLanded?: () => void;
  /** a bird flying in has come down on the sill, in your own bird's spot or the visitor's: its letter is there from now on */
  onTouchdown?: (spot: 'own' | 'sill') => void;
}): React.JSX.Element {
  const sky = useTreeSky();
  const id = `w${cleanId(useId())}`;
  const frame = useRef<HTMLDivElement>(null);
  const own = useMemo(() => ownLife(scene.own), [scene.own]);
  const visitor = useMemo(() => visitorLife(scene.visitor), [scene.visitor]);
  // with a bird visiting, your own stands aside, facing it
  const ownSpot: LetterSpot = visitor.kind === 'none' ? 'alone' : 'own';
  const ownFlight = useFlight(own, ownSpot, () => onOwnGone?.());
  const visitorFlight = useFlight(visitor, 'visitor', () => onVisitorGone?.());
  const hop = useHop(ownSpot);
  const landed = useRef(onVisitorLanded);
  landed.current = onVisitorLanded;
  useEffect(() => {
    if (visitor.kind === 'arriving' && visitorFlight.phase === 'settled') landed.current?.();
  }, [visitor.kind, visitorFlight.phase]);
  // your own bird home: said once it is down and has laid its letter, which is when the letter has landed (at once
  // for a reader who asked for less motion, whose flight is seen as it ends)
  const ownLanded = useRef(onOwnLanded);
  ownLanded.current = onOwnLanded;
  useEffect(() => {
    if (own.kind === 'arriving' && ownFlight.phase === 'settled') ownLanded.current?.();
  }, [own.kind, ownFlight.phase]);
  // the moment a bird coming in is down, before it has laid its letter and looked about: a page closed during that
  // play has still seen the bird land, so it is said then too
  const touchdown = useRef(onTouchdown);
  touchdown.current = onTouchdown;
  useEffect(() => {
    if (own.kind === 'arriving' && ownFlight.phase === 'after') touchdown.current?.('own');
  }, [own.kind, ownFlight.phase]);
  useEffect(() => {
    if (visitor.kind === 'arriving' && visitorFlight.phase === 'after') touchdown.current?.('sill');
  }, [visitor.kind, visitorFlight.phase]);
  const drifts = useMemo(() => letterDrifts(treeSeasonAt(new Date()), sky), [sky]);
  // the notes rise once each time two people become pen pals, and are gone again after
  const [song, setSong] = useState<number | null>(null);
  const seenSong = useRef(scene.song);
  useEffect(() => {
    if (scene.song === seenSong.current) return;
    seenSong.current = scene.song;
    setSong(scene.song ?? null);
    const done = window.setTimeout(() => setSong(null), 2800);
    return () => window.clearTimeout(done);
  }, [scene.song]);

  // the pointer over the window turns the country behind its frame
  const look = (e: React.PointerEvent<HTMLDivElement>): void => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || e.pointerType === 'touch') return;
    frame.current!.style.setProperty('--px', String(((e.clientX - box.left) / box.width - 0.5) * 2));
    frame.current!.style.setProperty('--py', String(((e.clientY - box.top) / box.height - 0.5) * 2));
  };
  const rest = (): void => {
    frame.current?.style.setProperty('--px', '0');
    frame.current?.style.setProperty('--py', '0');
  };

  // a bird flies off to the right of the window, wherever it stood, and comes in facing the way it comes; your own stays
  // facing the letter it brought home until that is read (`here`, once it has landed), and then turns round
  const ownBack = own.kind === 'arriving' || own.kind === 'here';
  const visitorBack = visitor.kind === 'arriving';
  const plant = {
    '--plant-x': `${(LETTER_PLANT_SWAY.x / 120) * 100}%`,
    '--plant-y': `${(LETTER_PLANT_SWAY.y / 120) * 100}%`,
    '--plant-turn': `${LETTER_PLANT_SWAY.turn}deg`,
    '--plant-ms': `${LETTER_PLANT_SWAY.ms}ms`,
  } as React.CSSProperties;
  return (
    <div className="lw" aria-hidden="true" ref={frame} onPointerMove={look} onPointerLeave={rest} style={plant}>
      {BACK.slice(0, 2).map((part) => (
        <Layer key={part} part={part} sky={sky} id={id} />
      ))}
      <SkyBirds birds={scene.sky} />
      {BACK.slice(2).map((part) => (
        <Layer key={part} part={part} sky={sky} id={id} />
      ))}
      <Drifts drifts={drifts} depth={LETTER_WINDOW_DEPTH.near * 0.7} />
      {ownFlight.phase === 'flight' && <FlightCopy copyRef={ownFlight.outside} life={own} spot={ownSpot} facingLeft={ownBack} />}
      {visitorFlight.phase === 'flight' && <FlightCopy copyRef={visitorFlight.outside} life={visitor} spot="visitor" facingLeft={visitorBack} />}
      {ROOM.map((part) => (
        <Layer key={part} part={part} sky={sky} id={id} />
      ))}
      {/* the light lies on the sill, so a pigeon standing there is over it, never under it */}
      <Layer part="light" sky={sky} id={id} />
      <span className="lw-own" ref={hop} style={{ transformOrigin: `${(LETTER_SILL_SPOTS[ownSpot].x / 120) * 100}% ${(LETTER_SILL.y / 120) * 100}%` }}>
        <FlightShade flight={ownFlight} spot={ownSpot} facingLeft={ownBack} back={ownBack} />
        <OnSill life={own} flight={ownFlight} spot={ownSpot} facingLeft={ownBack} asleep={sky === 'night'} beside={visitor.kind !== 'none'} />
      </span>
      <FlightShade flight={visitorFlight} spot="visitor" facingLeft={visitorBack} back={visitorBack} />
      <OnSill life={visitor} flight={visitorFlight} spot="visitor" facingLeft asleep={false} beside />
      {ownFlight.phase === 'flight' && <FlightCopy copyRef={ownFlight.inside} life={own} spot={ownSpot} facingLeft={ownBack} />}
      {visitorFlight.phase === 'flight' && <FlightCopy copyRef={visitorFlight.inside} life={visitor} spot="visitor" facingLeft={visitorBack} />}
      {song !== null && <Drifts key={song} drifts={LETTER_NOTES} depth={0} once className="lw-song" />}
    </div>
  );
}
