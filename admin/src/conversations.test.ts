import { describe, expect, it } from 'vitest';
import {
  conversationHref,
  conversationsIn,
  initialPart,
  lineBefore,
  nextLineFor,
  partProgress,
  playOrder,
  shareLink,
  type ConversationRecording,
  type LineRecording,
} from './conversations';
import type { Item, Usage } from './lessonAudio';

const take = (by: string, url = `https://cdn.test/${by}.wav`): LineRecording => ({
  url,
  durationMs: 1400,
  updatedAt: '2026-10-22T10:00:00.000Z',
  speaker: null,
  hasLipsync: false,
  recordedBy: { id: `u-${by}`, username: by },
});

const REC: ConversationRecording = {
  lesson: { id: 'l1', titleEn: 'Meeting someone', titleKu: 'Em hevdu nas dikin', status: 'draft', version: 1, skillId: 's1', position: 3, exercisePosition: 3 },
  conversation: {
    id: 'kmrnasin01',
    title: 'Li parkê',
    speakers: [
      { name: 'Xezo', character: 'xezo' },
      { name: 'Hamo', character: 'hamo' },
    ],
    lines: [
      { speaker: 0, text: 'Silav! Navê min Xezo ye.', en: 'Hello! My name is Xezo.' },
      { speaker: 1, text: 'Silav Xezo! Navê min Hamo ye.', en: 'Hi Xezo! My name is Hamo.' },
      { speaker: 0, text: 'Tu çawa yî, Hamo?' },
      { speaker: 1, text: 'Ez baş im, spas.' },
    ],
    prompt: 'Hamo çawa ye?',
    options: ['Baş e', 'Nexweş e'],
    correctIndex: 0,
  },
  lines: [
    { index: 0, part: 0, key: 'k0', recording: take('xezo') },
    { index: 1, part: 1, key: 'k1', recording: null },
    { index: 2, part: 0, key: 'k2', recording: null },
    { index: 3, part: 1, key: 'k3', recording: null },
  ],
};

describe('a conversation being recorded', () => {
  it('says how far each part has got, and by whom', () => {
    expect(partProgress(REC)).toEqual([
      { part: 0, name: 'Xezo', character: 'xezo', recorded: 1, total: 2, by: ['xezo'] },
      { part: 1, name: 'Hamo', character: 'hamo', recorded: 0, total: 2, by: [] },
    ]);
  });

  it('moves a part on to its next line still to record, round to the start, and stops when all are done', () => {
    expect(nextLineFor(REC, 1, null)).toBe(1);
    expect(nextLineFor(REC, 1, 1)).toBe(3);
    expect(nextLineFor(REC, 1, 3)).toBe(1);
    expect(nextLineFor(REC, 0, null)).toBe(2);
    const done = { ...REC, lines: REC.lines.map((l) => ({ ...l, recording: take('x') })) };
    expect(nextLineFor(done, 0, null)).toBeNull();
  });

  it('plays the line before a reply, and the recorded lines in order', () => {
    expect(lineBefore(REC, 1)?.index).toBe(0);
    expect(lineBefore(REC, 0)).toBeNull();
    expect(playOrder(REC)).toEqual([{ index: 0, url: 'https://cdn.test/xezo.wav' }]);
  });

  it('opens on the part the address names, else the one this browser recorded, else the first', () => {
    expect(initialPart(REC, '1', '0')).toBe(1);
    expect(initialPart(REC, '7', '1')).toBe(1);
    expect(initialPart(REC, null, 'x')).toBe(0);
  });

  it('gives each part a link of its own, to send to whoever records it', () => {
    expect(conversationHref('kmrnasin01')).toBe('#/audio/conversations/kmrnasin01');
    expect(conversationHref('kmrnasin01', 'l1', 0)).toBe('#/audio/conversations/kmrnasin01?lesson=l1&part=0');
    expect(shareLink('kmrnasin01', 'l1', 1, 'https://admin.hevalo.app/#/lessons/l1')).toBe('https://admin.hevalo.app/#/audio/conversations/kmrnasin01?lesson=l1&part=1');
  });
});

describe('the conversations in the lessons', () => {
  const use: Usage = {
    courseId: 'c1',
    courseTitle: 'Kurmanji for Beginners',
    unitId: 'u1',
    unitTitle: 'Basics',
    skillId: 's1',
    skillTitle: 'Introductions',
    lessonPosition: 3,
    lessonId: 'l1',
    lessonTitle: 'Meeting someone',
    lessonStatus: 'draft',
    lessonVersion: 1,
    live: false,
    exerciseTypes: ['conversation'],
    listeningNeedsIt: false,
  };
  const item = (text: string, part: number, name: string, recorded: boolean): Item => ({
    key: `${part}:${text}`,
    text,
    recorded,
    url: recorded ? 'https://cdn.test/x.wav' : null,
    durationMs: null,
    updatedAt: null,
    usedIn: [use],
    unused: false,
    line: { conversation: 'kmrnasin01', part, name, character: null },
  });

  it('are gathered from the studio’s list, a meter a part', () => {
    const plain: Item = { ...item('Silav', 0, 'x', true), line: undefined, key: 'silav' };
    const found = conversationsIn([item('Silav!', 0, 'Xezo', true), plain, item('Silav!', 1, 'Hamo', false), item('Ez baş im.', 1, 'Hamo', true)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: 'kmrnasin01',
      lessonId: 'l1',
      lessonTitle: 'Meeting someone',
      where: 'Kurmanji for Beginners › Basics › Introductions',
      recorded: 2,
      total: 3,
      parts: [
        { part: 0, name: 'Xezo', recorded: 1, total: 1 },
        { part: 1, name: 'Hamo', recorded: 1, total: 2 },
      ],
    });
  });
});
