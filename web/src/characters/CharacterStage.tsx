import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { characterArt, stageBackdrop, stageFigure } from '@kurda/shared';
import { play, soundPlayer } from '../lib/sound';
import { useSpokenClip } from './ClipSpeaker';
import type { SpokenClip } from './clips';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';

/**
 * How tall a stage is in a window this tall: the character head to waist, as
 * large as the window can spare once `reserve` pixels are left for the rest of
 * the exercise, and never shorter than `min`, so every phone shows the same
 * stage (a small one scrolls a little); nor so large on a big screen that it
 * is all there is. The phone app's `stageHeight`.
 *
 * A stage in a card with more on it than an exercise — a letter, a practice
 * question — is `card` tall in every window: smaller.
 */
export const STAGE = { reserve: 500, min: 300, max: 380, card: 260 } as const;

export function stageHeight(windowHeight: number): number {
  return Math.round(Math.min(STAGE.max, Math.max(STAGE.min, windowHeight - STAGE.reserve)));
}

function useStageHeight(fixed: number | undefined): number {
  const [height, setHeight] = useState(() => stageHeight(typeof window === 'undefined' ? 820 : window.innerHeight));
  useEffect(() => {
    if (fixed !== undefined) return;
    const onResize = (): void => setHeight(stageHeight(window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fixed]);
  return fixed ?? height;
}

/** Room left above the head on the stage, so it never touches the top edge. */
const HEADROOM = 16;

/** How far over the stage's top edge a hop may carry the head, as a share of the stage's height, before anything cuts it off. */
const HOP_ROOM = 0.3;

/** The least share of the stage's width the character's side of it takes, from the start: the buttons or the words have the rest. */
const STAND_AT = 0.26;

/**
 * Where an exercise's character stands to say what it says, as on the phone:
 * head to waist, as large as the window can spare, in nothing but its own
 * light (shared `stageBackdrop`, drawn once for a light page and once for a
 * dark one), and `children` — the play buttons, or the words being asked
 * about — standing beside it.
 *
 * The whole figure is drawn, its head just below the stage's top edge, and
 * the stage's bottom edge cuts off the rest: at the waist, or a little below
 * it for a character too wide to be shown so tall. A hop lifts the legs into
 * view rather than a cut edge, and the head may hop out over the top edge.
 *
 * Whoever says the recording playing now stands there (`useSpokenClip`). A
 * click on them greets you and says it again; `reaction` gets a cheer for a
 * right answer and a curious tilt of the head for one that was not yet.
 *
 * Decorative: the buttons say what is heard, and the character adds who.
 */
export function CharacterStage({
  clips,
  reaction = null,
  height: fixed,
  share = STAND_AT * 2,
  className,
  children,
}: {
  clips: readonly SpokenClip[];
  reaction?: CharacterReaction | null;
  /** a stage this tall whatever the window (`STAGE.card`) */
  height?: number;
  /** the least share of the stage's width the character's side takes: less beside a speech bubble, which needs the room */
  share?: number;
  className?: string;
  children?: ReactNode;
}): React.JSX.Element | null {
  const clip = useSpokenClip(clips);
  const height = useStageHeight(fixed);
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(([entry]) => {
      // the stage's whole width, its padding too: the backdrop and the character's side are shares of it
      const w = Math.round(entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const speaker = clip?.voice.speaker ?? null;
  const shown = speaker ? stageFigure(speaker, width, height, HEADROOM) : { width: 0, height: 0 };
  const spot = Math.round(Math.max(shown.width, width * share));
  const standAt = (rtl ? width - spot / 2 : spot / 2) / width;
  const backdrops = useMemo(
    () =>
      speaker
        ? {
            light: { __html: stageBackdrop(speaker, width, height, standAt, { idPrefix: `stage-${speaker}-light` }) },
            dark: { __html: stageBackdrop(speaker, width, height, standAt, { dark: true, idPrefix: `stage-${speaker}-dark` }) },
          }
        : null,
    [speaker, width, height, standAt],
  );
  if (!clip || !backdrops) return null;
  const replay = (): void => play(clip.src);
  // the whole figure in pixels, and how far its top and its start lie beyond the head-to-waist box shown
  const art = characterArt(clip.voice.speaker);
  const unit = shown.height / art.half.h;
  const hop = Math.round(height * HOP_ROOM);
  const place = {
    top: hop + HEADROOM - (art.half.y - art.viewBox.y) * unit,
    left: (spot - shown.width) / 2 - (art.half.x - art.viewBox.x) * unit,
  };
  return (
    <div
      ref={stage}
      className={className ? `character-stage ${className}` : 'character-stage'}
      style={{ '--stage-h': `${height}px`, '--stage-spot': `${spot}px`, '--stage-hop': `${hop}px` } as React.CSSProperties}
    >
      <span className="character-stage-backdrop is-light" aria-hidden="true" dangerouslySetInnerHTML={backdrops.light} />
      <span className="character-stage-backdrop is-dark" aria-hidden="true" dangerouslySetInnerHTML={backdrops.dark} />
      <div className="character-stage-figure">
        <div className="character-stage-place" style={place}>
          <SpeakingCharacter
            speaker={clip.voice.speaker}
            audio={soundPlayer}
            src={clip.src}
            voice={clip.voice}
            text={clip.text}
            crop="full"
            size={art.viewBox.h * unit}
            decorative
            reaction={reaction}
            onPress={replay}
          />
        </div>
      </div>
      <div className="character-stage-side">{children}</div>
    </div>
  );
}
