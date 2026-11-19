/**
 * Hevalo's and Xezal's recorded reactions (shared reactions.ts), played through the app's one player (lib/sound.ts) so a
 * line never sounds over lesson audio and the character drawn can say it. A line plays only while Character voices and
 * lesson sounds are on, the page is in front, nothing else is sounding and its moment is not resting; in a lesson whose
 * listening was put off, none play until the lesson closes. With no recorded variant nothing is heard.
 */
import { useEffect, useState } from 'react';
import {
  REACTION_AFTER_AUDIO_MS,
  REACTION_AUDIO_WAIT_MS,
  REACTION_VOICE,
  createReactionGate,
  pickReaction,
  type ReactionCharacter,
  type ReactionClip,
  type ReactionMoment,
  type ReactionTake,
  type ReactionTakes,
} from '@kurda/shared';
import type { ApiClient } from '../lib/api';
import { onError, onPlaying, play, sounding } from '../lib/sound';
import { characterVoicesOn, lessonSoundsOn } from '../lib/sounds';

/** A little under lesson audio: a word in passing. */
export const REACTION_VOLUME = 0.8;
/** How long the list of takes is kept before it is read again. */
const FRESH_MS = 30 * 60_000;

/** The line being said: `drawn` when its character is on screen, so the caption leaves out the face. */
export interface Speaking {
  clip: ReactionClip;
  drawn: boolean;
}

let takes: readonly ReactionTake[] = [];
let readAt = -Infinity;
let reading: Promise<void> | null = null;
let gate = createReactionGate();
const lastSaid = new Map<string, string>();
let hushed = false;
let speaking: Speaking | null = null;
let started = false;
const listeners = new Set<(s: Speaking | null) => void>();
let watching = false;

function tell(next: Speaking | null): void {
  speaking = next;
  started = false;
  for (const l of listeners) l(next);
}

/** Notices the line ending: the player moving to another clip, stopping, or failing to play it. */
function watch(): void {
  if (watching) return;
  watching = true;
  onPlaying((src) => {
    if (!speaking) return;
    if (src === speaking.clip.src) started = true;
    else if (started || src !== null) tell(null);
  });
  onError((src) => {
    if (speaking && src === speaking.clip.src) tell(null);
  });
}

/** Reads the recorded takes once, and again after a while; a failed read leaves the last list. */
export function loadReactions(client: ApiClient, at = Date.now()): Promise<void> {
  if (reading) return reading;
  if (at - readAt < FRESH_MS) return Promise.resolve();
  reading = client
    .get<ReactionTakes>('/reactions')
    .then((res) => {
      if (res.ok && Array.isArray(res.data.takes)) {
        takes = res.data.takes;
        readAt = at;
      }
    })
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** "Can't listen now" in a lesson: quiet until the lesson closes, or the choice is undone. */
export function hushReactions(on: boolean): void {
  hushed = on;
}

export interface ReactionAsk {
  moment: ReactionMoment;
  /** who says it: the character on screen, else the moment's own voice */
  character?: ReactionCharacter;
  /** the character is drawn on screen and says it there */
  drawn?: boolean;
}

/** Plays one recorded variant for the moment when everything above allows; whether it did. */
export function sayReaction({ moment, character = REACTION_VOICE[moment], drawn = false }: ReactionAsk): boolean {
  if (hushed || !characterVoicesOn() || !lessonSoundsOn()) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (sounding()) return false;
  const at = Date.now();
  if (!gate.allow(moment, at)) return false;
  const which = `${character}:${moment}`;
  const clip = pickReaction(takes, moment, character, lastSaid.get(which) ?? null);
  if (!clip) return false;
  gate.said(moment, at);
  lastSaid.set(which, clip.id);
  watch();
  tell({ clip, drawn });
  play(clip.src, 1, 0, REACTION_VOLUME);
  return true;
}

/**
 * `sayReaction` after `ms`; with `afterAudio`, a beat later, and once the recording then playing (the answer's own) has
 * finished. The returned function calls it off, as an effect's cleanup does.
 */
export function sayReactionLater(ms: number, ask: ReactionAsk, afterAudio = false): () => void {
  let waiting: (() => void) | null = null;
  let beat: number | undefined;
  const at = window.setTimeout(
    () => {
      if (!afterAudio || !sounding()) {
        sayReaction(ask);
        return;
      }
      const quit = window.setTimeout(() => waiting?.(), REACTION_AUDIO_WAIT_MS);
      const off = onPlaying((src) => {
        if (src !== null) return;
        waiting?.();
        beat = window.setTimeout(() => sayReaction(ask), REACTION_AFTER_AUDIO_MS);
      });
      waiting = () => {
        off();
        window.clearTimeout(quit);
        waiting = null;
      };
    },
    ms + (afterAudio ? REACTION_AFTER_AUDIO_MS : 0),
  );
  return () => {
    window.clearTimeout(at);
    window.clearTimeout(beat);
    waiting?.();
  };
}

/** Hears each line as it starts, and null as it ends. */
export function onReaction(listener: (s: Speaking | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The line `character` is saying on screen now, for its drawing to move its mouth with; null otherwise. */
export function useDrawnReaction(character: ReactionCharacter): ReactionClip | null {
  const [clip, setClip] = useState<ReactionClip | null>(() => (speaking?.drawn && speaking.clip.character === character ? speaking.clip : null));
  useEffect(
    () =>
      onReaction((s) => {
        if (!s) setClip(null);
        else if (s.drawn && s.clip.character === character) setClip(s.clip);
      }),
    [character],
  );
  return clip;
}

/** Back to a page that has read and said nothing, for tests. */
export function resetReactions(list: readonly ReactionTake[] = []): void {
  takes = list;
  readAt = list.length > 0 ? Date.now() : -Infinity;
  reading = null;
  gate = createReactionGate();
  lastSaid.clear();
  hushed = false;
  speaking = null;
  started = false;
}
