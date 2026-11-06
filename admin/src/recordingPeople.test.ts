import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  counts,
  matchesFilters,
  neighbour,
  nextTodo,
  resumeAt,
  scriptCsv,
  scriptMarkdown,
  sectionsOf,
  tallyOf,
  uploadPath,
  uploadVoice,
  withTake,
  type Line,
} from './recordingPeople';

function line(over: Partial<Line> & Pick<Line, 'id' | 'text'>): Line {
  return {
    seq: 0,
    store: 'lesson',
    key: over.text.toLowerCase(),
    dialect: 'kmr',
    voice: 'hamo',
    speaker: 'hamo',
    meaning: null,
    hint: null,
    cue: null,
    conversation: null,
    before: null,
    section: { id: 'kurmanji-road:1', label: 'Unit 1 · Hello' },
    places: [{ kind: 'lesson', label: 'Unit 1 · Lesson 1 · exercise 1 (translate)', status: 'draft', voice: 'hamo', ref: null }],
    live: false,
    take: null,
    ...over,
  };
}

const TAKE = { url: 'https://cdn.test/a.wav', durationMs: 900, updatedAt: '2026-10-01T10:00:00.000Z', speaker: 'hamo' as const, by: 'dilan' };

const LINES: Line[] = [
  line({ id: 'a', seq: 0, text: 'Silav!', take: TAKE, live: true }),
  line({ id: 'b', seq: 1, text: 'Ez baş im.' }),
  line({ id: 'c', seq: 2, text: 'Tu çawa yî?', live: true }),
  line({ id: 'd', seq: 3, text: 'Sêv', section: { id: 'kurmanji-road:2', label: 'Unit 2 · Family' }, take: TAKE }),
];

describe('one person’s lines', () => {
  it('filters by what is recorded, where it is said and whether it is published yet', () => {
    expect(LINES.filter((l) => matchesFilters(l, DEFAULT_FILTERS)).map((l) => l.id)).toEqual(['b', 'c']);
    expect(LINES.filter((l) => matchesFilters(l, { ...DEFAULT_FILTERS, status: 'done' })).map((l) => l.id)).toEqual(['a', 'd']);
    expect(LINES.filter((l) => matchesFilters(l, { status: 'all', section: 'kurmanji-road:2', source: 'all' })).map((l) => l.id)).toEqual(['d']);
    expect(LINES.filter((l) => matchesFilters(l, { status: 'all', section: null, source: 'published' })).map((l) => l.id)).toEqual(['a', 'c']);
    expect(LINES.filter((l) => matchesFilters(l, { status: 'all', section: null, source: 'draft' })).map((l) => l.id)).toEqual(['b', 'd']);
    // the counts beside the status tabs follow the other filters
    expect(counts(LINES, { ...DEFAULT_FILTERS, source: 'published' })).toEqual({ all: 2, done: 1, todo: 1 });
    expect(tallyOf(LINES)).toEqual({ total: 4, done: 2, todo: 2 });
    expect(sectionsOf(LINES).map((s) => [s.id, s.todo])).toEqual([
      ['kurmanji-road:1', 2],
      ['kurmanji-road:2', 0],
    ]);
  });

  it('moves on to the next line still to record once a take is kept, wrapping round', () => {
    expect(nextTodo(LINES, 'b')?.id).toBe('c');
    expect(nextTodo(LINES, 'c')?.id).toBe('b');
    expect(nextTodo(LINES.map((l) => ({ ...l, take: TAKE })), 'b')).toBeNull();
    expect(neighbour(LINES, 'a', -1)?.id).toBe('a');
    expect(neighbour(LINES, 'a', 1)?.id).toBe('b');
  });

  it('picks up where the person left off, or at the next line still to record', () => {
    expect(resumeAt(LINES, 'c')?.id).toBe('c');
    // that one was recorded since (by them, or someone else): the next still to record after it
    expect(resumeAt(LINES, 'a')?.id).toBe('b');
    expect(resumeAt(LINES, 'gone')?.id).toBe('b');
    expect(resumeAt(LINES, null)?.id).toBe('b');
    expect(resumeAt(LINES.map((l) => ({ ...l, take: TAKE })), null)?.id).toBe('a');
    expect(resumeAt([], null)).toBeNull();
  });

  it('sends a take where the studio files the line, with the person’s speaker and the studio’s timing', () => {
    expect(uploadPath(line({ id: 'x', text: 'Ez baş im.' }))).toBe('/admin/lesson-audio?text=Ez%20ba%C5%9F%20im.');
    const said = line({ id: 'y', text: 'Sêv…', conversation: { id: 'roadu01s1l3a', part: 1, title: null, name: 'Hevalo' } });
    expect(uploadPath(said)).toBe('/admin/lesson-audio?text=S%C3%AAv%E2%80%A6&line=roadu01s1l3a%3A1');
    const letter = line({ id: 'z', store: 'alphabet', key: 'ckb:sound:ḧe', text: 'حا', dialect: 'ckb', voice: 'narrator-ckb', speaker: null });
    expect(uploadPath(letter)).toBe(`/admin/alphabet/audio?key=${encodeURIComponent('ckb:sound:ḧe')}`);
    expect(uploadVoice(said, { kind: 'character' })).toEqual({ speaker: 'hamo', text: 'Sêv…' });
    // a narrator's take leaves whoever is drawn for it as it was
    expect(uploadVoice(letter, { kind: 'narrator' })).toEqual({ speaker: undefined, text: 'حا', script: 'arabic' });
    expect(uploadVoice(line({ id: 'w', text: 'Were!', speaker: null }), { kind: 'cast' })).toEqual({ speaker: null, text: 'Were!' });
  });

  it('marks a kept take as this account’s, with what the server stored', () => {
    const after = withTake(LINES, 'b', { url: 'https://cdn.test/b.wav', durationMs: 1200 }, 'rojda', new Date('2026-11-05T12:00:00Z'));
    expect(after.find((l) => l.id === 'b')!.take).toEqual({ url: 'https://cdn.test/b.wav', durationMs: 1200, updatedAt: '2026-11-05T12:00:00.000Z', speaker: null, by: 'rojda' });
    expect(after.find((l) => l.id === 'c')!.take).toBeNull();
  });
});

describe('a person’s script to rehearse from', () => {
  const lines = [
    line({ id: 'a', text: 'Silav! Bi xêr hatî!', meaning: 'Hello! Welcome!', take: TAKE }),
    line({
      id: 'b',
      text: 'Sêv, "sor" in.',
      meaning: 'Apples, red ones.',
      before: { name: 'Hevalo', text: 'Sêv…', meaning: 'Apples…' },
      places: [
        { kind: 'conversation', label: 'Unit 1 · Lesson 3 · conversation ‘Bi xêr hatî!’, line 4', status: 'published', voice: 'hamo', ref: null },
        { kind: 'game', label: 'What Would You Say? · ‘At the gate’ · the line heard', status: 'draft', voice: 'hamo', ref: null },
      ],
      live: true,
    }),
  ];

  it('reads in course order with each line’s meaning, the line before it and where it is said', () => {
    const md = scriptMarkdown({ name: 'Hamo' }, lines, new Date('2026-11-05T12:00:00Z'));
    expect(md).toContain('# Hamo: lines to record');
    expect(md).toContain('2 lines, 1 still to record. Made 2026-11-05.');
    expect(md).toContain('## Unit 1 · Hello');
    expect(md).toContain('1. [recorded] **Silav! Bi xêr hatî!**\n   - Means: Hello! Welcome!');
    expect(md).toContain('   - Before it: Hevalo: “Sêv…” (Apples…)');
    expect(md).toContain('   - Unit 1 · Lesson 3 · conversation ‘Bi xêr hatî!’, line 4\n');
    expect(md).toContain('   - What Would You Say? · ‘At the gate’ · the line heard — draft');
  });

  it('opens in a spreadsheet as one row a line, the Kurdish letters and the quotes intact', () => {
    const csv = scriptCsv(lines);
    expect(csv.startsWith('﻿number,recorded,kurdish,meaning,line before,heading,where,published,key\r\n')).toBe(true);
    const rows = csv.trim().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toContain('"Sêv, ""sor"" in."');
    expect(rows[2]).toContain(',Hevalo: Sêv…,');
    expect(rows[1]!.startsWith('1,yes,Silav! Bi xêr hatî!,Hello! Welcome!,')).toBe(true);
  });
});
