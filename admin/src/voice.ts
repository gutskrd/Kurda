/**
 * Who says a recording, and how their mouth moves while it plays: the studio's
 * side of the speaking characters (Hevalo, Hamo and Xezo in @kurda/shared).
 *
 * The speaker is the editor's choice, and the last one made for a new
 * recording is the default for the next. The mouth's timeline is made here, in
 * the browser, from the recording's own sound and its words
 * (lipsyncFromAudio), and goes up with the recording. A timeline is never
 * worth a recording: when the sound cannot be read the words are spread over
 * its length instead, and when that fails too, or the server will not take
 * it, the recording is saved without one — the apps then time the mouth from
 * the text themselves, and the Characters page can make it later.
 */
import {
  DEFAULT_CHARACTER,
  encodeLipsync,
  isSpeakerId,
  lipsyncFromAudio,
  lipsyncFromText,
  type LipsyncData,
  type LipsyncScript,
  type SpeakerId,
} from '@kurda/shared';
import { api, apiUpload, ApiError } from './api';
import { audioContextClass, mixToMono } from './audioClip';

/** A character, or null for none. */
export type Speaker = SpeakerId | null;

/** The kinds of recording PATCH /admin/audio/:kind can change. */
export type AudioKind = 'lesson' | 'alphabet' | 'dictionary';

const SPEAKER_KEY = 'kurda_admin_speaker';

/** Who says a new recording until the editor picks someone else: the last pick, or Hevalo. */
export function rememberedSpeaker(): Speaker {
  try {
    const saved = localStorage.getItem(SPEAKER_KEY);
    if (saved === 'none') return null;
    if (isSpeakerId(saved)) return saved;
  } catch {
    // a blocked storage only means the choice is not remembered
  }
  return DEFAULT_CHARACTER;
}

export function rememberSpeaker(speaker: Speaker): void {
  try {
    localStorage.setItem(SPEAKER_KEY, speaker ?? 'none');
  } catch {
    // as above
  }
}

/** The sound of a file as one channel: what the browser decodes, its channels averaged. */
export async function decodeMono(data: ArrayBuffer): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const Ctx = audioContextClass();
  if (!Ctx) throw new Error('this browser cannot work with sound');
  const ctx = new Ctx();
  try {
    // with callbacks as well: older Safari's decodeAudioData returns no promise
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      const answer = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      answer?.then(resolve, reject);
    });
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    return { pcm: mixToMono(channels), sampleRate: decoded.sampleRate };
  } finally {
    void ctx.close?.();
  }
}

/** How long a WAV lasts, read from its header; null when it is not one. */
export function wavDurationMs(wav: Uint8Array): number | null {
  const tag = (at: number): string => String.fromCharCode(...wav.subarray(at, at + 4));
  if (wav.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let byteRate = 0;
  for (let at = 12; at + 8 <= wav.length; ) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ' && at + 20 <= wav.length) byteRate = view.getUint32(at + 16, true);
    if (tag(at) === 'data') return byteRate > 0 ? (Math.min(size, wav.length - at - 8) / byteRate) * 1000 : null;
    at += 8 + size + (size % 2);
  }
  return null;
}

/** A timeline from a recording's sound and its words; throws when the sound cannot be read. */
export async function timelineFromSound(audio: ArrayBuffer, text: string, script?: LipsyncScript): Promise<LipsyncData> {
  const { pcm, sampleRate } = await decodeMono(audio);
  return encodeLipsync(lipsyncFromAudio(text, pcm, sampleRate, script ? { script } : {}));
}

export interface MadeTimeline {
  lipsync: LipsyncData;
  /** what it was timed by: the recording itself, or only its words over its length */
  from: 'sound' | 'text';
}

/**
 * A recording's timeline, ready to store: from its sound, or from its words
 * spread over `durationMs` when the sound cannot be read. Null when neither
 * works. Never throws. `audio` is used up (decoding takes it over), so pass a
 * copy of anything still to be sent.
 */
export async function makeTimeline(
  audio: ArrayBuffer,
  text: string,
  { script, durationMs }: { script?: LipsyncScript; durationMs?: number | null } = {},
): Promise<MadeTimeline | null> {
  try {
    return { lipsync: await timelineFromSound(audio, text, script), from: 'sound' };
  } catch {
    // the words alone, below
  }
  if (!durationMs || !(durationMs > 0)) return null;
  try {
    return { lipsync: encodeLipsync(lipsyncFromText(text, durationMs, script ? { script } : {})), from: 'text' };
  } catch {
    return null;
  }
}

/** `&speaker=…&lipsync=…` for an upload's query string, after the text or key. */
export function voiceQuery(speaker: Speaker, lipsync: LipsyncData | null): string {
  const who = `&speaker=${speaker ?? 'none'}`;
  return lipsync ? `${who}&lipsync=${encodeURIComponent(JSON.stringify(lipsync))}` : who;
}

/** What an upload or a change answers with, beside the recording's own fields. */
export interface SavedVoice {
  speaker: Speaker;
  lipsync: LipsyncData | null;
}

/** Refusals of the timeline alone, or of an address grown too long with it: the recording goes up again without it. */
const TIMELINE_REFUSED: ReadonlySet<string> = new Set(['INVALID_LIPSYNC', 'LIPSYNC_TOO_LONG']);

/**
 * Upload a recording (a WAV from the recorder) to `path`, which already
 * carries its text or key in the query string, with who says it and the
 * timeline made from it.
 */
export async function uploadWithVoice<T>(
  path: string,
  wav: Uint8Array,
  voice: { speaker: Speaker; text: string; script?: LipsyncScript },
): Promise<T> {
  const made = await makeTimeline(wav.slice().buffer, voice.text, { script: voice.script, durationMs: wavDurationMs(wav) });
  const send = (lipsync: LipsyncData | null): Promise<T> => apiUpload<T>(`${path}${voiceQuery(voice.speaker, lipsync)}`, wav, 'audio/wav');
  if (!made) return send(null);
  try {
    return await send(made.lipsync);
  } catch (err) {
    if (err instanceof ApiError && (TIMELINE_REFUSED.has(err.code) || err.status === 414 || err.status === 431)) return send(null);
    throw err;
  }
}

/** Change who says a recording already saved, or its timeline (null takes either away). */
export function patchVoice(
  kind: AudioKind,
  key: string,
  change: { speaker?: Speaker; lipsync?: LipsyncData | null },
): Promise<SavedVoice> {
  return api<SavedVoice>(`/admin/audio/${kind}?key=${encodeURIComponent(key)}`, { method: 'PATCH', body: change });
}

/** The script of an alphabet sound, as the timeline reads it. */
export function scriptOfClip(script: 'kmr' | 'ckb'): LipsyncScript {
  return script === 'ckb' ? 'arabic' : 'latin';
}
