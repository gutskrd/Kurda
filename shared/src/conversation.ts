/**
 * Conversations in lessons: two to four people talking, line by line, and then
 * a question about what was said.
 *
 * Each part is recorded by whoever plays it, wherever they are, so a line's
 * recording is filed under its conversation and its part as well as its words:
 * "Silav!" said by both people in one conversation is two recordings, not one,
 * and a new take in one conversation never replaces a line in another. A plain
 * text's recording (`lessonAudioKey`) is shared by every exercise that says
 * it; a line's is the conversation's own.
 *
 * One copy of the shape, the keys and the limits for the API that stores and
 * delivers conversations, the admin panel that writes and records them, and
 * the two players that show them.
 */
import { LESSON_AUDIO_TEXT_MAX, lessonAudioKey } from './lesson-audio.js';
import { isSpeakerId, type RecordingVoice, type SpeakerId } from './lipsync/speakers.js';

export const CONVERSATION_LIMITS = {
  speakersMin: 2,
  speakersMax: 4,
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
 * A conversation's id, what its recordings are filed under. Written once when
 * the conversation is made and kept by every later version of its lesson (a
 * new version copies the payload), so publishing a fix to a line's spelling
 * does not lose the other lines' recordings.
 */
export const CONVERSATION_ID = /^[a-z0-9]{6,32}$/;

export interface ConversationSpeaker {
  name: string;
  /** the character shown saying this part's lines, when one is chosen */
  character?: SpeakerId;
}

export interface ConversationLine {
  /** who says it: an index into `speakers` */
  speaker: number;
  /** what they say, in Kurdish */
  text: string;
  /** what it means, for a learner who wants the help */
  en?: string;
}

/** A conversation as it is written and stored. The question is asked and graded as a multiple-choice item's is. */
export interface ConversationPayload {
  id: string;
  title?: string;
  speakers: ConversationSpeaker[];
  lines: ConversationLine[];
  prompt: string;
  options: string[];
  correctIndex: number;
}

/**
 * Between the parts of a line's key: the word joiner, which `lessonAudioKey`
 * always removes, so no plain text's key can contain it and the two kinds of
 * key can never collide.
 */
const JOIN = '⁠';

/**
 * The key the recording of one line is filed under: the conversation, the part
 * (who says it, by place, so renaming a part keeps its recordings) and the
 * words, keyed as any recording's are. Empty when there is nothing to file.
 */
export function conversationLineKey(conversationId: string, part: number, text: string): string {
  const said = lessonAudioKey(text);
  if (said === '' || !CONVERSATION_ID.test(conversationId) || !Number.isInteger(part) || part < 0) return '';
  return `${conversationId}${JOIN}${part}${JOIN}${said}`;
}

/** Whether a recording's key is a conversation line's rather than a plain text's. */
export function isConversationLineKey(key: string): boolean {
  return key.includes(JOIN);
}

/** One line to record, as the studio and the delivery read it. */
export interface ConversationClip {
  /** the line's place in the conversation */
  index: number;
  /** who says it, by place */
  part: number;
  /** their name, as the conversation writes it */
  name: string;
  character: SpeakerId | null;
  text: string;
  key: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Every line of a stored conversation that can be recorded, in order, with its
 * key. A line said twice by the same part is listed once, at its first place.
 * Anything malformed yields nothing rather than throwing: this runs over
 * stored content.
 */
export function conversationClips(payload: unknown): ConversationClip[] {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !Array.isArray(payload.lines)) return [];
  const speakers = Array.isArray(payload.speakers) ? payload.speakers : [];
  const out: ConversationClip[] = [];
  const seen = new Set<string>();
  payload.lines.forEach((line, index) => {
    if (!isRecord(line) || typeof line.text !== 'string' || typeof line.speaker !== 'number') return;
    const who = speakers[line.speaker];
    if (!isRecord(who) || typeof who.name !== 'string') return;
    if (line.text.length > LESSON_AUDIO_TEXT_MAX) return;
    const key = conversationLineKey(payload.id as string, line.speaker, line.text);
    if (key === '' || seen.has(key)) return;
    seen.add(key);
    out.push({
      index,
      part: line.speaker,
      name: who.name,
      character: isSpeakerId(who.character) ? who.character : null,
      text: line.text,
      key,
    });
  });
  return out;
}

/**
 * Each line's recording for a learner, by the line's place: the URL, or null
 * for a line not recorded yet (which is shown, and read, without sound).
 */
export interface ConversationAudio {
  lineAudio: Array<string | null>;
  /** who says each recording, and how their mouth moves; null where there is none */
  lineVoices: Array<RecordingVoice | null>;
}
