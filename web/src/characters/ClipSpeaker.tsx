import { useEffect, useState } from 'react';
import type { SpokenClip } from './clips';
import type { CharacterCrop } from '@kurda/shared';
import { play, onPlaying, soundPlayer } from '../lib/sound';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';

/**
 * Of the recordings a place plays, the one whose character to show: the one
 * sounding now, else the last that sounded, else the first. It changes only
 * when a recording starts, never on a frame.
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
 * The character for a place's recordings, following the app's one player
 * (lib/sound.ts): whoever says the recording playing now speaks, and between
 * recordings the last of them waits, mouth at rest. Nothing at all when none
 * of the recordings has a character.
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
  /** what it has just seen: a right answer gets a cheer, one that was not yet a curious tilt of the head */
  reaction?: CharacterReaction | null;
  /** a click on the character says its recording again */
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
