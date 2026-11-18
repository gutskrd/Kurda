import { useEffect, useState } from 'react';
import type { SpokenClip } from './clips';
import type { CharacterCrop } from '@kurda/shared';
import { play, onPlaying, soundPlayer } from '../lib/sound';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';

/**
 * Which recording's character to show: the one playing now, else the last played, else the first. It changes only
 * when a recording starts.
 */
export function useSpokenClip(clips: readonly SpokenClip[]): SpokenClip | null {
  const [heard, setHeard] = useState<string | null>(null);
  const key = clips.map((c) => c.src).join('\n');
  useEffect(() => {
    const srcs = new Set(key.split('\n'));
    return onPlaying((src) => {
      if (src !== null && srcs.has(src)) setHeard(src);
    });
  }, [key]);
  return clips.find((c) => c.src === heard) ?? clips[0] ?? null;
}

/**
 * The character for a place's recordings, following the app's single player (lib/sound.ts): the current speaker
 * speaks, and between recordings the last waits with its mouth at rest. Nothing when no recording has a character.
 */
export function ClipSpeaker({
  clips,
  crop = 'bust',
  size,
  decorative = false,
  reaction = null,
  replay = false,
  className,
}: {
  clips: readonly SpokenClip[];
  crop?: CharacterCrop;
  size?: number;
  decorative?: boolean;
  /** The latest answer: a cheer for a right one, a curious head tilt for a wrong one. */
  reaction?: CharacterReaction | null;
  /** A click on the character replays its recording. */
  replay?: boolean;
  className?: string;
}): React.JSX.Element | null {
  const clip = useSpokenClip(clips);
  if (!clip) return null;
  return (
    <SpeakingCharacter
      speaker={clip.voice.speaker}
      audio={soundPlayer}
      src={clip.src}
      voice={clip.voice}
      text={clip.text}
      crop={crop}
      size={size}
      decorative={decorative}
      reaction={reaction}
      onPress={replay ? () => play(clip.src) : undefined}
      className={className}
    />
  );
}
