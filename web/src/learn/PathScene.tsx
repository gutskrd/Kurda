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
  pathStampSvg,
  pathStampToolSvg,
  sampleKeys,
  sceneBeat,
  sceneBeatMs,
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
 * The pigeon trying to land on the twig's tip with its letter in its beak (shared `PATH_PIGEON_FLIGHT`), the twig giving
 * under it, and hopping when tapped; a member's pigeon from the letters, in its own colours by day and night alike.
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
    const { ms, x, y, tilt, shown, perched: [from, to] } = PATH_PIGEON_FLIGHT;
    const [xs, ys, ts, ss, gs] = [sampled(x), sampled(y), sampled(tilt), sampled(shown), sampled(PATH_PIGEON_FLIGHT.twig)];
    const forever = { duration: ms, iterations: Infinity };
    const path = el.animate(FRAMES.map((offset, i) => ({ offset, transform: `translate(${xs[i]}px, ${ys[i]}px) rotate(${ts[i]}deg)`, opacity: ss[i] })), forever);
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
 * Hevalo's stamp on a finished stop's tile (shared `pathStampSvg`): his prints in a seal, walking toward the next stop
 * (`heading`), four together where he rests, and rubbed a little where a refresh would help. `pressing` plays its moment once (shared `PATH_STAMP_MOMENT`) after `delay`: the brass
 * stamp hovers in, draws up, presses down as the tile squashes under it and the print appears, and lifts away; then
 * `onStamped` is told. Decorative.
 */
export function TileStamp({
  stopKey,
  dark,
  worn,
  heading,
  rest,
  pressing,
  delay,
  onStamped,
}: {
  stopKey: string;
  dark: boolean;
  worn: boolean;
  /** Where his prints point, in degrees clockwise from up, and whether he stands on all four (shared `stopPrints`). */
  heading: number;
  rest: boolean;
  pressing: boolean;
  delay: number;
  onStamped: (key: string) => void;
}): React.JSX.Element {
  const prefix = `lpst${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const print = useMarkup(
    () => pathStampSvg({ seed: stopKey, dark, worn, heading, prints: rest ? 4 : 2, idPrefix: `${prefix}p` }),
    [stopKey, dark, worn, heading, rest, prefix],
  );
  const tool = useMarkup(() => pathStampToolSvg({ dark, size: STAMP_TOOL_W, idPrefix: `${prefix}t` }), [dark, prefix]);
  const printRef = useRef<HTMLSpanElement>(null);
  const toolRef = useRef<HTMLSpanElement>(null);
  const done = useRef(onStamped);
  done.current = onStamped;
  // Before the first paint, so the print never shows before it is pressed.
  useLayoutEffect(() => {
    if (!pressing) return;
    const printEl = printRef.current;
    const toolEl = toolRef.current;
    const face = printEl?.closest<HTMLElement>('.lp-node-face');
    const { ms, toolY, toolShown, squash, printShown, printScale } = PATH_STAMP_MOMENT;
    if (!printEl || !toolEl || typeof printEl.animate !== 'function') {
      done.current(stopKey);
      return;
    }
    const sample = (keys: readonly (readonly [number, number])[]): number[] => STAMP_FRAMES.map((t) => sampleKeys(keys, t));
    const [ty, ts, sq, ps, pz] = [sample(toolY), sample(toolShown), sample(squash), sample(printShown), sample(printScale)];
    const timing = { duration: ms, delay, fill: 'both' as const };
    const runs = [
      toolEl.animate(STAMP_FRAMES.map((offset, i) => ({ offset, transform: `translateY(${ty[i]}px)`, opacity: ts[i] })), timing),
      printEl.animate(STAMP_FRAMES.map((offset, i) => ({ offset, opacity: ps[i], transform: `scale(${pz[i]})` })), timing),
      face?.animate(STAMP_FRAMES.map((offset, i) => ({ offset, transform: `scale(${2 - sq[i]!}, ${sq[i]})` })), { duration: ms, delay }),
    ];
    const end = window.setTimeout(() => done.current(stopKey), delay + ms);
    return () => {
      window.clearTimeout(end);
      runs.forEach((r) => r?.cancel());
    };
  }, [pressing, delay, stopKey]);
  return (
    <span className={`lp-stamp${pressing ? ' is-pressing' : ''}`} aria-hidden="true">
      <span ref={printRef} className="lp-stamp-print" dangerouslySetInnerHTML={print} />
      {pressing && <span ref={toolRef} className="lp-stamp-tool" dangerouslySetInnerHTML={tool} />}
    </span>
  );
}

/** The stamp's width over a tile, its face as wide as the seal, and the moments its motion is sampled at. */
const STAMP_TOOL_W = 58;
const STAMP_FRAMES = Array.from({ length: 41 }, (_, i) => i / 40);
