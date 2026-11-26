import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CHAPTER_ART,
  CHAPTER_ART_LOOP,
  PATH_CHEST_HINGE,
  PATH_PIGEON_FLIGHT,
  PATH_APPLE_AT,
  PATH_APPLE_REACH,
  PATH_SCENES,
  PATH_SCENE_BOX,
  PATH_SCENE_SPRITE_BOX,
  PATH_SLATE_LETTERS,
  PATH_TEA_AT,
  PATH_STAMP_MOMENT,
  PATH_STAMP_REPRESS,
  PATH_STAMP_SHADOW,
  PATH_REPRESS_SHADOW,
  PATH_WAX_GOLD,
  PATH_WAX_FIRE,
  PATH_STOP_ART,
  chapterArtOf,
  chapterArtSvg,
  chapterLoopBox,
  characterArt,
  cropBox,
  letterBirdSvg,
  pathChestSvg,
  pathCoinSvg,
  pathScenePropSvg,
  pathSceneSpriteSvg,
  pathWaxSvg,
  pathStampToolSvg,
  sampleKeys,
  sceneBeat,
  sceneBeatMs,
  waxGlintAt,
  type ActName,
  type PathSceneId,
  type PathSceneSprite,
  type SceneBox,
} from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useInFront } from '../lib/motion';

/**
 * The road's living touches, drawn from @kurda/shared (art/chapter-art.ts, art/path-scenes.ts) as on the phone: each
 * chapter's vignette in its banner, the little scene beside each unit's road, and the unit's sandûq. All of it is for
 * the eye and hidden from screen readers. It moves only while in view and the tab is in front, by transform and
 * opacity (path.css), and not at all under reduced motion.
 */

/** A drawing as markup, made once per input. */
function useMarkup(draw: () => string, deps: readonly unknown[]): { __html: string } {
  return useMemo(() => ({ __html: draw() }), deps);
}

/**
 * A chapter's vignette in its banner, set against the banner's foot and far end so their edges crop it, a window onto
 * the scene, standing on a quiet hill of the banner's colour a step darker, its one moving part laid over it.
 */
export function ChapterArt({ chapter, fill, lip, height }: { chapter: number; fill: string; lip: string; height: number }): React.JSX.Element {
  const id = chapterArtOf(chapter);
  const loop = CHAPTER_ART_LOOP[id];
  const box = chapterLoopBox(id);
  const s = height / CHAPTER_ART.h;
  const prefix = `lpca${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const still = useMarkup(() => chapterArtSvg({ chapter: id, ground: mixColour(fill, lip, 0.5), shade: lip, height, idPrefix: `${prefix}s` }), [id, fill, lip, height, prefix]);
  const moving = useMarkup(() => chapterArtSvg({ chapter: id, part: 'loop', height: box.h * s, idPrefix: `${prefix}m` }), [id, box, s, prefix]);
  const origin = `${(((box.px - box.x) / box.w) * 100).toFixed(1)}% ${(((box.py - box.y) / box.h) * 100).toFixed(1)}%`;
  return (
    <span className="lp-pin-art" aria-hidden="true" data-art={id} style={{ width: CHAPTER_ART.w * s, height }}>
      <span className="lp-pin-still" dangerouslySetInnerHTML={still} />
      <span
        className={`lp-pin-loop is-${loop.kind}`}
        style={{ left: box.x * s, top: box.y * s, width: box.w * s, height: box.h * s, transformOrigin: origin }}
        dangerouslySetInnerHTML={moving}
      />
    </span>
  );
}

/** Two #rrggbb colours blended, `t` of the way from `a` to `b`. */
function mixColour(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number): number => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** A box in scene points as a style, from the scene's top left. */
const at = (b: SceneBox): React.CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });

/** A scene's sprite, the size of its own canvas, at (x, y) on the scene. */
function Sprite({ sprite, x, y, dark, className, style }: { sprite: PathSceneSprite; x: number; y: number; dark: boolean; className?: string; style?: React.CSSProperties }): React.JSX.Element {
  const box = PATH_SCENE_SPRITE_BOX[sprite];
  const prefix = `lps${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const markup = useMarkup(() => pathSceneSpriteSvg({ sprite, dark, idPrefix: prefix }), [sprite, dark, prefix]);
  return <span className={`lp-sprite${className ? ` ${className}` : ''}`} style={{ left: x, top: y, width: box.w, height: box.h, ...style }} dangerouslySetInnerHTML={markup} />;
}

/** A prop of a scene's layout, in its box. */
function Prop({ scene, prop, dark }: { scene: PathSceneId; prop: string; dark: boolean }): React.JSX.Element {
  const layout = PATH_SCENES[scene];
  const box = layout.back[prop] ?? layout.front[prop]!;
  const prefix = `lpp${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const markup = useMarkup(() => pathScenePropSvg({ scene, prop, dark, idPrefix: prefix }), [scene, prop, dark, prefix]);
  return <span className="lp-prop" data-prop={prop} style={at(box)} dangerouslySetInnerHTML={markup} />;
}

/** A track of shared keys sampled finely, so an eased track moves alike here and on the phone. */
const FRAMES = Array.from({ length: 49 }, (_, i) => i / 48);
const sampled = (keys: readonly (readonly [number, number])[]): number[] => FRAMES.map((t) => sampleKeys(keys, t));

/**
 * The pigeon flying in from the screen's edge to land on the twig's tip with its letter in its beak, and back out again
 * (shared `PATH_PIGEON_FLIGHT`), the twig giving under it, and hopping when tapped; a member's pigeon from the letters,
 * in its own colours by day and night alike.
 */
function Pigeon({ moving, hop, stage }: { moving: boolean; hop: number; stage: React.RefObject<HTMLSpanElement | null> }): React.JSX.Element {
  const { actor } = PATH_SCENES.letter;
  const size = actor.h;
  const prefix = `lppg${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const up = useMarkup(() => letterBirdSvg({ bird: 0, pose: 'wings-up', letter: true, size, idPrefix: `${prefix}u`, shadow: false }), [prefix, size]);
  const down = useMarkup(() => letterBirdSvg({ bird: 0, pose: 'wings-down', letter: true, size, idPrefix: `${prefix}d`, shadow: false }), [prefix, size]);
  const perched = useMarkup(() => letterBirdSvg({ bird: 0, pose: 'perched', letter: true, size, idPrefix: `${prefix}p`, shadow: false }), [prefix, size]);
  const flight = useRef<HTMLSpanElement>(null);
  const sitting = useRef<HTMLSpanElement>(null);
  const flying = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = flight.current;
    if (!moving || !el || typeof el.animate !== 'function') return;
    const { ms, x, y, tilt, face, shown, perched: [from, to] } = PATH_PIGEON_FLIGHT;
    const [xs, ys, ts, ss, gs, fs] = [sampled(x), sampled(y), sampled(tilt), sampled(shown), sampled(PATH_PIGEON_FLIGHT.twig), sampled(face)];
    const forever = { duration: ms, iterations: Infinity };
    const at = (i: number): string => `translate(${xs[i]}px, ${ys[i]}px) rotate(${ts[i]}deg) scaleX(${fs[i]})`;
    const path = el.animate(FRAMES.map((offset, i) => ({ offset, transform: at(i), opacity: ss[i] })), forever);
    // On the twig between landing and taking off; in the air, flapping, the rest of the way round.
    const swap = (on: number[]): Keyframe[] => [0, from, from, to, to, 1].map((offset, i) => ({ offset, opacity: on[i] }));
    const sit = sitting.current?.animate(swap([0, 0, 1, 1, 0, 0]), forever);
    const fly = flying.current?.animate(swap([1, 1, 0, 0, 1, 1]), forever);
    const give = [...(stage.current?.querySelectorAll<HTMLElement>('.lp-gives') ?? [])].map((g) => g.animate(FRAMES.map((offset, i) => ({ offset, transform: `rotate(${gs[i]}deg)` })), forever));
    return () => {
      path.cancel();
      sit?.cancel();
      fly?.cancel();
      give.forEach((g) => g.cancel());
    };
  }, [moving, stage]);
  return (
    <span className="lp-pigeon" style={{ left: actor.ax - size / 2, top: actor.ay - (size * 100) / 120, width: size, height: size }}>
      <span key={hop} className={`lp-pigeon-hop${hop > 0 ? ' is-hopping' : ''}`}>
        <span ref={flight} className="lp-pigeon-flight">
          <span ref={sitting} className="lp-pigeon-sit" dangerouslySetInnerHTML={perched} />
          {moving && (
            <span ref={flying} className="lp-pigeon-fly">
              <span className="lp-pigeon-wing is-up" dangerouslySetInnerHTML={up} />
              <span className="lp-pigeon-wing is-down" dangerouslySetInnerHTML={down} />
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/** The act a tap gets from each scene's character: Hevalo offers his apple, then hiccups, by turns. */
function tapAct(scene: PathSceneId, taps: number): ActName | null {
  if (scene === 'apple') return taps % 2 === 1 ? 'offer' : 'hiccup';
  if (scene === 'tea') return 'chuckle';
  if (scene === 'slate') return 'cheer';
  return null;
}

/**
 * A unit's little scene leaning in from the screen's edge beside its road (shared `pathScene`, `sceneBeat`): Hevalo's head
 * in under an apple bough, reaching up to bite its apple, chewing, the bough giving as he tugs, and a new apple growing
 * once he is down to the core; Hamo leaning in with his tea on a tray and too much sugar; Xezo peeking in with her slate
 * to chalk ê, ç and ş; or the pigeon landing on a twig with a letter. Beats come a little sooner or later each time
 * (`sceneBeatMs`). Drawn for the edge at the line's start; `flip` mirrors it for the other edge, all but the slate's
 * letters. A tap gets a little moment of its own.
 */
export function PathScene({ scene, flip, dark, reduce }: { scene: PathSceneId; flip: boolean; dark: boolean; reduce: boolean }): React.JSX.Element {
  const layout = PATH_SCENES[scene];
  const root = useRef<HTMLSpanElement>(null);
  const actorRef = useRef<HTMLSpanElement>(null);
  const inFront = useInFront(root);
  const moving = inFront && !reduce;
  const [beat, setBeat] = useState(0);
  const [tap, setTap] = useState({ count: 0, beat: -1 });
  useEffect(() => {
    if (!moving || scene === 'letter') return;
    const id = window.setTimeout(() => setBeat((b) => b + 1), sceneBeatMs(scene, beat));
    return () => window.clearTimeout(id);
  }, [moving, scene, beat]);
  const now = sceneBeat(scene, beat);
  // The bite shows as his teeth close on it, partway through his reach.
  const [bitten, setBitten] = useState(now.bites);
  useEffect(() => {
    if (!moving || !now.crumbs) {
      setBitten(now.bites);
      return;
    }
    const id = window.setTimeout(() => setBitten(now.bites), PATH_APPLE_REACH.ms * PATH_APPLE_REACH.biteAt);
    return () => window.clearTimeout(id);
  }, [moving, now.bites, now.crumbs]);
  // Each bite: he draws back, stretches in to the apple and bites, and the bough gives as he tugs.
  useEffect(() => {
    if (!moving || scene !== 'apple' || !now.crumbs) return;
    const head = actorRef.current;
    if (!head || typeof head.animate !== 'function') return;
    const [ss, ts, gs] = [sampled(PATH_APPLE_REACH.stretch), sampled(PATH_APPLE_REACH.turn), sampled(PATH_APPLE_REACH.tug)];
    const lean = layout.actor.lean;
    const reach = head.animate(FRAMES.map((offset, i) => ({ offset, transform: `rotate(${lean + ts[i]!}deg) scaleY(${ss[i]})` })), { duration: PATH_APPLE_REACH.ms });
    const tug = [...(root.current?.querySelectorAll<HTMLElement>('.lp-gives') ?? [])].map((g) =>
      g.animate(FRAMES.map((offset, i) => ({ offset, transform: `rotate(${gs[i]}deg)` })), { duration: PATH_APPLE_REACH.ms }),
    );
    return () => {
      reach.cancel();
      tug.forEach((t) => t.cancel());
    };
  }, [moving, scene, beat, now.crumbs, layout.actor.lean]);
  // A tap's moment lasts until the next beat, whose act then follows.
  const tapped = tap.count > 0 && tap.beat === beat ? tapAct(scene, tap.count) : null;
  const cue = tapped ? { act: tapped, at: -tap.count } : now.act ? { act: now.act, at: beat } : null;
  const art = layout.who === 'pigeon' ? null : characterArt(layout.who);
  const frame = art ? cropBox(art, layout.actor.crop) : null;
  const width = frame ? (layout.actor.h * frame.w) / frame.h : 0;
  const press = (): void => setTap((t) => ({ count: t.count + 1, beat }));
  const apple = PATH_APPLE_AT;
  const appleBox = PATH_SCENE_SPRITE_BOX['apple-0'];
  const offering = scene === 'apple' && tapped === 'offer';
  const hiccup = scene === 'apple' && tapped === 'hiccup';
  const give = layout.gives.bough ?? layout.gives.twig;
  const prop = (p: string): React.JSX.Element => <Prop key={p} scene={scene} prop={p} dark={dark} />;
  const gives = (p: string): boolean => p in layout.gives;
  // What gives when tugged or landed on turns about its root at the edge, carrying what hangs from it, before or behind
  // the character alike.
  const giving = (key: string, children: React.ReactNode): React.JSX.Element => (
    <span key={key} className="lp-gives" style={give ? { transformOrigin: `${give.x}px ${give.y}px` } : undefined}>
      {children}
    </span>
  );
  return (
    <span ref={root} className={`lp-scene-stage${flip ? ' is-flipped' : ''}${moving ? ' is-moving' : ''}`} style={{ width: PATH_SCENE_BOX.w, height: PATH_SCENE_BOX.h }}>
      {Object.keys(layout.back).filter((p) => !gives(p)).map(prop)}
      {giving('back', Object.keys(layout.back).filter(gives).map(prop))}
      {art && frame && (
        <span
          ref={actorRef}
          className="lp-actor"
          style={{ left: layout.actor.ax - width / 2, top: layout.actor.ay - layout.actor.h, width, height: layout.actor.h, transform: `rotate(${layout.actor.lean}deg)` }}
        >
          <SpeakingCharacter speaker={layout.who as 'hevalo' | 'hamo' | 'xezo'} audio={null} crop={layout.actor.crop} size={layout.actor.h} decorative cue={cue} />
        </span>
      )}
      {giving(
        'front',
        <>
          {Object.keys(layout.front).filter(gives).map(prop)}
          {scene === 'apple' &&
            (now.growing ? (
              <>
                <Sprite key={`core${beat}`} sprite="core" x={apple.x - appleBox.w / 2} y={apple.y} dark={dark} className="is-dropping" />
                <Sprite key={`new${beat}`} sprite="apple-0" x={apple.x - appleBox.w / 2} y={apple.y} dark={dark} className="is-growing" />
              </>
            ) : (
              <Sprite
                key={offering ? `offer${tap.count}` : 'apple'}
                sprite={bitten >= 5 ? 'core' : (`apple-${bitten}` as PathSceneSprite)}
                x={apple.x - appleBox.w / 2}
                y={apple.y}
                dark={dark}
                className={`lp-apple${offering ? ' is-offered' : ''}`}
              />
            ))}
        </>,
      )}
      {/* The pigeon lands on its twig, so it is drawn over it. */}
      {layout.who === 'pigeon' && <Pigeon moving={moving} hop={tap.count} stage={root} />}
      {Object.keys(layout.front).filter((p) => !gives(p)).map(prop)}
      {scene === 'apple' && (
        <>
          {now.crumbs && <Sprite key={`crumbs${beat}`} sprite="crumbs" x={apple.x - 10} y={apple.y + 30} dark={dark} className="is-falling" style={{ animationDelay: `${Math.round(PATH_APPLE_REACH.ms * PATH_APPLE_REACH.biteAt)}ms` }} />}
          {hiccup && <Sprite key={`hic${tap.count}`} sprite="hic" x={30} y={40} dark={dark} className="is-rising" />}
        </>
      )}
      {scene === 'tea' && (
        <>
          <Sprite sprite="steam" x={PATH_TEA_AT.glass.x - 7} y={PATH_TEA_AT.glass.y - 26} dark={dark} className="is-steaming" />
          {now.cube && (
            <Sprite
              key={`cube${beat}`}
              sprite="cube"
              x={PATH_TEA_AT.bowl.x - 4}
              y={PATH_TEA_AT.bowl.y - 16}
              dark={dark}
              className="is-tossed"
              style={{ '--tx': `${PATH_TEA_AT.glass.x - PATH_TEA_AT.bowl.x}px`, '--ty': `${PATH_TEA_AT.glass.y - PATH_TEA_AT.bowl.y + 4}px` } as React.CSSProperties}
            />
          )}
          {now.cube && <Sprite key={`splash${beat}`} sprite="splash" x={PATH_TEA_AT.glass.x - 8} y={PATH_TEA_AT.glass.y - 6} dark={dark} className="is-splashing" />}
        </>
      )}
      {scene === 'slate' &&
        PATH_SLATE_LETTERS.map((l, i) => (
          <Sprite
            key={l.sprite}
            sprite={l.sprite}
            // Mirrored, the slate's places run the other way, so the letters still read ê, ç, ş.
            x={flip ? PATH_SLATE_LETTERS[PATH_SLATE_LETTERS.length - 1 - i]!.x : l.x}
            y={flip ? PATH_SLATE_LETTERS[PATH_SLATE_LETTERS.length - 1 - i]!.y : l.y}
            dark={dark}
            className={`lp-chalk${(i < now.letters && !now.wiping) || reduce ? ' is-written' : ''}`}
          />
        ))}
      <button type="button" className="lp-scene-hit" tabIndex={-1} aria-hidden="true" onClick={press} style={hitBox(scene)} />
    </span>
  );
}

/** Where a tap lands on a scene: its character, and for the pigeon its twig's tip. */
function hitBox(scene: PathSceneId): React.CSSProperties {
  if (scene === 'letter') return { left: 70, top: 20, width: 70, height: 70 };
  return { left: 0, top: 30, width: 90, height: PATH_SCENE_BOX.h - 30 };
}

/** How many coins a sandûq tosses out as it opens, and where each goes, in points from its mouth. */
const COINS = [
  { x: -22, y: -46, r: -30, d: 0 },
  { x: 4, y: -58, r: 20, d: 70 },
  { x: 26, y: -42, r: 40, d: 140 },
] as const;

/**
 * A unit's sandûq beside its road: shut until the unit is done, then open on its gold. Tapped shut it rattles on its
 * lock; tapped open, or as it opens, its lid flies up and coins jump out of it.
 */
export function PathChest({ open, dark, size, played }: { open: boolean; dark: boolean; size: number; played: number }): React.JSX.Element {
  const prefix = `lpch${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const body = useMarkup(() => pathChestSvg({ open, part: 'body', dark, size, idPrefix: `${prefix}b` }), [open, dark, size, prefix]);
  const lid = useMarkup(() => pathChestSvg({ open, part: open ? 'open' : 'lid', dark, size, idPrefix: `${prefix}l` }), [open, dark, size, prefix]);
  const coin = useMarkup(() => pathCoinSvg({ dark, size: 18, idPrefix: `${prefix}c` }), [dark, prefix]);
  // It bursts open on the beat it is won, if that happens while it is on the page.
  const was = useRef(open);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (open && !was.current) setBurst((n) => n + 1);
    was.current = open;
  }, [open]);
  const s = size / PATH_STOP_ART.box;
  const playing = played + burst;
  return (
    <span key={playing} className={`lp-chest-art${playing > 0 ? (open ? ' is-bursting' : ' is-rattling') : ''}`}>
      <span className="lp-chest-part" dangerouslySetInnerHTML={body} />
      <span className="lp-chest-part lp-chest-lid" style={{ transformOrigin: `${PATH_CHEST_HINGE.x * s}px ${PATH_CHEST_HINGE.y * s}px` }} dangerouslySetInnerHTML={lid} />
      {open && playing > 0 &&
        COINS.map((c, i) => (
          <span
            key={i}
            className="lp-coin"
            style={{ left: size / 2 - 9, top: size * 0.42, '--cx': `${c.x}px`, '--cy': `${c.y}px`, '--cr': `${c.r}deg`, animationDelay: `${c.d}ms` } as React.CSSProperties}
            dangerouslySetInnerHTML={coin}
          />
        ))}
    </span>
  );
}

/**
 * A finished stop's round wax seal (shared `pathWaxSvg`) in its tile's place, a sun pressed in it for each full round:
 * deep red, gold once it has all three suns, and matte and dulled where a refresh would help. `pressing` plays its first
 * sealing once (shared `PATH_STAMP_MOMENT`) after `delay`: a big drop of red wax falls onto the tile and splashes, the
 * tile melts under it as the wax flows out round, and the brass stamp presses the seal as it squashes and lifts away, its
 * sun pressed in; then `onStamped` is told. With `from`, a round later, the stamp comes back after `delay` and presses
 * again (shared `PATH_STAMP_REPRESS`), the `from` suns giving way to `suns`. With `warming`, once the stamp has lifted a
 * band of fire sweeps up over the seal and gilds it (shared `PATH_WAX_FIRE`), then one glint crosses it (shared
 * `PATH_WAX_GOLD`); a gold seal glints again now and then while `live` and on screen.
 * Decorative.
 */
export function WaxSeal({
  stopKey,
  dark,
  suns,
  from = null,
  gold,
  warming,
  worn,
  live,
  pressing,
  delay,
  onStamped,
}: {
  stopKey: string;
  dark: boolean;
  /** The suns pressed in it, one for each full round. */
  suns: number;
  /** A round later: the suns it had, until the stamp presses the new one in. */
  from?: number | null;
  gold: boolean;
  /** Its third sun has just been pressed in: fire sweeps over it and gilds it. */
  warming: boolean;
  worn: boolean;
  /** Its unit is near the screen and motion is welcome. */
  live: boolean;
  pressing: boolean;
  delay: number;
  onStamped: (key: string) => void;
}): React.JSX.Element {
  const prefix = `lpwx${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const pressed = from !== null;
  const moving = pressing || pressed;
  const wax = (part: 'whole' | 'pour' | 'seal', count: number, golden = false): string =>
    pathWaxSvg({ seed: stopKey, gold: golden, worn, suns: count, part, dark, idPrefix: `${prefix}${part}${count}${golden ? 'g' : ''}` });
  const coat = useMarkup(() => (moving ? '' : wax('whole', suns)), [moving, stopKey, worn, suns, dark, prefix]);
  const goldCoat = useMarkup(() => (gold ? wax('whole', suns, true) : ''), [gold, stopKey, worn, suns, dark, prefix]);
  // The fire that gilds it as its third sun is pressed in: its band of flame, the embers off it and its puff.
  const fire = useMarkup(
    () => (warming ? (['fire', 'embers', 'puff'] as const).map((part) => pathWaxSvg({ part, dark, idPrefix: `${prefix}${part}` })).join('|') : ''),
    [warming, dark, prefix],
  );
  const [flame = '', embers = '', puff = ''] = fire.__html.split('|');
  const pour = useMarkup(() => (moving ? wax('pour', suns) : ''), [moving, stopKey, worn, suns, dark, prefix]);
  const seal = useMarkup(() => (moving ? wax('seal', suns) : ''), [moving, stopKey, worn, suns, dark, prefix]);
  const was = useMarkup(() => (pressed ? wax('seal', from) : ''), [pressed, from, stopKey, worn, dark, prefix]);
  const blob = useMarkup(() => (pressing ? pathWaxSvg({ part: 'blob', dark, idPrefix: `${prefix}b` }) : ''), [pressing, dark, prefix]);
  const splash = useMarkup(() => (pressing ? pathWaxSvg({ part: 'splash', dark, idPrefix: `${prefix}s` }) : ''), [pressing, dark, prefix]);
  const tool = useMarkup(() => (moving ? pathStampToolSvg({ dark, idPrefix: `${prefix}t` }) : ''), [moving, dark, prefix]);
  const refs = {
    pour: useRef<HTMLSpanElement>(null),
    seal: useRef<HTMLSpanElement>(null),
    was: useRef<HTMLSpanElement>(null),
    blob: useRef<HTMLSpanElement>(null),
    splash: useRef<HTMLSpanElement>(null),
    shadow: useRef<HTMLSpanElement>(null),
    tool: useRef<HTMLSpanElement>(null),
    gold: useRef<HTMLSpanElement>(null),
    window: useRef<HTMLSpanElement>(null),
    flame: useRef<HTMLSpanElement>(null),
    embers: useRef<HTMLSpanElement>(null),
    puff: useRef<HTMLSpanElement>(null),
  };
  const done = useRef(onStamped);
  done.current = onStamped;
  // Before the first paint, so nothing new shows before it is pressed.
  useLayoutEffect(() => {
    if (!moving) return;
    const el = (r: { current: HTMLSpanElement | null }): HTMLSpanElement | null => r.current;
    const face = el(refs.pour)?.closest<HTMLElement>('.lp-node-face');
    const m = pressing ? PATH_STAMP_MOMENT : PATH_STAMP_REPRESS;
    const shadow = pressing ? PATH_STAMP_SHADOW : PATH_REPRESS_SHADOW;
    const end = (): void => {
      if (pressing) done.current(stopKey);
    };
    if (!el(refs.seal) || !el(refs.tool) || !el(refs.shadow) || typeof el(refs.seal)!.animate !== 'function') {
      end();
      return;
    }
    const timing = { duration: m.ms, delay, fill: 'both' as const };
    // The suns pressed in show from the press, under the stamp; a round later the ones before give way then.
    const shownFrom: Array<readonly [number, number]> = [[0, 0], [m.pressAt, 0], [m.pressAt + 0.01, 1], [1, 1]];
    const runs = [
      el(refs.tool)!.animate(frames([m.toolY, m.tilt, m.toolShown], ([y, r, o]) => ({ transform: `translateY(${y}px) rotate(${r}deg)`, opacity: o })), timing),
      el(refs.shadow)!.animate(frames([shadow.size, shadow.shown], ([k, o]) => ({ transform: `scale(${k})`, opacity: o })), timing),
      el(refs.seal)!.animate(frames([shownFrom], ([o]) => ({ opacity: o })), timing),
      el(refs.was)?.animate(frames([shownFrom], ([o]) => ({ opacity: 1 - o! })), timing),
      face?.animate(frames([m.squash], ([q]) => ({ transform: `scale(${2 - q!}, ${q})` })), { duration: m.ms, delay }),
    ];
    if (pressing) {
      const { blobY, blobShown, splat, splash: spread, splashShown, melt, flow, poured } = PATH_STAMP_MOMENT;
      runs.push(
        el(refs.blob)?.animate(frames([blobY, splat, blobShown], ([y, q, o]) => ({ transform: `translateY(${y}px) scale(${2 - q!}, ${q})`, opacity: o })), timing),
        el(refs.splash)?.animate(frames([spread, splashShown], ([k, o]) => ({ transform: `scale(${k})`, opacity: o })), timing),
        el(refs.pour)?.animate(frames([flow, poured], ([k, o]) => ({ transform: `scale(${k})`, opacity: o })), timing),
        // The tile slumps and goes under the spreading wax; the seal takes its place.
        ...[...(face?.querySelectorAll<HTMLElement>('.lp-art') ?? [])].map((art) =>
          art.animate(frames([melt], ([k]) => ({ transform: `scale(${1 + 0.12 * k!}, ${1 - 0.45 * k!})`, opacity: 1 - k! })), timing),
        ),
      );
    }
    const timer = window.setTimeout(end, delay + m.ms);
    return () => {
      window.clearTimeout(timer);
      runs.forEach((r) => r?.cancel());
    };
  }, [moving, pressing, delay, stopKey]);
  // Once the stamp has lifted from its third sun, fire sweeps up over the seal and the wax turns gold behind it: the gold
  // shows through a window whose top is the flames' front, moved one way while the gold inside is moved back.
  const warmAt = (pressed ? delay + PATH_STAMP_REPRESS.ms : 0) + PATH_WAX_GOLD.afterMs;
  useLayoutEffect(() => {
    const [win, coat] = [refs.window.current, refs.gold.current];
    if (!warming || !win || !coat || typeof win.animate !== 'function') return;
    const { front, rise, wide, lick, shown, embers: up, embersShown, puff: swell, puffShown, ms } = PATH_WAX_FIRE;
    const timing = { duration: ms, delay: warmAt, fill: 'both' as const };
    const runs = [
      win.animate(frames([front], ([y]) => ({ transform: `translateY(${y}px)` })), timing),
      coat.animate(frames([front], ([y]) => ({ transform: `translateY(${-y!}px)` })), timing),
      refs.flame.current?.animate(frames([rise, wide, lick, shown], ([y, w, h, o]) => ({ transform: `translateY(${y}px) scale(${w}, ${h})`, opacity: o })), timing),
      refs.embers.current?.animate(frames([up, embersShown], ([y, o]) => ({ transform: `translateY(${y}px)`, opacity: o })), timing),
      refs.puff.current?.animate(frames([swell, puffShown], ([k, o]) => ({ transform: `scale(${k})`, opacity: o })), timing),
    ];
    return () => runs.forEach((r) => r?.cancel());
  }, [warming, warmAt]);
  return (
    <span className="lp-wax" aria-hidden="true" data-suns={suns}>
      {moving ? (
        <>
          <span ref={refs.pour} className="lp-wax-coat lp-wax-pour" dangerouslySetInnerHTML={pour} />
          {pressed && <span ref={refs.was} className="lp-wax-coat" dangerouslySetInnerHTML={was} />}
          <span ref={refs.seal} className="lp-wax-coat" dangerouslySetInnerHTML={seal} />
          {pressing && <span ref={refs.blob} className="lp-wax-coat lp-wax-blob" dangerouslySetInnerHTML={blob} />}
          {pressing && <span ref={refs.splash} className="lp-wax-coat lp-wax-blob" dangerouslySetInnerHTML={splash} />}
          {/* The stamp's shadow on the seal's face, under the stamp. */}
          <span className="lp-wax-face">
            <span ref={refs.shadow} className="lp-wax-shadow" />
          </span>
          <span ref={refs.tool} className="lp-wax-tool" dangerouslySetInnerHTML={tool} />
        </>
      ) : (
        <span className="lp-wax-coat" dangerouslySetInnerHTML={coat} />
      )}
      {gold && warming ? (
        <>
          <span ref={refs.window} className="lp-wax-window">
            <span ref={refs.gold} className="lp-wax-coat lp-wax-gold" dangerouslySetInnerHTML={goldCoat} />
          </span>
          <span ref={refs.flame} className="lp-wax-coat lp-wax-fire" dangerouslySetInnerHTML={{ __html: flame }} />
          <span ref={refs.embers} className="lp-wax-coat lp-wax-fire" dangerouslySetInnerHTML={{ __html: embers }} />
          <span ref={refs.puff} className="lp-wax-coat lp-wax-puff" dangerouslySetInnerHTML={{ __html: puff }} />
        </>
      ) : (
        gold && <span className="lp-wax-coat lp-wax-gold" dangerouslySetInnerHTML={goldCoat} />
      )}
      {gold && !worn && live && <WaxGlint stopKey={stopKey} firstAt={warming ? warmAt + PATH_WAX_FIRE.ms : null} />}
    </span>
  );
}

/**
 * A pale band crossing a gold seal now and then (shared `PATH_WAX_GOLD`), each stop at its own time; just after it has
 * warmed into gold, the first one at `firstAt`. Only while on screen and the tab is in front.
 */
function WaxGlint({ stopKey, firstAt }: { stopKey: string; firstAt: number | null }): React.JSX.Element {
  const box = useRef<HTMLSpanElement>(null);
  const band = useRef<HTMLSpanElement>(null);
  const shown = useInFront(box);
  useEffect(() => {
    const el = band.current;
    if (!shown || !el || typeof el.animate !== 'function') return;
    const { everyMs, glintMs, tilt } = PATH_WAX_GOLD;
    const across = (x: number): string => `translateX(${x}px) rotate(${tilt}deg)`;
    const run = el.animate(
      [
        { offset: 0, transform: across(-GLINT_REACH) },
        { offset: glintMs / everyMs, transform: across(GLINT_REACH) },
        { offset: 1, transform: across(GLINT_REACH) },
      ],
      { duration: everyMs, iterations: Infinity, easing: 'ease-in-out', delay: firstAt ?? -waxGlintAt(stopKey) },
    );
    return () => run.cancel();
  }, [shown, firstAt, stopKey]);
  return (
    <span ref={box} className="lp-wax-face">
      <span ref={band} className="lp-wax-band" style={{ width: PATH_WAX_GOLD.band }} />
    </span>
  );
}

/** What a topic's seal becomes, for its card: a sun pressed in for each full round, and gold with all three. Decorative. */
export function WaxLegend({ dark }: { dark: boolean }): React.JSX.Element {
  const seals = useMarkup(() => [1, 2, 3].map((suns) => pathWaxSvg({ seed: 'legend', suns, gold: suns === 3, dark, size: WAX_KEY })).join('|'), [dark]);
  return (
    <span className="lp-wax-legend" aria-hidden="true" data-testid="lp-wax-legend">
      {seals.__html.split('|').map((svg, i) => (
        <span key={i} className="lp-wax-icon" dangerouslySetInnerHTML={{ __html: svg }} />
      ))}
    </span>
  );
}

/** The moments a stamping moment is sampled at. */
const STAMP_FRAMES = Array.from({ length: 41 }, (_, i) => i / 40);
/** Keyframes for the web's animations from the shared tracks, sampled at `STAMP_FRAMES`, each turned into styles by `each`. */
function frames(keys: Array<readonly (readonly [number, number])[]>, each: (v: number[]) => Keyframe): Keyframe[] {
  const values = keys.map((track) => STAMP_FRAMES.map((t) => sampleKeys(track, t)));
  return STAMP_FRAMES.map((offset, i) => ({ offset, ...each(values.map((v) => v[i]!)) }));
}
/** How far a glint's band travels either side of the seal's middle, past its wax. */
const GLINT_REACH = 52;
/** A seal's drawing in a card's legend: its 112-point canvas at this size, the seal itself about 26 points across. */
const WAX_KEY = 40;
