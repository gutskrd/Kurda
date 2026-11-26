import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CHAPTER_ART,
  CHAPTER_ART_LOOP,
  PATH_CHEST_HINGE,
  PATH_PIGEON_FLIGHT,
  PATH_SCENES,
  PATH_SCENE_BOX,
  PATH_SCENE_MOTION,
  PATH_SCENE_SPRITE_BOX,
  PATH_SLATE_LETTERS,
  PATH_STOP_ART,
  chapterArtOf,
  chapterArtSvg,
  characterArt,
  cropBox,
  letterBirdSvg,
  pathChestSvg,
  pathCoinSvg,
  pathGarlandSvg,
  pathScenePropSvg,
  pathSceneSpriteSvg,
  sampleKeys,
  sceneBeat,
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

/** A chapter's vignette in its banner, standing on the banner's foot, with its one moving part laid over it. */
export function ChapterArt({ chapter, ground, height }: { chapter: number; ground: string; height: number }): React.JSX.Element {
  const id = chapterArtOf(chapter);
  const loop = CHAPTER_ART_LOOP[id];
  const s = height / CHAPTER_ART.h;
  const prefix = `lpca${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const still = useMarkup(() => chapterArtSvg({ chapter: id, ground, height, idPrefix: `${prefix}s` }), [id, ground, height, prefix]);
  const moving = useMarkup(() => chapterArtSvg({ chapter: id, part: 'loop', height: loop.h * s, idPrefix: `${prefix}m` }), [id, loop, s, prefix]);
  const origin = `${(((loop.px - loop.x) / loop.w) * 100).toFixed(1)}% ${(((loop.py - loop.y) / loop.h) * 100).toFixed(1)}%`;
  return (
    <span className="lp-pin-art" aria-hidden="true" data-art={id} style={{ width: CHAPTER_ART.w * s, height }}>
      <span className="lp-pin-still" dangerouslySetInnerHTML={still} />
      <span
        className={`lp-pin-loop is-${loop.kind}`}
        style={{ left: loop.x * s, top: loop.y * s, width: loop.w * s, height: loop.h * s, transformOrigin: origin }}
        dangerouslySetInnerHTML={moving}
      />
    </span>
  );
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

/**
 * The pigeon trying to land on its post, its letter in its beak (shared `PATH_PIGEON_FLIGHT`), and hopping when tapped;
 * a member's pigeon from the letters, in its own colours by day and night alike.
 */
function Pigeon({ moving, hop }: { moving: boolean; hop: number }): React.JSX.Element {
  const { actor } = PATH_SCENES.letter;
  const size = 64;
  const prefix = `lppg${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const up = useMarkup(() => letterBirdSvg({ bird: 0, pose: 'wings-up', letter: true, size, idPrefix: `${prefix}u`, shadow: false }), [prefix]);
  const down = useMarkup(() => letterBirdSvg({ bird: 0, pose: 'wings-down', letter: true, size, idPrefix: `${prefix}d`, shadow: false }), [prefix]);
  const perched = useMarkup(() => letterBirdSvg({ bird: 0, pose: 'perched', letter: true, size, idPrefix: `${prefix}p` }), [prefix]);
  const flight = useRef<HTMLSpanElement>(null);
  const sitting = useRef<HTMLSpanElement>(null);
  const flying = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = flight.current;
    if (!moving || !el || typeof el.animate !== 'function') return;
    const { ms, x, y, tilt, shown, perched: [from, to] } = PATH_PIGEON_FLIGHT;
    const times = [...new Set([...x, ...y, ...tilt, ...shown].map(([t]) => t))].sort((a, b) => a - b);
    const path = el.animate(
      times.map((t) => ({
        offset: t,
        transform: `translate(${sampleKeys(x, t)}px, ${sampleKeys(y, t)}px) rotate(${sampleKeys(tilt, t)}deg)`,
        opacity: sampleKeys(shown, t),
      })),
      { duration: ms, iterations: Infinity },
    );
    // On the post between landing and taking off; in the air, flapping, the rest of the way round.
    const swap = (on: number[]): Keyframe[] => [0, from, from, to, to, 1].map((offset, i) => ({ offset, opacity: on[i] }));
    const sit = sitting.current?.animate(swap([0, 0, 1, 1, 0, 0]), { duration: ms, iterations: Infinity });
    const fly = flying.current?.animate(swap([1, 1, 0, 0, 1, 1]), { duration: ms, iterations: Infinity });
    return () => {
      path.cancel();
      sit?.cancel();
      fly?.cancel();
    };
  }, [moving]);
  return (
    <span className="lp-pigeon" style={{ left: actor.x - size / 2, top: actor.y + actor.h - (size * 100) / 120, width: size, height: size }}>
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
 * A unit's little scene beside its road (shared `pathScene`, `sceneBeat`): Hevalo eating his apple bite by bite over the
 * orchard wall, Hamo sugaring his tea, Xezo chalking ê, ç and ş, or the pigeon trying to land with a letter, with the
 * chapter's rounds as stars strung under it. `flip` mirrors it for the road's other side, all but the slate's letters.
 * A tap gets a little moment of its own.
 */
export function PathScene({
  scene,
  flip,
  dark,
  rounds,
  reduce,
}: {
  scene: PathSceneId;
  flip: boolean;
  dark: boolean;
  /** The chapter's rounds, which its garland lights. */
  rounds: number;
  reduce: boolean;
}): React.JSX.Element {
  const layout = PATH_SCENES[scene];
  const root = useRef<HTMLSpanElement>(null);
  const inFront = useInFront(root);
  const moving = inFront && !reduce;
  const [beat, setBeat] = useState(0);
  const [tap, setTap] = useState({ count: 0, beat: -1 });
  useEffect(() => {
    if (!moving || scene === 'letter') return;
    const id = window.setInterval(() => setBeat((b) => b + 1), PATH_SCENE_MOTION.beatMs[scene]);
    return () => window.clearInterval(id);
  }, [moving, scene]);
  const now = sceneBeat(scene, beat);
  // A tap's moment lasts until the next beat, whose act then follows.
  const tapped = tap.count > 0 && tap.beat === beat ? tapAct(scene, tap.count) : null;
  const cue = tapped ? { act: tapped, at: -tap.count } : now.act ? { act: now.act, at: beat } : null;
  const garland = useMarkup(() => pathGarlandSvg({ lit: rounds, dark }), [rounds, dark]);
  const art = layout.who === 'pigeon' ? null : characterArt(layout.who);
  const frame = art ? cropBox(art, layout.actor.crop) : null;
  const width = frame ? (layout.actor.h * frame.w) / frame.h : 0;
  const press = (): void => setTap((t) => ({ count: t.count + 1, beat }));
  const apple = PATH_SCENES.apple.front.apple!;
  const offering = scene === 'apple' && tapped === 'offer';
  const hiccup = scene === 'apple' && tapped === 'hiccup';
  return (
    <span ref={root} className={`lp-scene-stage${flip ? ' is-flipped' : ''}${moving ? ' is-moving' : ''}`} style={{ width: PATH_SCENE_BOX.w, height: PATH_SCENE_BOX.h }}>
      {Object.keys(layout.back).map((p) => (
        <Prop key={p} scene={scene} prop={p} dark={dark} />
      ))}
      {art && frame ? (
        <span className="lp-actor" style={{ left: layout.actor.x - width / 2, top: layout.actor.y, width, height: layout.actor.h }}>
          <SpeakingCharacter speaker={layout.who as 'hevalo' | 'hamo' | 'xezo'} audio={null} crop={layout.actor.crop} size={layout.actor.h} decorative cue={cue} />
        </span>
      ) : (
        <Pigeon moving={moving} hop={tap.count} />
      )}
      {Object.keys(layout.front)
        .filter((p) => !(scene === 'apple' && p === 'apple'))
        .map((p) => (
          <Prop key={p} scene={scene} prop={p} dark={dark} />
        ))}
      {scene === 'apple' && (
        <>
          {now.growing ? (
            <>
              <Sprite key={`core${beat}`} sprite="core" x={apple.x} y={apple.y} dark={dark} className="is-dropping" />
              <Sprite key={`new${beat}`} sprite="apple-0" x={apple.x} y={apple.y} dark={dark} className="is-growing" />
            </>
          ) : (
            <Sprite
              key={offering ? `offer${tap.count}` : 'apple'}
              sprite={now.bites >= 5 ? 'core' : (`apple-${now.bites}` as PathSceneSprite)}
              x={apple.x}
              y={apple.y}
              dark={dark}
              className={`lp-apple${offering ? ' is-offered' : ''}`}
            />
          )}
          {now.crumbs && <Sprite key={`crumbs${beat}`} sprite="crumbs" x={apple.x + 12} y={apple.y + 26} dark={dark} className="is-falling" />}
          {hiccup && <Sprite key={`hic${tap.count}`} sprite="hic" x={layout.actor.x - 6} y={34} dark={dark} className="is-rising" />}
        </>
      )}
      {scene === 'tea' && (
        <>
          <Sprite sprite="steam" x={33} y={30} dark={dark} className="is-steaming" />
          {now.cube && <Sprite key={`cube${beat}`} sprite="cube" x={84} y={58} dark={dark} className="is-tossed" />}
          {now.cube && <Sprite key={`splash${beat}`} sprite="splash" x={32} y={52} dark={dark} className="is-splashing" />}
        </>
      )}
      {scene === 'slate' &&
        PATH_SLATE_LETTERS.map((l, i) => (
          <Sprite
            key={l.sprite}
            sprite={l.sprite}
            // Mirrored, the slate's places run the other way, so the letters still read ê, ç, ş.
            x={flip ? PATH_SLATE_LETTERS[PATH_SLATE_LETTERS.length - 1 - i]!.x : l.x}
            y={l.y}
            dark={dark}
            className={`lp-chalk${i < now.letters && !now.wiping ? ' is-written' : ''}${reduce && i < 3 ? ' is-written' : ''}`}
          />
        ))}
      <span className="lp-garland" data-lit={rounds} style={at(layout.garland)} dangerouslySetInnerHTML={garland} />
      <button type="button" className="lp-scene-hit" tabIndex={-1} aria-hidden="true" onClick={press} style={hitBox(scene)} />
    </span>
  );
}

/** Where a tap lands on a scene: its character, and for the pigeon its post. */
function hitBox(scene: PathSceneId): React.CSSProperties {
  const { actor } = PATH_SCENES[scene];
  return { left: Math.max(0, actor.x - 34), top: Math.max(0, actor.y), width: 68, height: Math.min(PATH_SCENE_BOX.h - actor.y, scene === 'letter' ? 100 : actor.h) };
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
