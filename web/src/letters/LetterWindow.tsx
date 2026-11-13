import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_SILL,
  LETTER_WINDOW_DEPTH,
  LETTER_WINDOW_PARTS,
  letterBirdSvg,
  letterWindowSvg,
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
 * What the pigeon does is the page's news, so it is acted rather than written:
 *   - `home`: your pigeon on the sill, blinking and bobbing its head, or
 *     asleep there at night;
 *   - `leaving`: it takes off with the letter in its beak and flies out
 *     through the window and away over the country, smaller and smaller;
 *   - `away`: the sill is empty — your pigeon is out;
 *   - `arriving`: a pigeon comes from far off with its letter, in through the
 *     window, lands, and waves a wing.
 * Only transform and opacity move. A reader who asked for less motion sees
 * the window still and each flight as it ends. The whole picture is
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

/** A pigeon at rest on the sill: blinking and bobbing by day, asleep at night, or just landed and waving. */
function Resting({ bird, asleep, landed = false, facingLeft = false }: { bird: number; asleep: boolean; landed?: boolean; facingLeft?: boolean }): React.JSX.Element {
  if (asleep) {
    return (
      <span className="lw-bird lw-bird--asleep" style={PLACE}>
        <Pose bird={bird} pose="sleep" facingLeft={facingLeft} />
      </span>
    );
  }
  return (
    <span className={`lw-bird ${landed ? 'lw-bird--landed' : 'lw-bird--home'}`} style={PLACE}>
      <Pose bird={bird} pose="perched" facingLeft={facingLeft} className="lw-pose--still" />
      {landed ? <Pose bird={bird} pose="wave" facingLeft={facingLeft} className="lw-pose--wave" /> : <Pose bird={bird} pose="blink" facingLeft={facingLeft} className="lw-pose--blink" />}
    </span>
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

export function LetterWindow({ scene, onDone }: { scene: WindowScene; onDone?: () => void }): React.JSX.Element {
  const sky = useTreeSky();
  const id = `w${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const frame = useRef<HTMLDivElement>(null);
  const inside = useRef<HTMLSpanElement>(null);
  const outside = useRef<HTMLSpanElement>(null);
  // an arriving pigeon lands carrying its letter, waves, and then is at home on the sill like any other
  const [landed, setLanded] = useState<'no' | 'waving' | 'settled'>('no');
  const done = useRef(onDone);
  done.current = onDone;

  const flying = scene.kind === 'leaving' || scene.kind === 'arriving';
  useEffect(() => {
    setLanded('no');
    if (!flying) return;
    const back = scene.kind === 'arriving';
    const finish = (): void => {
      if (back) setLanded('waving');
      done.current?.();
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
  }, [scene, flying]);

  useEffect(() => {
    if (landed !== 'waving') return;
    const id = window.setTimeout(() => setLanded('settled'), 2000);
    return () => window.clearTimeout(id);
  }, [landed]);

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

  const back = scene.kind === 'arriving';
  const flier = flying ? scene.bird : null;
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
      {scene.kind === 'home' && <Resting bird={scene.bird} asleep={sky === 'night'} />}
      {flier !== null && landed === 'no' && (
        <span className="lw-flight" ref={inside}>
          <span className="lw-flight-seen">
            <Flying bird={flier} facingLeft={back} back={back} />
          </span>
        </span>
      )}
      {scene.kind === 'arriving' && landed !== 'no' && <Resting bird={scene.bird} asleep={false} landed={landed === 'waving'} facingLeft />}
      <Layer part="light" sky={sky} id={id} />
    </div>
  );
}
