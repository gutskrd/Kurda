import { describe, expect, it } from 'vitest';
import { QUESTION_EXPLANATION_MAX, countStoryWords, validateStory } from '@kurda/shared';
import {
  autoSlug,
  availableActions,
  bankLabel,
  blankForm,
  blankQuestion,
  describePath,
  draftFromForm,
  editorReducer,
  fieldIdsFor,
  filterStories,
  formFromStory,
  glossLocalesLeft,
  glossPlaces,
  isDirty,
  isEditable,
  liveChecks,
  needsNativeReview,
  problemLabel,
  problemsAt,
  publishedCoverage,
  statusCounts,
  textFacts,
  type EditorAction,
  type StoryForm,
} from './stories';
import { BODY, storyFixture, summaryOf } from './test/stories';

const fixed = (): number => 0.5;

function edit(form: StoryForm, ...actions: EditorAction[]): StoryForm {
  return actions.reduce(editorReducer, form);
}

const codes = (list: ReadonlyArray<{ code: string; path: string }>): string[] => list.map((p) => `${p.code}@${p.path}`);

describe('the form and the request', () => {
  it('sends the story as stored, tidied the way the API tidies it', () => {
    const form = edit(
      formFromStory(storyFixture()),
      { type: 'text', field: 'title', value: '  Rêya Dibistanê  ' },
      { type: 'text', field: 'summary', value: '   ' },
      { type: 'text', field: 'body', value: `\r\n${BODY.replace(/\n/g, '\r\n')}\r\n` },
      { type: 'gloss/set', index: 0, field: 'en', value: ' kind ' },
      { type: 'gloss/extra-add', index: 0, locale: 'tr' },
      { type: 'q/text', index: 1, field: 'explanation', value: '  ' },
      { type: 'q/option', index: 0, option: 1, value: ' Neh salî ' },
    );
    const draft = draftFromForm(form);
    expect(draft.title).toBe('Rêya Dibistanê');
    expect(draft.summary).toBeNull();
    expect(draft.body).toBe(BODY);
    // an empty meaning is no meaning; English is always there
    expect(draft.glossary[0]).toEqual({ term: 'dilovan', meanings: { en: 'kind' } });
    expect(draft.glossary[1]).toEqual({ term: 'zeviyan', meanings: { de: 'Felder', en: 'fields' } });
    expect(draft.questions[1]!.explanation).toBeNull();
    expect(draft.questions[0]!.options).toEqual(['Deh salî', 'Neh salî', 'Heşt salî']);
    expect(draft.slug).toBe('reya-dibistane');
  });

  it('keeps an empty row, so a problem’s path is the row on screen', () => {
    const form = edit(formFromStory(storyFixture()), { type: 'gloss/add' }, { type: 'q/add' });
    const draft = draftFromForm(form);
    expect(draft.glossary).toHaveLength(3);
    expect(draft.questions).toHaveLength(7);
    expect(codes(liveChecks(form).blocking)).toEqual(
      expect.arrayContaining(['GLOSS_TERM_EMPTY@glossary[2].term', 'PROMPT_EMPTY@questions[6].prompt', 'CORRECT_INDEX@questions[6].correctIndex']),
    );
  });

  it('reads a stored story back into the same draft it came from', () => {
    const story = storyFixture();
    const draft = draftFromForm(formFromStory(story));
    expect(draft.questions).toEqual(story.questions.map(({ id: _id, ...q }) => q));
    expect(draft.glossary).toEqual(story.glossary);
  });

  it('counts only real changes as unsaved', () => {
    const loaded = formFromStory(storyFixture());
    expect(isDirty(edit(loaded, { type: 'text', field: 'title', value: 'Rêya Dibistanê ' }), loaded)).toBe(false);
    expect(isDirty(edit(loaded, { type: 'text', field: 'title', value: 'Rêya Malê' }), loaded)).toBe(true);
    expect(isDirty(edit(loaded, { type: 'q/correct', index: 0, option: 2 }), loaded)).toBe(true);
  });

  it('keeps the rows’ keys across a save, so what was open stays open', () => {
    const before = edit(formFromStory(storyFixture()), { type: 'q/add' });
    const saved = storyFixture({ questions: [...storyFixture().questions, { ...storyFixture().questions[0]!, id: 'q7' }] });
    const after = formFromStory(saved, { previous: before });
    expect(after.questions.map((q) => q.key)).toEqual(before.questions.map((q) => q.key));
  });
});

describe('the slug', () => {
  it('follows a Kurmancî title, spelled the way an address can hold it', () => {
    const form = edit(blankForm('kurmanci', fixed), { type: 'text', field: 'title', value: 'Qelema Şîn' });
    expect(form.slug).toBe('qelema-sin');
    expect(liveChecks(form).blocking.filter((p) => p.path === 'slug')).toEqual([]);
  });

  it('stops following once the editor writes their own, and follows again when it is emptied', () => {
    let form = edit(blankForm('kurmanci', fixed), { type: 'text', field: 'title', value: 'Qelema Şîn' });
    form = edit(form, { type: 'slug', value: 'Qelema Sin Ya Min' }, { type: 'text', field: 'title', value: 'Pênûsa Şîn' });
    expect(form.slug).toBe('qelema-sin-ya-min');
    form = edit(form, { type: 'slug', value: '' });
    expect(form.slug).toBe('penusa-sin');
  });

  it('gives a Soranî story random letters to replace, the same ones while its title is typed', () => {
    const form = blankForm('sorani', fixed);
    expect(form.slug).toMatch(/^sorani-[a-z0-9]{6}$/);
    const typed = edit(form, { type: 'text', field: 'title', value: 'کلیلی ماڵەوە' });
    expect(typed.slug).toBe(form.slug);
    expect(autoSlug(typed)).toBe(form.slug);
    // a warning, not a refusal: it is a working address, just not a readable one
    const checks = liveChecks(typed);
    expect(codes(checks.warnings)).toContain('SLUG_RANDOM@slug');
    expect(checks.blocking.filter((p) => p.path === 'slug')).toEqual([]);
    expect(codes(liveChecks(edit(typed, { type: 'slug', value: 'sorani-house-key' })).warnings)).not.toContain('SLUG_RANDOM@slug');
  });

  it('refuses what the stories table would refuse, before the request', () => {
    for (const slug of ['ab', 'qelema_sin', 'qelema-şîn', 'x'.repeat(81)]) {
      const form = edit(formFromStory(storyFixture()), { type: 'slug', value: slug });
      expect(codes(liveChecks(form).blocking)).toContain('SLUG@slug');
    }
  });

  it('warns that a published story’s old links break when its address changes', () => {
    const story = storyFixture({ publishedAt: '2026-10-05T10:00:00.000Z' });
    const form = edit(formFromStory(story), { type: 'slug', value: 'reya-dibistana-nu' });
    expect(codes(liveChecks(form, { publishedBefore: true, savedSlug: story.slug }).warnings)).toContain('SLUG_CHANGED@slug');
    expect(codes(liveChecks(form, { publishedBefore: false, savedSlug: story.slug }).warnings)).not.toContain('SLUG_CHANGED@slug');
  });
});

describe('editing questions', () => {
  const form = formFromStory(storyFixture());

  it('removing an option moves the right answer with it, and removing the right one clears it', () => {
    // right answer is option 2 of 3 (index 1)
    const q = (f: StoryForm) => f.questions[1]!;
    expect(q(edit(form, { type: 'q/option-remove', index: 1, option: 0 }))).toMatchObject({
      options: ['Li ber çiyayekî', 'Li nav bajêr'],
      correctIndex: 0,
    });
    expect(q(edit(form, { type: 'q/option-remove', index: 1, option: 2 })).correctIndex).toBe(1);
    // never quietly makes another option right
    const cleared = edit(form, { type: 'q/option-remove', index: 1, option: 1 });
    expect(q(cleared).correctIndex).toBe(-1);
    expect(codes(liveChecks(cleared).blocking)).toContain('CORRECT_INDEX@questions[1].correctIndex');
  });

  it('keeps between two and four options', () => {
    const two = edit(form, { type: 'q/option-remove', index: 0, option: 2 });
    expect(edit(two, { type: 'q/option-remove', index: 0, option: 1 }).questions[0]!.options).toHaveLength(2);
    const four = edit(form, { type: 'q/option-add', index: 0 });
    expect(edit(four, { type: 'q/option-add', index: 0 }).questions[0]!.options).toHaveLength(4);
  });

  it('forgets the sentence when the evidence moves to another paragraph', () => {
    const moved = edit(form, { type: 'q/evidence', index: 0, paragraph: 1 });
    expect(moved.questions[0]).toMatchObject({ evidenceParagraph: 1, evidenceSentence: null });
    // choosing the same paragraph again keeps the sentence
    expect(edit(form, { type: 'q/evidence', index: 0, paragraph: 0 }).questions[0]!.evidenceSentence).toBe(0);
  });

  it('moves questions up and down, and not past either end', () => {
    const keys = form.questions.map((q) => q.key);
    expect(edit(form, { type: 'q/move', index: 1, step: -1 }).questions.map((q) => q.key)).toEqual([keys[1], keys[0], ...keys.slice(2)]);
    expect(edit(form, { type: 'q/move', index: 0, step: -1 }).questions).toBe(form.questions);
    expect(edit(form, { type: 'q/move', index: 5, step: 1 }).questions).toBe(form.questions);
  });

  it('adds a question handed to it, so the page knows which to open', () => {
    const question = blankQuestion();
    expect(edit(form, { type: 'q/add', question }).questions.at(-1)).toBe(question);
  });

  it('offers each interface language once for a gloss meaning, never English twice', () => {
    const row = formFromStory(storyFixture()).glossary[1]!;
    const left = glossLocalesLeft(row).map((l) => l.code);
    expect(left).not.toContain('en');
    expect(left).not.toContain('de');
    expect(left).toContain('ckb');
    const added = edit(form, { type: 'gloss/extra-add', index: 1, locale: 'de' }, { type: 'gloss/extra-add', index: 1, locale: 'en' });
    expect(added.glossary[1]!.extra.map((e) => e.locale)).toEqual(['de']);
  });
});

describe('the live checks', () => {
  it('pass a whole story, as the server would', () => {
    const form = formFromStory(storyFixture());
    expect(liveChecks(form)).toEqual({ blocking: [], beforePublish: [], warnings: [] });
    expect(validateStory(draftFromForm(form), 'publish')).toEqual({ errors: [], warnings: [] });
  });

  it('let an unfinished draft be saved, but not published', () => {
    // a new story with only a title: no text yet is fine in a draft
    const started = edit(blankForm('kurmanci', fixed), { type: 'text', field: 'title', value: 'Qelema Şîn' });
    expect(liveChecks(started).blocking).toEqual([]);
    expect(codes(liveChecks(started).beforePublish)).toEqual(['BODY_EMPTY@body']);
    // a text between the lengths (144 words: past short, short of medium) likewise
    const between = edit(formFromStory(storyFixture()), { type: 'text', field: 'body', value: `${BODY}\n\n${BODY}` });
    expect(liveChecks(between).blocking).toEqual([]);
    expect(codes(liveChecks(between).beforePublish)).toEqual([expect.stringMatching(/@body$/)]);
  });

  it('refuse at any stage what is broken, not unfinished', () => {
    // cut to one paragraph, the evidence in the others points past the text
    const cut = edit(formFromStory(storyFixture()), { type: 'text', field: 'body', value: BODY.split('\n\n')[0]! });
    expect(codes(liveChecks(cut).blocking)).toEqual(
      expect.arrayContaining(['EVIDENCE_PARAGRAPH@questions[2].evidenceParagraph', 'GLOSS_NOT_IN_TEXT@glossary[0].term']),
    );
  });

  it('refuse a glossary word the reader would never mark, matched as the reader matches', () => {
    const form = edit(
      formFromStory(storyFixture()),
      { type: 'gloss/add' },
      { type: 'gloss/set', index: 2, field: 'term', value: 'dilo' },
      { type: 'gloss/set', index: 2, field: 'en', value: 'heart' },
    );
    expect(codes(liveChecks(form).blocking)).toEqual(['GLOSS_NOT_IN_TEXT@glossary[2].term']);
    // letter case does not matter to the reader, and so not here
    const upper = edit(form, { type: 'gloss/set', index: 2, field: 'term', value: 'ŞÎLAN' });
    expect(liveChecks(upper).blocking).toEqual([]);
    expect(glossPlaces(upper)).toEqual([[2], [1], [2]]);
  });

  it('hold an explanation to one line: a warning past 120 characters, refused past 160', () => {
    const at = (n: number) =>
      liveChecks(edit(formFromStory(storyFixture()), { type: 'q/text', index: 0, field: 'explanationEn', value: 'x'.repeat(n) }));
    expect(at(120)).toEqual({ blocking: [], beforePublish: [], warnings: [] });
    expect(codes(at(121).warnings)).toEqual(['EXPLANATION_LONG@questions[0].explanationEn']);
    expect(codes(at(QUESTION_EXPLANATION_MAX + 1).blocking)).toEqual(['EXPLANATION_TOO_LONG@questions[0].explanationEn']);
  });

  it('refuse evidence that points at a sentence the paragraph does not have', () => {
    const form = edit(formFromStory(storyFixture()), { type: 'q/evidence-sentence', index: 0, sentence: 9 });
    expect(codes(liveChecks(form).blocking)).toEqual(['EVIDENCE_SENTENCE@questions[0].evidenceSentence']);
  });

  it('say when a bank is too small for its length, only once it is to be published', () => {
    const form = edit(formFromStory(storyFixture()), { type: 'q/remove', index: 0 });
    const checks = liveChecks(form);
    expect(checks.blocking).toEqual([]);
    expect(codes(checks.beforePublish)).toEqual(['BANK_TOO_SMALL@questions']);
  });
});

describe('where a problem is', () => {
  const list = [
    { code: 'A', path: 'questions[3].options[1]', message: '' },
    { code: 'B', path: 'questions[3]', message: '' },
    { code: 'C', path: 'questions[30].prompt', message: '' },
    { code: 'D', path: 'questions', message: '' },
  ];

  it('finds the problems at a path and inside it, not in a longer index', () => {
    expect(problemsAt(list, 'questions[3]').map((p) => p.code)).toEqual(['A', 'B']);
    expect(problemsAt(list, 'questions[3]', true).map((p) => p.code)).toEqual(['B']);
    expect(problemsAt(list, 'questions', true).map((p) => p.code)).toEqual(['D']);
  });

  it('names it for a person', () => {
    expect(describePath('questions[2].options[0]')).toBe('Question 3 · option 1');
    expect(describePath('questions[0].correctIndex')).toBe('Question 1 · right answer');
    expect(describePath('glossary[1].term')).toBe('Glossary word 2');
    expect(describePath('glossary[1].meanings.de')).toBe('Glossary word 2 · meaning (German)');
    expect(describePath('body.paragraphs[4]')).toBe('Paragraph 5');
    expect(describePath('body')).toBe('Text');
    expect(describePath('slug')).toBe('Address');
  });

  it('takes the editor to the field, or to what holds it', () => {
    expect(fieldIdsFor('questions[2].options[0]')).toEqual([
      'story-questions-2-options-0',
      'story-questions-2-options',
      'story-questions-2',
      'story-questions',
    ]);
    expect(fieldIdsFor('title')).toEqual(['story-title']);
  });
});

describe('the text', () => {
  it('counts words, names the length and the minutes, as learners will see them', () => {
    const facts = textFacts('kurmanci', BODY);
    expect(facts.words).toBe(countStoryWords(BODY));
    expect(facts.length).toBe('short');
    expect(facts.minutes).toBe(2);
    expect(facts.paragraphs.map((p) => p.sentences.length)).toEqual([4, 4, 4]);
    expect(facts.paragraphs[0]!.sentences[0]).toMatchObject({ text: 'Rojîn deh salî ye.', recordable: true, long: false, tooLong: false });
  });

  it('marks what will not be said aloud and what is too long to record', () => {
    const long = `${'Rojîn û birayê wê '.repeat(11).trim()}.`;
    const facts = textFacts('kurmanci', `${long}\n\n* * *\n\n${long.repeat(2)}`);
    expect(facts.length).toBeNull();
    expect(facts.paragraphs[0]!.sentences[0]).toMatchObject({ long: true, tooLong: false });
    expect(facts.paragraphs[1]!.sentences[0]).toMatchObject({ recordable: false });
    expect(facts.paragraphs[2]!.sentences[0]).toMatchObject({ tooLong: true });
  });

  it('has no length without a text', () => {
    expect(textFacts('sorani', '  ')).toMatchObject({ words: 0, length: null, paragraphs: [] });
  });
});

describe('status', () => {
  it('offers what the API allows in each status', () => {
    expect(availableActions(null)).toEqual(['save']);
    expect(availableActions('draft')).toEqual(['save', 'submit', 'publish', 'archive', 'delete']);
    expect(availableActions('in_review')).toEqual(['save', 'publish', 'archive', 'delete']);
    expect(availableActions('published')).toEqual(['unpublish', 'archive', 'delete']);
    expect(availableActions('archived')).toEqual(['delete']);
    expect([null, 'draft', 'in_review', 'published', 'archived'].map((s) => isEditable(s as never))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('marks a starter story until someone has published it', () => {
    expect(needsNativeReview({ source: 'starter', publishedAt: null })).toBe(true);
    // unpublished again after a review, it has been read once already
    expect(needsNativeReview({ source: 'starter', publishedAt: '2026-10-05T10:00:00.000Z' })).toBe(false);
    expect(needsNativeReview({ source: 'admin', publishedAt: null })).toBe(false);
  });
});

describe('the list', () => {
  const base = storyFixture();
  const list = [
    summaryOf(base, { id: '1', title: 'Rêya Dibistanê', status: 'published', publishedAt: '2026-10-05T10:00:00.000Z' }),
    summaryOf(base, { id: '2', title: 'Şorbeya Nîskê', slug: 'sorbeya-niske', length: 'medium', status: 'draft', source: 'starter', questionCount: 8, problems: { errors: 1, warnings: 2 } }),
    summaryOf(base, { id: '3', title: 'کلیلی ماڵەوە', slug: 'ckb-the-house-key', dialect: 'sorani', status: 'in_review', problems: { errors: 0, warnings: 1 } }),
    summaryOf(base, { id: '4', title: 'Rovî û Hirç', slug: 'rovi-u-hirc', length: null, status: 'archived' }),
    summaryOf(base, { id: '5', title: 'Barana Newrozê', slug: 'barana-newroze', length: 'long', status: 'published', dialect: 'kurmanci' }),
  ];

  it('filters by status, variety and a search that ignores the Hawar marks', () => {
    const ids = (f: Parameters<typeof filterStories>[1]) => filterStories(list, f).map((s) => s.id);
    expect(ids({ status: 'all', dialect: 'all', query: '' })).toEqual(['1', '2', '3', '4', '5']);
    expect(ids({ status: 'published', dialect: 'all', query: '' })).toEqual(['1', '5']);
    expect(ids({ status: 'all', dialect: 'sorani', query: '' })).toEqual(['3']);
    expect(ids({ status: 'all', dialect: 'all', query: 'sorbeya' })).toEqual(['2']);
    expect(ids({ status: 'all', dialect: 'all', query: 'house' })).toEqual(['3']);
    expect(ids({ status: 'draft', dialect: 'all', query: 'newroz' })).toEqual([]);
  });

  it('counts every status within a variety', () => {
    expect(statusCounts(list)).toEqual({ all: 5, draft: 1, in_review: 1, published: 2, archived: 1 });
    expect(statusCounts(list, 'sorani')).toEqual({ all: 1, draft: 0, in_review: 1, published: 0, archived: 0 });
  });

  it('counts what learners can play, per variety and length', () => {
    expect(publishedCoverage(list)).toEqual({
      kurmanci: { short: 1, medium: 0, long: 1 },
      sorani: { short: 0, medium: 0, long: 0 },
    });
  });

  it('says what stands between a story and publishing', () => {
    expect(problemLabel(list[1]!)).toEqual({ text: '1 to fix · 2 to check', tone: 'danger' });
    expect(problemLabel(list[2]!)).toEqual({ text: '1 to check', tone: 'mid' });
    expect(problemLabel({ ...list[2]!, problems: { errors: 0, warnings: 0 } })).toEqual({ text: 'Ready', tone: 'ok' });
    expect(problemLabel(list[0]!)).toEqual({ text: 'None', tone: '' });
  });

  it('shows a bank short of its length’s minimum against that minimum', () => {
    expect(bankLabel(list[1]!)).toEqual({ text: '8 / 12', short: true });
    expect(bankLabel(list[0]!)).toEqual({ text: '6', short: false });
    expect(bankLabel(list[3]!)).toEqual({ text: '6', short: false });
  });
});
