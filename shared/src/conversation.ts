/**
 * Conversations in lessons: two or three characters talking, then a question about what was said. Each part is one
 * character, or the learner's own part, whose lines are theirs to read and say and are never recorded.
 *
 * Each part is recorded by whoever plays it, so a line's recording is keyed by its conversation and part as well as its
 * words: "Silav!" from both people is two recordings, and a new take never replaces another conversation's line. A plain
 * text's recording (`lessonAudioKey`) is shared by every exercise; a line's belongs to its conversation. Shared by the API,
 * the admin and both players.
 */
import { LESSON_AUDIO_TEXT_MAX, lessonAudioKey } from './lesson-audio.js';
import { CHARACTER_NAMES } from './characters/types.js';
import { SPEAKERS, isSpeakerId, type RecordingVoice, type SpeakerId } from './lipsync/speakers.js';
import { isReactionKey } from './reactions.js';
import { isRecord } from './sanitize.js';

export const CONVERSATION_LIMITS = {
  speakersMin: 2,
  /** each part is a different character */
  speakersMax: SPEAKERS.length,
  nameMax: 40,
  titleMax: 120,
  linesMin: 2,
  linesMax: 20,
  /** a line is one recording, so the same bound as a recording's text */
  lineMax: LESSON_AUDIO_TEXT_MAX,
  translationMax: 300,
  promptMax: 500,
  optionsMin: 2,
  optionsMax: 6,
  optionMax: 200,
} as const;

/**
 * A conversation's id, which its recordings are filed under. Set once and copied into every later version of its lesson,
 * so fixing one line's spelling does not lose the other lines' recordings.
 */
export const CONVERSATION_ID = /^[a-z0-9]{6,32}$/;

/** One part: the character who says its lines, named by its own name; or the learner's part, which no character plays. */
export interface ConversationSpeaker {
  name: string;
  /** null only for the learner's own part */
  character: SpeakerId | null;
  /** the learner's own part: shown as theirs, never recorded */
  learner?: true;
}

/** The part a character plays, called by its name. */
export function conversationSpeaker(character: SpeakerId): ConversationSpeaker {
  return { name: CHARACTER_NAMES[character], character };
}

/** The learner's own part, named "you" in Kurmancî here; each app shows it in the learner's language. */
export function learnerPart(): ConversationSpeaker {
  return { name: 'Tu', character: null, learner: true };
}

/** The characters on a conversation's stage in part order: every part but the learner's, whom they face. Null when a part has no character, or none does. */
export function stageCast(speakers: readonly { character?: unknown; learner?: unknown }[]): SpeakerId[] | null {
  const cast = speakers.filter((s) => s.learner !== true).map((s) => s.character);
  return cast.length > 0 && cast.every(isSpeakerId) ? cast : null;
}

/** Each line as the stage sees it: its speaker by stage place, and a learner's line by one past the last place, so the cast looks out at the learner. */
export function stageLines<L extends { speaker: number }>(speakers: readonly { learner?: unknown }[], lines: readonly L[]): L[] {
  const place = new Map<number, number>();
  speakers.forEach((s, part) => {
    if (s.learner !== true) place.set(part, place.size);
  });
  return lines.map((l) => ({ ...l, speaker: place.get(l.speaker) ?? place.size }));
}

export interface ConversationLine {
  /** who says it: an index into `speakers` */
  speaker: number;
  /** what they say, in Kurdish */
  text: string;
  /** what it means, for a learner who wants help */
  en?: string;
}

/** A conversation as written and stored; its question is asked and graded like a multiple-choice item. */
export interface ConversationPayload {
  id: string;
  title?: string;
  speakers: ConversationSpeaker[];
  lines: ConversationLine[];
  prompt: string;
  options: string[];
  correctIndex: number;
}

/** Joins the parts of a line's key: the word joiner, which `lessonAudioKey` always removes, so line keys never collide with plain ones. */
const JOIN = '⁠';

/**
 * The key a line's recording is filed under: the conversation, the part by place (so renaming a part keeps its
 * recordings) and the words keyed as any recording's. Empty when there is nothing to file.
 */
export function conversationLineKey(conversationId: string, part: number, text: string): string {
  const said = lessonAudioKey(text);
  if (said === '' || !CONVERSATION_ID.test(conversationId) || !Number.isInteger(part) || part < 0) return '';
  return `${conversationId}${JOIN}${part}${JOIN}${said}`;
}

/** Whether a recording's key is a conversation line's rather than a plain text's or a reaction's (reactions.ts). */
export function isConversationLineKey(key: string): boolean {
  return key.includes(JOIN) && !isReactionKey(key);
}

/** One line to record, as the studio and the delivery read it. */
export interface ConversationClip {
  /** the line's place in the conversation */
  index: number;
  /** who says it, by place */
  part: number;
  /** their name: the character's own */
  name: string;
  character: SpeakerId | null;
  text: string;
  key: string;
}

/**
 * Every recordable line of a stored conversation in order, with its key; a line the same part says twice is listed once.
 * Malformed payloads yield nothing rather than throwing, since this runs over stored content.
 */
export function conversationClips(payload: unknown): ConversationClip[] {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !Array.isArray(payload.lines)) return [];
  const speakers = Array.isArray(payload.speakers) ? payload.speakers : [];
  const out: ConversationClip[] = [];
  const seen = new Set<string>();
  payload.lines.forEach((line, index) => {
    if (!isRecord(line) || typeof line.text !== 'string' || typeof line.speaker !== 'number') return;
    const who = speakers[line.speaker];
    // The learner says their own lines, so there is nothing to record.
    if (!isRecord(who) || who.learner === true) return;
    const character = isSpeakerId(who.character) ? who.character : null;
    const name = character ? CHARACTER_NAMES[character] : typeof who.name === 'string' ? who.name : null;
    if (name === null) return;
    if (line.text.length > LESSON_AUDIO_TEXT_MAX) return;
    const key = conversationLineKey(payload.id as string, line.speaker, line.text);
    if (key === '' || seen.has(key)) return;
    seen.add(key);
    out.push({
      index,
      part: line.speaker,
      name,
      character,
      text: line.text,
      key,
    });
  });
  return out;
}

/**
 * Who a learner sees say a line and how their mouth moves: always the character playing its part, whatever voice the
 * recording was saved under, with the recording's own timeline when it has one. Null for a part without a character,
 * which older stored content may have.
 */
export function conversationLineVoice(
  speakers: readonly { character?: SpeakerId | null }[],
  line: { speaker: number },
  voice: RecordingVoice | null | undefined,
): RecordingVoice | null {
  const character = speakers[line.speaker]?.character;
  if (!isSpeakerId(character)) return null;
  return voice ? { ...voice, speaker: character } : { speaker: character };
}
