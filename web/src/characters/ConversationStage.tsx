import { useEffect, useMemo, useRef, useState } from 'react';
import {
  characterArt,
  conversationLineVoice,
  gazeTargets,
  isSpeakerId,
  lookAcross,
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

/** How far over the stage's top edge a hop may carry a head, as a share of its height, before anything cuts it off. */
const HOP_ROOM = 0.3;

const NO_VOICES: ReadonlyArray<RecordingVoice | null> = [];

/**
 * The line heard last: the one the conversation is playing through (`at`), or
 * else the last of its lines the app's one player started, whichever way it
 * was started (a line's own button). Null before any has been heard.
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
  // one part saying the same words twice is one recording: the play-through knows which of the two lines it is at
  if (at !== null && (heard === null || audio[at] === heard)) return at;
  const i = heard === null ? -1 : audio.indexOf(heard);
  return i >= 0 ? i : null;
}

/**
 * The people in a conversation, side by side on one stage and looking at
 * each other: the characters playing its parts, in the order they first
 * appear, the first on the start side, every one head to waist at the same
 * size in their own light (shared `standTogether`, `togetherBackdrop`).
 *
 * Whoever says the line heard last speaks it, mouth moving with the sound,
 * and is always that line's own part's character, whichever voice its
 * recording was saved under (shared `conversationLineVoice`). Everyone else
 * stays quiet and looks at them, and they look back at whoever spoke before
 * them (shared `gazeTargets`, `lookAcross`). A face drawn turned a little is
 * stood the other way round where that would turn it from the others.
 *
 * Decorative: the lines below say who says what; the stage shows it. Nothing
 * at all for a conversation with a part no character plays.
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
  /** each line's recording, by its place; null for one not recorded */
  audio: ReadonlyArray<string | null>;
  voices?: ReadonlyArray<RecordingVoice | null>;
  /** the line the conversation is playing through, if it is */
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
  const cast = speakers.map((s) => s.character);
  const complete = cast.length > 0 && cast.every((c) => isSpeakerId(c));
  // the cast as one string, so a new array of the same characters changes nothing
  const castKey = complete ? cast.join(',') : '';
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

  const looks = gazeTargets(places.length, lines, heard);
  const line = heard !== null ? lines[heard] : undefined;
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
                // the part's own line, said by the part's own character; nobody else speaks while it plays
                src={src}
                voice={src && line ? conversationLineVoice(speakers, line, voices[saying!]) : null}
                text={src && line ? line.text : null}
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
