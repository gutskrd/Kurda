/**
 * Conversations in the audio studio, as data: what the API says of one
 * (GET /admin/lesson-audio/conversations/:id), the address of a part's page,
 * how far each part has got, which line comes next and what plays before it,
 * and the list of every conversation the lessons have. Kept apart from the
 * page so it can be tested without a browser.
 *
 * A conversation is recorded by several people, each in their own place and
 * at their own time: each opens the page on their own part (a link someone
 * sent them, `?part=`), hears the line before each of theirs, and says it.
 * The page asks the server again every few seconds, so the others' takes
 * appear as they are made.
 */
import { isSpeakerId, type ConversationPayload, type SpeakerId } from '@kurda/shared';
import type { ContentStatus } from './lessons';
import type { Item } from './lessonAudio';

export interface LineRecording {
  url: string;
  durationMs: number;
  updatedAt: string;
  speaker: SpeakerId | null;
  hasLipsync: boolean;
  /** who made this take: null when the account is gone */
  recordedBy: { id: string; username: string | null } | null;
}

export interface LineState {
  index: number;
  /** who says it, by place */
  part: number;
  /** what its recording is filed under; null for a line too malformed to file */
  key: string | null;
  recording: LineRecording | null;
}

/** GET /admin/lesson-audio/conversations/:id */
export interface ConversationRecording {
  lesson: {
    id: string;
    titleEn: string;
    titleKu: string;
    status: ContentStatus;
    version: number;
    skillId: string;
    position: number;
    exercisePosition: number;
  };
  conversation: ConversationPayload;
  lines: LineState[];
}

/** The page a conversation is recorded on, opened on one part when `part` is given. */
export function conversationHref(id: string, lessonId?: string | null, part?: number | null): string {
  const query = new URLSearchParams();
  if (lessonId) query.set('lesson', lessonId);
  if (part !== null && part !== undefined) query.set('part', String(part));
  const q = query.toString();
  return `#/audio/conversations/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
}

/** The whole address of a part's page, to send to whoever records it. */
export function shareLink(id: string, lessonId: string, part: number, base: string): string {
  return `${base.replace(/#.*$/, '')}${conversationHref(id, lessonId, part)}`;
}

export interface PartProgress {
  part: number;
  name: string;
  character: SpeakerId | null;
  /** lines of theirs with a recording, and lines of theirs */
  recorded: number;
  total: number;
  /** who has recorded this part so far, by username, most takes first */
  by: string[];
}

/** How far each part has got: a line its part says twice is one recording, and counts once. */
export function partProgress(rec: ConversationRecording): PartProgress[] {
  return rec.conversation.speakers.map((speaker, part) => {
    const mine = new Map<string, LineState>();
    for (const line of rec.lines) if (line.part === part && line.key && !mine.has(line.key)) mine.set(line.key, line);
    const takes = new Map<string, number>();
    for (const line of mine.values()) {
      const who = line.recording?.recordedBy?.username;
      if (who) takes.set(who, (takes.get(who) ?? 0) + 1);
    }
    return {
      part,
      name: speaker.name,
      character: isSpeakerId(speaker.character) ? speaker.character : null,
      recorded: [...mine.values()].filter((l) => l.recording).length,
      total: mine.size,
      by: [...takes.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    };
  });
}

/** The next line `part` still has to record after line `after`, wrapping round; null when all of theirs are done. */
export function nextLineFor(rec: ConversationRecording, part: number, after: number | null): number | null {
  const n = rec.lines.length;
  const start = after === null ? -1 : after;
  for (let step = 1; step <= n; step++) {
    const line = rec.lines[(start + step + n) % n]!;
    if (line.part === part && line.key && !line.recording) return line.index;
  }
  return null;
}

/** The line said just before line `index`, when there is one: what is heard before saying the reply. */
export function lineBefore(rec: ConversationRecording, index: number): LineState | null {
  return index > 0 ? (rec.lines[index - 1] ?? null) : null;
}

/** The recorded lines in order, for playing the conversation through. */
export function playOrder(rec: ConversationRecording): Array<{ index: number; url: string }> {
  return rec.lines.flatMap((l) => (l.recording ? [{ index: l.index, url: l.recording.url }] : []));
}

/** The part to open on: the address's, else the one this browser recorded last for this conversation, else the first. */
export function initialPart(rec: ConversationRecording, fromAddress: string | null, remembered: string | null): number {
  for (const raw of [fromAddress, remembered]) {
    const n = raw === null || raw === '' ? NaN : Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < rec.conversation.speakers.length) return n;
  }
  return 0;
}

export interface ConversationSummary {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonStatus: ContentStatus;
  live: boolean;
  where: string;
  parts: Array<{ part: number; name: string; character: SpeakerId | null; recorded: number; total: number }>;
  recorded: number;
  total: number;
}

/**
 * Every conversation the lessons have, from the studio's list of what to
 * record (GET /admin/lesson-audio): its lines are the items with a `line`.
 * In the order the list has them (course order), each with how far each part
 * has got.
 */
export function conversationsIn(items: readonly Item[]): ConversationSummary[] {
  const found = new Map<string, ConversationSummary>();
  for (const item of items) {
    const line = item.line;
    const use = item.usedIn[0];
    if (!line || !use) continue;
    let c = found.get(line.conversation);
    if (!c) {
      c = {
        id: line.conversation,
        lessonId: use.lessonId,
        lessonTitle: use.lessonTitle,
        lessonStatus: use.lessonStatus,
        live: use.live,
        where: [use.courseTitle, use.unitTitle, use.skillTitle].filter(Boolean).join(' › '),
        parts: [],
        recorded: 0,
        total: 0,
      };
      found.set(line.conversation, c);
    }
    let part = c.parts.find((p) => p.part === line.part);
    if (!part) {
      part = { part: line.part, name: line.name, character: line.character, recorded: 0, total: 0 };
      c.parts.push(part);
      c.parts.sort((a, b) => a.part - b.part);
    }
    part.total += 1;
    c.total += 1;
    if (item.recorded) {
      part.recorded += 1;
      c.recorded += 1;
    }
  }
  return [...found.values()];
}

const PART_KEY = (id: string): string => `kurda_admin_conversation_part:${id}`;

/** The part this browser recorded last in a conversation: the person at it is most likely the same. */
export function rememberedPart(id: string): string | null {
  try {
    return localStorage.getItem(PART_KEY(id));
  } catch {
    return null;
  }
}

export function rememberPart(id: string, part: number): void {
  try {
    localStorage.setItem(PART_KEY(id), String(part));
  } catch {
    // a blocked storage only means the part is not remembered
  }
}
