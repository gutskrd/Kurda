import { describe, expect, it } from 'vitest';
import {
  addPhrase,
  counts,
  describeUsage,
  displayOrder,
  group,
  matches,
  neededForListening,
  neighbour,
  nextMissing,
  progress,
  scriptOf,
  withRecording,
  withoutRecording,
  type Item,
  type Usage,
} from './lessonAudio';

function usage(over: Partial<Usage> = {}): Usage {
  return {
    courseId: 'c1',
    courseTitle: 'Kurmanji for Beginners',
    unitId: 'u1',
    unitTitle: 'Basics',
    skillId: 's1',
    skillTitle: 'Greetings',
    lessonPosition: 1,
    lessonId: 'l1',
    lessonTitle: 'Greetings 1',
    lessonStatus: 'published',
    lessonVersion: 1,
    live: true,
    exerciseTypes: ['translate'],
    listeningNeedsIt: false,
    ...over,
  };
}

function item(text: string, over: Partial<Item> = {}): Item {
  return {
    key: text.toLowerCase(),
    text,
    recorded: false,
    url: null,
    durationMs: null,
    updatedAt: null,
    usedIn: [usage()],
    unused: false,
    ...over,
  };
}

const recorded = { recorded: true, url: 'https://cdn.test/a.wav', durationMs: 900, updatedAt: '2026-10-01T10:00:00.000Z' };

describe('filters and progress', () => {
  const items = [
    item('Silav'),
    item('Spas', recorded),
    item('Erê', { ...recorded, usedIn: [usage({ lessonPosition: 2, lessonTitle: 'Greetings 2' })] }),
    item('Newroz pîroz be', { ...recorded, usedIn: [], unused: true }),
  ];

  it('counts only what lessons use toward "X of Y recorded"', () => {
    expect(progress(items)).toEqual({ recorded: 2, needed: 3 });
    expect(progress([])).toEqual({ recorded: 0, needed: 0 });
  });

  it('filters missing, recorded and unused apart', () => {
    expect(items.filter((i) => matches(i, 'missing')).map((i) => i.text)).toEqual(['Silav']);
    expect(items.filter((i) => matches(i, 'recorded')).map((i) => i.text)).toEqual(['Spas', 'Erê']);
    expect(items.filter((i) => matches(i, 'unused')).map((i) => i.text)).toEqual(['Newroz pîroz be']);
    expect(counts(items)).toEqual({ all: 4, missing: 1, recorded: 2, unused: 1 });
  });

  it('counts a phrase added here, not yet recorded, as missing and unused', () => {
    const added = item('Cejna we pîroz be', { usedIn: [], unused: true });
    expect(matches(added, 'missing')).toBe(true);
    expect(matches(added, 'unused')).toBe(true);
    expect(progress([added])).toEqual({ recorded: 0, needed: 0 });
  });
});

describe('scriptOf', () => {
  it('sets Soranî right to left, Kurmancî left to right', () => {
    expect(scriptOf('سوپاس')).toEqual({ lang: 'ckb', dir: 'rtl' });
    expect(scriptOf('چۆنی؟')).toEqual({ lang: 'ckb', dir: 'rtl' });
    expect(scriptOf('Spas')).toEqual({ lang: 'ku', dir: 'ltr' });
    expect(scriptOf('Şev baş')).toEqual({ lang: 'ku', dir: 'ltr' });
  });
});

describe('group', () => {
  it('files items course → unit → lesson, in the order they come, and the loose ones apart', () => {
    const items = [
      item('Silav'),
      item('Spas'),
      item('Ez', { usedIn: [usage({ unitId: 'u2', unitTitle: 'People', skillId: 's2', lessonTitle: 'Intro 1' })] }),
      item('Erê', { usedIn: [usage({ lessonPosition: 2, lessonTitle: 'Greetings 2', lessonStatus: 'draft', live: false })] }),
      item('Agir', { usedIn: [usage({ courseId: 'c2', courseTitle: 'Newroz', unitId: 'u9', skillId: 's9' })] }),
      item('Loose', { usedIn: [], unused: true }),
    ];
    const { courses, loose } = group(items);
    expect(courses.map((c) => c.title)).toEqual(['Kurmanji for Beginners', 'Newroz']);
    expect(courses[0]!.units.map((u) => u.title)).toEqual(['Basics', 'People']);
    expect(courses[0]!.units[0]!.lessons.map((l) => [l.title, l.items.map((i) => i.text)])).toEqual([
      ['Greetings 1', ['Silav', 'Spas']],
      ['Greetings 2', ['Erê']],
    ]);
    expect(courses[0]!.units[0]!.lessons[1]).toMatchObject({ status: 'draft', live: false });
    expect(loose.map((i) => i.text)).toEqual(['Loose']);
  });

  it('files a text several lessons use under the first, once', () => {
    const shared = item('Spas', { usedIn: [usage(), usage({ lessonPosition: 3, lessonTitle: 'Greetings 3' })] });
    const { courses } = group([shared]);
    expect(courses[0]!.units[0]!.lessons).toHaveLength(1);
    expect(courses[0]!.units[0]!.lessons[0]!.title).toBe('Greetings 1');
  });

  it('keeps a lesson’s draft and live versions together, by skill and place', () => {
    const { courses } = group([
      item('Silav', { usedIn: [usage({ lessonId: 'v2', lessonStatus: 'draft', live: true })] }),
      item('Nû', { usedIn: [usage({ lessonId: 'v2', lessonStatus: 'draft', live: false })] }),
      item('Kevn', { usedIn: [usage({ lessonId: 'v1' })] }),
    ]);
    expect(courses[0]!.units[0]!.lessons).toHaveLength(1);
    expect(courses[0]!.units[0]!.lessons[0]!.items.map((i) => i.text)).toEqual(['Silav', 'Nû', 'Kevn']);
    expect(courses[0]!.units[0]!.lessons[0]!.live).toBe(true);
  });
});

describe('working through what is missing', () => {
  const ordered = displayOrder([
    item('A', recorded),
    item('B'),
    item('C', recorded),
    item('D'),
    item('Loose', { usedIn: [], unused: true }),
  ]);

  it('goes to the next missing item, in page order, wrapping round', () => {
    expect(nextMissing(ordered, null)?.text).toBe('B');
    expect(nextMissing(ordered, 'b')?.text).toBe('D');
    expect(nextMissing(ordered, 'd')?.text).toBe('Loose');
    expect(nextMissing(ordered, 'loose')?.text).toBe('B');
    expect(nextMissing(ordered, 'gone')?.text).toBe('B');
  });

  it('says when everything is recorded', () => {
    expect(nextMissing([item('A', recorded), item('C', recorded)], 'a')).toBeNull();
    expect(nextMissing([], null)).toBeNull();
  });

  it('moves up and down the list, staying in bounds', () => {
    expect(neighbour(ordered, 'a', 1)?.text).toBe('B');
    expect(neighbour(ordered, 'a', -1)?.text).toBe('A');
    expect(neighbour(ordered, 'loose', 1)?.text).toBe('Loose');
    expect(neighbour(ordered, null, 1)?.text).toBe('A');
    expect(neighbour([], 'a', 1)).toBeNull();
  });
});

describe('addPhrase', () => {
  const items = [item('Spas'), item('سوپاس', { key: 'سوپاس' })];

  it('adds a phrase of the editor’s own, evened out', () => {
    const res = addPhrase(items, '  Newroz   pîroz be! ');
    expect(res).toMatchObject({ ok: true, key: 'newroz pîroz be', existed: false });
    if (res.ok) {
      expect(res.items).toHaveLength(3);
      expect(res.items[2]).toMatchObject({ text: 'Newroz pîroz be!', recorded: false, usedIn: [], unused: true });
    }
  });

  it('points at the lesson’s own item when the phrase is already there, however it is typed', () => {
    expect(addPhrase(items, 'spas.')).toMatchObject({ ok: true, key: 'spas', existed: true });
    expect(addPhrase(items, 'سوپاس؟')).toMatchObject({ ok: true, key: 'سوپاس', existed: true });
  });

  it('refuses nothing, and too much', () => {
    expect(addPhrase(items, '  ?  ')).toEqual({ ok: false, problem: 'Type the Kurdish to record.' });
    expect(addPhrase(items, 'a'.repeat(301))).toMatchObject({ ok: false });
  });
});

describe('after saving and removing', () => {
  const saved = { key: 'silav', url: 'https://cdn.test/s.wav', durationMs: 1200, updatedAt: '2026-10-02T09:00:00.000Z' };

  it('marks the item recorded, with what the server stored', () => {
    const [next] = withRecording([item('Silav')], saved);
    expect(next).toMatchObject({ recorded: true, url: saved.url, durationMs: 1200, updatedAt: saved.updatedAt, unused: false });
  });

  it('keeps a lesson’s text in the list as missing, and lets a loose one go', () => {
    const items = [item('Silav', recorded), item('Loose', { ...recorded, usedIn: [], unused: true })];
    expect(withoutRecording(items, 'silav')[0]).toMatchObject({ text: 'Silav', recorded: false, url: null, durationMs: null });
    expect(withoutRecording(items, 'loose').map((i) => i.text)).toEqual(['Silav']);
  });
});

describe('usage', () => {
  it('describes where a text is used', () => {
    expect(describeUsage(usage({ exerciseTypes: ['multiple_choice', 'match_pairs'] }))).toBe('Greetings 1 (multiple choice, match pairs)');
  });

  it('knows which texts a listening item cannot do without', () => {
    expect(neededForListening(item('Sêv', { usedIn: [usage({ exerciseTypes: ['listening'], listeningNeedsIt: true })] }))).toBe(true);
    // a listening item with a clip of its own plays that meanwhile
    expect(neededForListening(item('Sêv', { usedIn: [usage({ exerciseTypes: ['listening'] })] }))).toBe(false);
    expect(neededForListening(item('Sêv'))).toBe(false);
  });
});
