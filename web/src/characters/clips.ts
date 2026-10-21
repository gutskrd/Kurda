import type { RecordingVoice } from '@kurda/shared';

/** A recording a place can play, and the character who says it. */
export interface SpokenClip {
  src: string;
  voice: RecordingVoice;
  /** the words, for moving the mouth when no timeline was saved with the recording */
  text?: string | null;
}

/** A recording that may or may not have a character. */
export interface MaybeSpoken {
  src?: string | null;
  voice?: RecordingVoice | null;
  text?: string | null;
}

/**
 * The recordings in `list` that an editor gave a character, once each. A
 * recording without one shows nobody: Hevalo speaks only where he was chosen.
 */
export function spokenClips(list: readonly MaybeSpoken[]): SpokenClip[] {
  const out: SpokenClip[] = [];
  for (const { src, voice, text } of list) {
    if (!src || !voice || out.some((c) => c.src === src)) continue;
    out.push({ src, voice, text });
  }
  return out;
}
