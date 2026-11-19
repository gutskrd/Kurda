/**
 * Hevalo's and Xezo's recorded reactions (shared reactions.ts), played on a player of their own a little under lesson
 * audio, with its clock handed to the character drawn so it says the line. A line plays only while Character voices
 * and Sounds are on, the app is in front, no lesson recording is sounding, no other line is, and its moment is not
 * resting; in a lesson whose listening was put off, none play until the lesson closes. With no recorded variant
 * nothing is heard.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
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
import type { ApiClient } from '../api/client';
import { soundsOn } from '../feedback/soundPref';
import { characterVoicesOn, loadCharacterVoicesPref } from '../feedback/voicesPref';
import { onRecordingQuiet, onRecordingSound, recordingSounding } from '../lesson/useAudio';
import type { PlaybackClock } from './voice';

/** A little under lesson audio: a word in passing. */
export const REACTION_VOLUME = 0.8;
/** How long the list of takes is kept before it is read again. */
const FRESH_MS = 30 * 60_000;

/** The line being said and the clock it plays on; `drawn` when its character is on screen, so the caption leaves out the face. */
export interface Speaking {
  clip: ReactionClip;
  drawn: boolean;
  clock: PlaybackClock;
}

interface Playback {
  clock: PlaybackClock;
  stop: () => void;
}

interface WebAudioEl {
  volume: number;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: string, cb: () => void) => void;
}

/** Expo web and tests: the DOM's audio element. */
function elementPlayback(url: string, done: () => void): Playback | null {
  const Ctor = (globalThis as { Audio?: new (src: string) => WebAudioEl }).Audio;
  if (typeof Ctor !== 'function') return null;
  const el = new Ctor(url);
  el.volume = REACTION_VOLUME;
  for (const type of ['ended', 'error', 'pause']) el.addEventListener(type, done);
  void el.play().catch(done);
  return {
    clock: {
      get currentTime() {
        return el.currentTime;
      },
      get duration() {
        return el.duration;
      },
      get playing() {
        return !el.paused && !el.ended;
      },
    },
    stop: () => el.pause(),
  };
}

interface PhonePlayer extends PlaybackClock {
  volume: number;
  play: () => void;
  pause: () => void;
  remove: () => void;
  addListener: (event: 'playbackStatusUpdate', cb: (s: { didJustFinish?: boolean; error?: string | null }) => void) => { remove: () => void };
}

/** A phone: expo-audio, required only there since the module cannot load outside a native build. */
function phonePlayback(url: string, done: () => void): Playback | null {
  let create: ((source: { uri: string }) => PhonePlayer) | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    create = (require('expo-audio') as { createAudioPlayer: (source: { uri: string }) => PhonePlayer }).createAudioPlayer;
  } catch {
    return null;
  }
  const player = create({ uri: url });
  player.volume = REACTION_VOLUME;
  let gone = false;
  const finish = (): void => {
    if (gone) return;
    gone = true;
    sub.remove();
    player.remove();
    done();
  };
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish || s.error) finish();
  });
  player.play();
  return { clock: player, stop: finish };
}

let takes: readonly ReactionTake[] = [];
let readAt = -Infinity;
let reading: Promise<void> | null = null;
let gate = createReactionGate();
const lastSaid = new Map<string, string>();
let hushed = false;
let speaking: (Speaking & { stop: () => void }) | null = null;
const listeners = new Set<(s: Speaking | null) => void>();

function tell(next: (Speaking & { stop: () => void }) | null): void {
  speaking = next;
  for (const l of listeners) l(next);
}

// A lesson's own recording always wins: a line still being said stops for it.
onRecordingSound(() => speaking?.stop());

/** Reads the recorded takes once, and again after a while; a failed read leaves the last list. */
export function loadReactions(client: ApiClient, at = Date.now()): Promise<void> {
  void loadCharacterVoicesPref();
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
  if (on) speaking?.stop();
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
  if (hushed || !characterVoicesOn() || !soundsOn() || AppState.currentState !== 'active') return false;
  if (speaking || recordingSounding()) return false;
  const at = Date.now();
  if (!gate.allow(moment, at)) return false;
  const which = `${character}:${moment}`;
  const clip = pickReaction(takes, moment, character, lastSaid.get(which) ?? null);
  if (!clip) return false;
  let mine: (Speaking & { stop: () => void }) | null = null;
  const done = (): void => {
    if (speaking === mine) tell(null);
  };
  const playback = Platform.OS === 'ios' || Platform.OS === 'android' ? phonePlayback(clip.src, done) : elementPlayback(clip.src, done);
  if (!playback) return false;
  gate.said(moment, at);
  lastSaid.set(which, clip.id);
  mine = { clip, drawn, clock: playback.clock, stop: playback.stop };
  tell(mine);
  return true;
}

/**
 * `sayReaction` after `ms`; with `afterAudio`, a beat later, and once the recording then playing (the answer's own) has
 * finished. The returned function calls it off, as an effect's cleanup does.
 */
export function sayReactionLater(ms: number, ask: ReactionAsk, afterAudio = false): () => void {
  let waiting: (() => void) | null = null;
  let beat: ReturnType<typeof setTimeout> | undefined;
  const at = setTimeout(
    () => {
      if (!afterAudio || !recordingSounding()) {
        sayReaction(ask);
        return;
      }
      const quit = setTimeout(() => waiting?.(), REACTION_AUDIO_WAIT_MS);
      const off = onRecordingQuiet(() => {
        waiting?.();
        beat = setTimeout(() => sayReaction(ask), REACTION_AFTER_AUDIO_MS);
      });
      waiting = () => {
        off();
        clearTimeout(quit);
        waiting = null;
      };
    },
    ms + (afterAudio ? REACTION_AFTER_AUDIO_MS : 0),
  );
  return () => {
    clearTimeout(at);
    clearTimeout(beat);
    waiting?.();
  };
}

/** Stops the line being said, as leaving its screen does. */
export function stopReaction(): void {
  speaking?.stop();
}

/** Hears each line as it starts, and null as it ends. */
export function onReaction(listener: (s: Speaking | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What `character` is saying on screen now, as HevaloWindow's `speech` reads it; null otherwise. */
export function useDrawnReaction(character: ReactionCharacter): { player: PlaybackClock; playing: boolean; source: string; text: string; clip: ReactionClip } | null {
  const pick = (s: Speaking | null) => (s && s.drawn && s.clip.character === character ? s : null);
  const [now, setNow] = useState<Speaking | null>(() => pick(speaking));
  useEffect(() => onReaction((s) => setNow(pick(s))), [character]);
  return now ? { player: now.clock, playing: true, source: now.clip.src, text: now.clip.line.ku, clip: now.clip } : null;
}

/** Back to an app that has read and said nothing, for tests. */
export function resetReactions(list: readonly ReactionTake[] = []): void {
  speaking?.stop();
  takes = list;
  readAt = list.length > 0 ? Date.now() : -Infinity;
  reading = null;
  gate = createReactionGate();
  lastSaid.clear();
  hushed = false;
  speaking = null;
}
