import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_PLAY,
  LETTER_SILL,
  LETTER_WINDOW_DEPTH,
  LETTER_WINDOW_PARTS,
  letterBirdSvg,
  letterEnvelopeSvg,
  letterPlayShows,
  letterWindowSvg,
  type LetterPlay,
  type LetterWindowPart,
  type PigeonPose,
} from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { useTreeSky } from '../tree/TreeScene';

/**
 * Your window on the letters page (shared/src/art/letters.ts), seen from
 * inside the room: the hour's country through it and, on the sill, a pigeon.
 *
 * The window is laid in its layers, so it has depth: the country behind the
 * frame moves as the pointer moves over it, and drifts a little of itself,
 * the near meadow more than the far mountains; the clouds go slowly over;
 * the casements stir in the breeze; the light on the sill brightens and dims.
 *
 * What the pigeon does is the page's news, so it is acted rather than written,
 * in the plays of the shared LETTER_PLAY, after the owner's playful birds:
 *   - `home`: your pigeon on the sill, bobbing its head, blinking, pecking at
 *     the seeds, looking up at the sky, chirping and hopping round; or
 *     asleep there at night;
 *   - `leaving`: your letter drops onto the sill; the pigeon hops for joy,
 *     picks it up and beats its wings, then flies out through the window and
 *     away over the country, smaller and smaller;
 *   - `away`: the sill is empty — your pigeon is out;
 *   - `arriving`: a pigeon comes from far off with its letter, in through the
 *     window and lands; it shakes its feathers, lays the letter on the sill,
 *     chirps, hops round to look about, waves, and stays at home there.
 * Only transform and opacity move. A reader who asked for less motion sees
 * the window still and each play and flight as it ends. The whole picture is
 * decoration: the page says in words what the pigeon is doing.
 */
export type WindowScene = { kind: 'home'; bird: number } | { kind: 'leaving'; bird: number } | { kind: 'away' } | { kind: 'arriving'; bird: number };

/** Where a pigeon's own square goes so that its feet stand on the sill, as shares of the window, and the middle of it, which it flies about. */
const BOX = {
  left: LETTER_SILL.x / 120 - (LETTER_SILL.birdShare * LETTER_BIRD_FEET.x) / 120,
  top: LETTER_SILL.y / 120 - (LETTER_SILL.birdShare * LETTER_BIRD_FEET.y) / 120,
  size: LETTER_SILL.birdShare,
};
const PLACE: React.CSSProperties = { left: `${BOX.left * 100}%`, top: `${BOX.top * 100}%`, width: `${BOX.size * 100}%` };
const MIDDLE = `${(BOX.left + BOX.size / 2) * 100}% ${(BOX.top + BOX.size / 2) * 100}%`;

/** The flight as keyframes for the whole window's square, from the sill out (or, `back`, from far off in). */
function flightFrames(back: boolean): Keyframe[] {
  const frames = LETTER_FLIGHT.keys.map((k) => ({ offset: k.at, transform: `translate(${k.x * 100}%, ${k.y * 100}%) scale(${k.scale})`, opacity: k.seen }));
  return back ? frames.reverse().map((f) => ({ ...f, offset: 1 - f.offset })) : frames;
}

/** Shown before `at` and not after (or, `after`, the other way about): which of the two copies of a flying pigeon is seen, the one in the room or the one outside. */
function seenFrames(at: number, after: boolean): Keyframe[] {
  const [before, then] = after ? [0, 1] : [1, 0];
  return [
    { offset: 0, opacity: before },
    { offset: at, opacity: before },
    { offset: Math.min(1, at + 0.001), opacity: then },
    { offset: 1, opacity: then },
  ];
}

/** One picture of a pigeon on its square, placed on the sill. */
function Pose({ bird, pose, letter = false, facingLeft = false, className = '' }: { bird: number; pose: PigeonPose; letter?: boolean; facingLeft?: boolean; className?: string }): React.JSX.Element {
  const id = `b${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const svg = useMemo(() => ({ __html: letterBirdSvg({ bird, pose, letter, facingLeft, size: 120, idPrefix: id }) }), [bird, pose, letter, facingLeft, id]);
  return <span className={`lw-pose ${className}`} dangerouslySetInnerHTML={svg} />;
}

/** A pigeon asleep on the sill at night, breathing. */
function Asleep({ bird, facingLeft = false }: { bird: number; facingLeft?: boolean }): React.JSX.Element {
  return (
    <span className="lw-bird lw-bird--asleep" style={PLACE}>
      <Pose bird={bird} pose="sleep" facingLeft={facingLeft} />
    </span>
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

/** A letter in its envelope, lying on the sill: placed on the pigeon's own square, as its play measures it. */
function SillLetter({ style, innerRef }: { style: React.CSSProperties; innerRef?: React.Ref<HTMLSpanElement> }): React.JSX.Element {
  const id = `e${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const svg = useMemo(() => ({ __html: letterEnvelopeSvg({ size: 120, idPrefix: id }) }), [id]);
  return (
    <span className="lw-bird" style={PLACE}>
      <span className="lw-sill-letter" style={style}>
        <span className="lw-sill-letter-art" ref={innerRef} dangerouslySetInnerHTML={svg} />
      </span>
    </span>
  );
}

/**
 * A pigeon playing on the sill (LETTER_PLAY): every picture its play shows
 * laid one on another and switched on the play's own clock, the pigeon moved
 * about its feet, and a letter on the sill when the play has one. It plays
 * once and says so (`onEnd`), or, an idle play, round and round. A page that
 * cannot animate, or a reader who asked for less motion, sees how it ends.
 */
function Playing({ bird, play, facingLeft = false, onEnd }: { bird: number; play: LetterPlay; facingLeft?: boolean; onEnd?: () => void }): React.JSX.Element {
  const body = useRef<HTMLSpanElement>(null);
  const layers = useRef<Array<HTMLSpanElement | null>>([]);
  const letter = useRef<HTMLSpanElement>(null);
  const shows = useMemo(() => letterPlayShows(play), [play]);
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
    if (!play.loop) moving.onfinish = () => ended.current?.();
    return () => runs.forEach((r) => r.cancel());
  }, [play, shows, dir]);

  // standing still, it is seen as the play leaves it (or, going round, as it starts)
  const settled = (show: (typeof shows)[number]): number => (play.loop ? show.steps[0]![1] : show.steps[show.steps.length - 1]![1]);
  const lastLetter = play.letter[play.letter.length - 1];
  return (
    <>
      {play.letter.length > 0 && (
        <SillLetter style={{ ...sillLetterPlace(play.letterAt, dir), opacity: still ? (lastLetter?.seen ?? 0) : undefined }} innerRef={letter} />
      )}
      <span className="lw-bird" style={PLACE}>
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

/** A pigeon in flight on the window's square: standing at the start, then its wings beating, up and down by turns. */
function Flying({ bird, facingLeft, back }: { bird: number; facingLeft: boolean; back: boolean }): React.JSX.Element {
  return (
    <span className="lw-bird" style={PLACE}>
      <Pose bird={bird} pose="perched" letter facingLeft={facingLeft} className={back ? 'lw-pose--landing' : 'lw-pose--takeoff'} />
      <span className={`lw-wings ${back ? 'lw-wings--landing' : 'lw-wings--takeoff'}`}>
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

const BACK: readonly LetterWindowPart[] = LETTER_WINDOW_PARTS.filter((p) => p === 'sky' || p === 'clouds' || p === 'far' || p === 'near');
const ROOM: readonly LetterWindowPart[] = ['room', 'left', 'right'];

/** Where a flight or a play has got to: playing before it goes, flying, playing after it comes, or at home again after a letter. */
type Phase = 'rest' | 'before' | 'flight' | 'after' | 'settled';

export function LetterWindow({ scene, onDone }: { scene: WindowScene; onDone?: () => void }): React.JSX.Element {
  const sky = useTreeSky();
  const id = `w${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const frame = useRef<HTMLDivElement>(null);
  const inside = useRef<HTMLSpanElement>(null);
  const outside = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<Phase>('rest');
  const done = useRef(onDone);
  done.current = onDone;

  // a pigeon leaving plays first and then flies; one coming flies first and then plays
  useEffect(() => {
    setPhase(scene.kind === 'leaving' ? 'before' : scene.kind === 'arriving' ? 'flight' : 'rest');
  }, [scene]);

  const back = scene.kind === 'arriving';
  useEffect(() => {
    if (phase !== 'flight') return;
    const finish = (): void => {
      if (back) setPhase('after');
      else done.current?.();
    };
    const copies = [inside.current, outside.current];
    // a page that cannot animate, or a reader who asked for less motion, sees the flight as it ends
    if (prefersReducedMotion() || copies.some((c) => !c || typeof c.animate !== 'function')) {
      finish();
      return;
    }
    const timing = { duration: LETTER_FLIGHT.ms, easing: 'linear', fill: 'forwards' as const };
    // the copy in the room is seen until the pigeon is through the window, the one outside from then on
    const swap = back ? 1 - LETTER_FLIGHT.behindAt : LETTER_FLIGHT.behindAt;
    const runs = copies.flatMap((copy, i) => [
      copy!.animate(flightFrames(back), { ...timing, easing: back ? 'cubic-bezier(0.2, 0.6, 0.35, 1)' : 'cubic-bezier(0.5, 0, 0.75, 0.6)' }),
      (copy!.firstElementChild as HTMLElement).animate(seenFrames(swap, (i === 1) !== back), timing),
    ]);
    runs[0]!.onfinish = finish;
    return () => runs.forEach((r) => r.cancel());
  }, [phase, back]);

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

  const flier = (scene.kind === 'leaving' || scene.kind === 'arriving') && phase === 'flight' ? scene.bird : null;
  const asleep = sky === 'night';
  return (
    <div className="lw" aria-hidden="true" ref={frame} onPointerMove={look} onPointerLeave={rest} style={{ '--middle': MIDDLE } as React.CSSProperties}>
      {BACK.map((part) => (
        <Layer key={part} part={part} sky={sky} id={id} />
      ))}
      {flier !== null && (
        <span className="lw-flight" ref={outside}>
          <span className="lw-flight-seen">
            <Flying bird={flier} facingLeft={back} back={back} />
          </span>
        </span>
      )}
      {ROOM.map((part) => (
        <Layer key={part} part={part} sky={sky} id={id} />
      ))}
      {/* the light lies on the sill, so a pigeon standing there is over it, never under it */}
      <Layer part="light" sky={sky} id={id} />
      {scene.kind === 'home' && (asleep ? <Asleep bird={scene.bird} /> : <Playing key="idle" bird={scene.bird} play={LETTER_PLAY.idle} />)}
      {scene.kind === 'leaving' && phase === 'before' && <Playing key="before" bird={scene.bird} play={LETTER_PLAY.before} onEnd={() => setPhase('flight')} />}
      {flier !== null && (
        <span className="lw-flight" ref={inside}>
          <span className="lw-flight-seen">
            <Flying bird={flier} facingLeft={back} back={back} />
          </span>
        </span>
      )}
      {scene.kind === 'arriving' && phase === 'after' && <Playing key="after" bird={scene.bird} play={LETTER_PLAY.after} facingLeft onEnd={() => setPhase('settled')} />}
      {scene.kind === 'arriving' && phase === 'settled' && (
        <>
          <SillLetter style={sillLetterPlace(LETTER_PLAY.after.letterAt, -1)} />
          <Playing key="settled" bird={scene.bird} play={LETTER_PLAY.idle} facingLeft />
        </>
      )}
    </div>
  );
}
