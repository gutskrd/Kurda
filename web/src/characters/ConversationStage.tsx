import { useEffect, useMemo, useRef, useState } from 'react';
import {
  characterArt,
  conversationLineVoice,
  gazeTargets,
  lookAcross,
  stageCast,
  stageLines,
  standTogether,
  togetherBackdrop,
  type ConversationLine,
  type ConversationSpeaker,
  type RecordingVoice,
  type SpeakerId,
} from '@kurda/shared';
import { onPlaying, soundPlayer } from '../lib/sound';
import { STAGE } from './CharacterStage';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';

/** Room left above the heads, so none touches the top edge. */
const HEADROOM = 16;

/** How far above the stage's top edge a hop may carry a head, as a share of its height. */
const HOP_ROOM = 0.3;

const NO_VOICES: ReadonlyArray<RecordingVoice | null> = [];

/**
 * The line heard last: the one being played through (`at`), else the last line the app's player started, however it
 * was started. Null before any has been heard.
 */
function useHeardLine(audio: ReadonlyArray<string | null>, at: number | null): number | null {
  const [heard, setHeard] = useState<string | null>(null);
  const key = audio.join('\n');
  useEffect(() => {
    const list = key.split('\n');
    return onPlaying((src) => {
      if (src !== null && list.includes(src)) setHeard(src);
    });
  }, [key]);
  // A part saying the same words twice is one recording, so the play-through decides which line it is.
  if (at !== null && (heard === null || audio[at] === heard)) return at;
  const i = heard === null ? -1 : audio.indexOf(heard);
  return i >= 0 ? i : null;
}

/**
 * A conversation's characters side by side on one stage, in order of appearance, head to waist at the same size
 * (shared `standTogether`, `togetherBackdrop`). The speaker of the line heard last says it as that line's part's
 * character (shared `conversationLineVoice`); the others look at them, and they look back at the previous speaker
 * (shared `gazeTargets`, `lookAcross`). Faces drawn slightly turned are mirrored where they would face away.
 *
 * The learner's own part is not on stage; characters talking with them look out. Decorative, since the lines below
 * say who says what. Nothing shows when a part has no character.
 */
export function ConversationStage({
  speakers,
  lines,
  audio,
  voices = NO_VOICES,
  at = null,
  reaction = null,
  height = STAGE.card,
}: {
  speakers: readonly ConversationSpeaker[];
  lines: readonly ConversationLine[];
  /** Each line's recording by position; null for one not recorded. */
  audio: ReadonlyArray<string | null>;
  voices?: ReadonlyArray<RecordingVoice | null>;
  /** The line being played through, if any. */
  at?: number | null;
  reaction?: CharacterReaction | null;
  height?: number;
}): React.JSX.Element | null {
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const heard = useHeardLine(audio, at);
  // The characters on stage in order; the learner's own part is not among them.
  const cast = stageCast(speakers);
  const complete = cast !== null;
  // The cast as one string, so a new array of the same characters changes nothing.
  const castKey = cast ? cast.join(',') : '';
  // Each line by its speaker on stage; the learner's lines have none, so the cast looks out at them.
  const staged = useMemo(() => stageLines(speakers, lines), [speakers, lines]);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const places = useMemo(() => {
    const ids = castKey ? (castKey.split(',') as SpeakerId[]) : [];
    return standTogether(
      ids.map((id) => characterArt(id)),
      width,
      height,
      HEADROOM,
      rtl,
    );
  }, [castKey, width, height, rtl]);
  const backdrops = useMemo(
    () =>
      places.length > 0
        ? {
            light: { __html: togetherBackdrop(places, width, height, { idPrefix: 'together-light' }) },
            dark: { __html: togetherBackdrop(places, width, height, { dark: true, idPrefix: 'together-dark' }) },
          }
        : null,
    [places, width, height],
  );
  if (!complete || !backdrops) return null;

  const looks = gazeTargets(places.length, staged, heard);
  const line = heard !== null ? staged[heard] : undefined;
  const said = heard !== null ? lines[heard] : undefined;
  const hop = Math.round(height * HOP_ROOM);
  return (
    <div
      ref={stage}
      className="conversation-stage"
      aria-hidden="true"
      data-testid="conversation-stage"
      style={{ '--stage-h': `${height}px`, '--stage-hop': `${hop}px` } as React.CSSProperties}
    >
      <span className="character-stage-backdrop is-light" dangerouslySetInnerHTML={backdrops.light} />
      <span className="character-stage-backdrop is-dark" dangerouslySetInnerHTML={backdrops.dark} />
      <div className="conversation-stage-figures">
        {places.map((place) => {
          const saying = line !== undefined && line.speaker === place.part && heard !== null ? heard : null;
          const src = saying !== null ? (audio[saying] ?? null) : null;
          const other = places[looks[place.part] ?? place.part] ?? place;
          return (
            <div
              key={place.part}
              className="conversation-stage-place"
              style={{ left: place.left, top: place.top + hop }}
              data-part={place.part}
              data-saying={src ? '' : undefined}
            >
              <SpeakingCharacter
                speaker={place.id}
                audio={soundPlayer}
                // The part's own line, said by its own character; nobody else speaks while it plays.
                src={src}
                voice={src && said ? conversationLineVoice(speakers, said, voices[saying!]) : null}
                text={src && said ? said.text : null}
                quiet={!src}
                gaze={lookAcross(place, other)}
                mirrored={place.mirrored}
                crop="full"
                size={place.height}
                decorative
                reaction={reaction}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
