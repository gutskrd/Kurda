import { describe, expect, it } from 'vitest';
import { blankPayload, exerciseIssues, forSave, issuesFor, parseExercisesJson, recordHref, sameDraft, type Exercise } from './lessons';

const ex = (type: Exercise['type'], payload: Record<string, unknown>): Exercise => ({ position: 1, type, payload });

describe('an exercise’s checks — the server’s limits, in words', () => {
  it('asks for what each kind needs', () => {
    expect(exerciseIssues(ex('translate', blankPayload('translate')))).toEqual([
      { path: 'prompt', message: 'The sentence to translate is needed.' },
      { path: 'accepted', message: 'Add at least one accepted answer.' },
      { path: 'accepted.0', message: 'This accepted answer is empty: fill it in or remove it.' },
    ]);
    expect(exerciseIssues(ex('translate', { prompt: 'Hello', accepted: ['Silav'] }))).toEqual([]);
    expect(exerciseIssues(ex('speaking', { prompt: 'Say it', reference: '' })).map((i) => i.path)).toEqual(['reference']);
    // a listening item needs no prompt, only what it plays
    expect(exerciseIssues(ex('listening', { accepted: ['Ez baş im'] }))).toEqual([]);
  });

  it('checks a multiple-choice item’s answers and which one is right', () => {
    expect(exerciseIssues(ex('multiple_choice', { prompt: 'Silav means?', options: ['Hello'], correctIndex: 0 })).map((i) => i.path)).toEqual(['options']);
    expect(exerciseIssues(ex('multiple_choice', { prompt: 'Silav means?', options: ['Hello', 'Bye'], correctIndex: 2 })).map((i) => i.path)).toEqual([
      'correctIndex',
    ]);
    expect(exerciseIssues(ex('multiple_choice', { prompt: 'q', options: Array(7).fill('x'), correctIndex: 0 })).map((i) => i.message)).toContain('At most 6 answers.');
  });

  it('checks every pair, both sides', () => {
    const issues = exerciseIssues(ex('match_pairs', { pairs: [{ left: 'ez', right: 'I' }, { left: '', right: 'you' }] }));
    expect(issues).toEqual([{ path: 'pairs.1.left', message: 'Pair 2: the left side is empty.' }]);
    expect(exerciseIssues(ex('match_pairs', { pairs: [{ left: 'ez', right: 'I' }] })).map((i) => i.path)).toEqual(['pairs']);
  });

  it('keeps a new kind’s prompt and “say” when the kind is changed', () => {
    expect(blankPayload('multiple_choice', { prompt: 'Silav?', say: 'Silav', accepted: ['x'] })).toEqual({
      say: 'Silav',
      prompt: 'Silav?',
      options: ['', ''],
      correctIndex: 0,
    });
  });
});

describe('what is sent', () => {
  it('numbers the exercises in screen order, trims text, and leaves out empty optional fields', () => {
    const sent = forSave([
      ex('listening', { prompt: '  ', accepted: [' Ez baş im '], audioUrl: '', say: '', strict: false }),
      ex('translate', { prompt: ' Hello ', accepted: ['Silav'], strict: true, say: ' Silav ' }),
      ex('match_pairs', { pairs: [{ left: ' ez ', right: 'I ' }] }),
    ]);
    expect(sent).toEqual([
      { position: 1, type: 'listening', payload: { accepted: ['Ez baş im'] } },
      { position: 2, type: 'translate', payload: { prompt: 'Hello', accepted: ['Silav'], strict: true, say: 'Silav' } },
      { position: 3, type: 'match_pairs', payload: { pairs: [{ left: 'ez', right: 'I' }] } },
    ]);
  });

  it('tells a real change from whitespace', () => {
    const a = { titleKu: 'Silav', titleEn: 'Hello', exercises: [ex('translate', { prompt: 'Hi', accepted: ['Silav'] })] };
    expect(sameDraft(a, { ...a, titleEn: 'Hello ' })).toBe(true);
    expect(sameDraft(a, { ...a, exercises: [ex('translate', { prompt: 'Hi!', accepted: ['Silav'] })] })).toBe(false);
  });

  it('files the server’s issues under the exercise they are about', () => {
    const issues = [
      { path: 'exercises[0].prompt', message: 'Required' },
      { path: 'exercises[1].payload.options.1', message: 'Too short' },
      { path: 'exercises[10].prompt', message: 'Other' },
    ];
    expect(issuesFor(issues, 0)).toEqual([{ path: 'prompt', message: 'Required' }]);
    expect(issuesFor(issues, 1)).toEqual([{ path: 'options.1', message: 'Too short' }]);
    expect(issuesFor(issues, 1).some((i) => i.message === 'Other')).toBe(false);
  });

  it('reads the advanced JSON, and says what is wrong with it', () => {
    expect(parseExercisesJson('[{"type":"translate","payload":{"prompt":"Hi","accepted":["Silav"]}}]')).toEqual({
      ok: true,
      exercises: [{ position: 1, type: 'translate', payload: { prompt: 'Hi', accepted: ['Silav'] } }],
    });
    const bad = parseExercisesJson('[{"type":"essay","payload":{}}]');
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.problem).toContain('Exercise 1 has no known type');
    expect(parseExercisesJson('{').ok).toBe(false);
    expect(parseExercisesJson('{}').ok).toBe(false);
  });

  it('points “Record” at the lesson in the audio studio', () => {
    expect(recordHref({ skillId: 's-1', position: 3 })).toBe('#/audio/lessons?lesson=s-1%3A3');
    expect(recordHref({ skillId: 's-1', position: 3 }, true)).toBe('#/audio/lessons?lesson=s-1%3A3&show=missing');
  });
});

describe('a conversation in the editor', () => {
  const conversation = (over: Record<string, unknown> = {}): Exercise => ({
    position: 1,
    type: 'conversation',
    payload: {
      id: 'kmrnasin01',
      title: '',
      speakers: [
        { name: 'Xezo', character: 'xezo' },
        { name: 'Hamo', character: 'hamo' },
      ],
      lines: [
        { speaker: 0, text: 'Silav!', en: 'Hello!' },
        { speaker: 1, text: ' Silav Xezo. ', en: '' },
      ],
      prompt: 'Kî silavê dide?',
      options: ['Xezo', 'Hamo'],
      correctIndex: 0,
      ...over,
    },
  });

  it('starts as Xezo and Hamo with a line each, under an id of its own', () => {
    const p = blankPayload('conversation');
    expect(p.id).toMatch(/^[a-z0-9]{6,32}$/);
    expect(blankPayload('conversation').id).not.toBe(p.id);
    expect(p.speakers).toEqual([
      { name: 'Xezo', character: 'xezo' },
      { name: 'Hamo', character: 'hamo' },
    ]);
    expect(p.lines).toHaveLength(2);
  });

  it('is checked as the server checks it, in words', () => {
    expect(exerciseIssues(conversation())).toEqual([]);
    expect(exerciseIssues(conversation({ speakers: [{ character: 'hamo' }, { character: 'hamo' }] })).map((i) => i.message)).toContain(
      'Hamo already has a part: choose another character.',
    );
    expect(exerciseIssues(conversation({ speakers: [{ name: 'Rojda' }, { character: 'hamo' }] })).map((i) => i.message)).toContain(
      'Person 1: choose who plays the part.',
    );
    expect(exerciseIssues(conversation({ lines: [{ speaker: 0, text: 'Silav' }, { speaker: 0, text: 'Spas' }] })).map((i) => i.message)).toContain(
      'Hamo says nothing: give them a line or remove them.',
    );
    expect(exerciseIssues(conversation({ lines: [{ speaker: 0, text: 'Silav' }, { speaker: 1, text: ' ?' }] })).map((i) => i.path)).toContain('lines.1.text');
  });

  it('is sent with each part called by its character, and without the parts left empty: no title, no meaning', () => {
    expect(forSave([conversation({ speakers: [{ name: 'Rojda', character: 'xezo' }, { character: 'hamo' }] })])[0]!.payload).toEqual({
      id: 'kmrnasin01',
      speakers: [
        { name: 'Xezo', character: 'xezo' },
        { name: 'Hamo', character: 'hamo' },
      ],
      lines: [
        { speaker: 0, text: 'Silav!', en: 'Hello!' },
        { speaker: 1, text: 'Silav Xezo.' },
      ],
      prompt: 'Kî silavê dide?',
      options: ['Xezo', 'Hamo'],
      correctIndex: 0,
    });
  });
});
