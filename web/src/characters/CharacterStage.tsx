import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { stageBackdrop } from '@kurda/shared';
import { play, soundPlayer } from '../lib/sound';
import { useSpokenClip } from './ClipSpeaker';
import type { SpokenClip } from './clips';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';

/**
 * How tall a stage is in a window this tall: the whole figure, as large as
 * the window can spare once `reserve` pixels are left for the rest of the
 * exercise, and never shorter than `min`, so every phone shows the same stage
 * with the whole figure on it (a small one scrolls a little); nor so large on
 * a big screen that it is all there is. The phone app's `stageHeight`.
 */
export const STAGE = { reserve: 500, min: 300, max: 380 } as const;

export function stageHeight(windowHeight: number): number {
  return Math.round(Math.min(STAGE.max, Math.max(STAGE.min, windowHeight - STAGE.reserve)));
}

function useStageHeight(): number {
  const [height, setHeight] = useState(() => stageHeight(typeof window === 'undefined' ? 820 : window.innerHeight));
  useEffect(() => {
    const onResize = (): void => setHeight(stageHeight(window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return height;
}

/** Where the character stands, as a share of the stage's width from its start: where its light is brightest. */
const STAND_AT = 0.26;

/**
 * Where an exercise's character stands to say what it says, as on the phone:
 * the whole figure, as large as the window can spare, in its own light with
 * the Zagros behind it (shared `stageBackdrop`, drawn once for a light page
 * and once for a dark one), and `children` — the play buttons, or the words
 * being asked about — standing beside it.
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
  children,
}: {
  clips: readonly SpokenClip[];
  reaction?: CharacterReaction | null;
  children?: ReactNode;
}): React.JSX.Element | null {
  const clip = useSpokenClip(clips);
  const height = useStageHeight();
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const standAt = rtl ? 1 - STAND_AT : STAND_AT;
  const speaker = clip?.voice.speaker ?? null;
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
  return (
    <div ref={stage} className="character-stage" style={{ '--stage-h': `${height}px` } as React.CSSProperties}>
      <span className="character-stage-backdrop is-light" aria-hidden="true" dangerouslySetInnerHTML={backdrops.light} />
      <span className="character-stage-backdrop is-dark" aria-hidden="true" dangerouslySetInnerHTML={backdrops.dark} />
      <div className="character-stage-figure">
        <SpeakingCharacter
          speaker={clip.voice.speaker}
          audio={soundPlayer}
          src={clip.src}
          voice={clip.voice}
          text={clip.text}
          crop="full"
          decorative
          reaction={reaction}
          onPress={replay}
        />
      </div>
      <div className="character-stage-side">{children}</div>
    </div>
  );
}
