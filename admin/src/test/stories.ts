/**
 * Stories for the admin's tests: a short Kurmancî story that passes every
 * check `validateStory` makes (72 words, six questions of mixed kinds with
 * the right answer in different places, evidence on each, a glossary whose
 * words are in the text), and list rows to go with it.
 */
import type { AdminStory, AdminStorySummary } from '../stories';

export const STORY_ID = '0b5c1a52-6c1e-4f43-9a37-2a1f6b6a9d01';

export const BODY = [
  'Rojîn deh salî ye. Ew li gundekî biçûk dijî. Gundê wê li ber çiyayekî bilind e. Her sibe Rojîn bi birayê xwe re diçe dibistanê.',
  'Rêya dibistanê dirêj e. Ew di nav zeviyan re derbas dibin. Li wir gelek kulîlk hene. Rojîn ji kulîlkên sor hez dike.',
  'Mamosteya wan Şîlan e. Ew gelek dilovan e. Ew çîrokan ji zarokan re dixwîne. Piştî dibistanê Rojîn û birayê xwe bi hev re vedigerin malê.',
].join('\n\n');

export function storyFixture(over: Partial<AdminStory> = {}): AdminStory {
  return {
    id: STORY_ID,
    slug: 'reya-dibistane',
    dialect: 'kurmanci',
    level: 1,
    title: 'Rêya Dibistanê',
    summary: 'Rojîn her sibe diçe dibistanê.',
    body: BODY,
    glossary: [
      { term: 'dilovan', meanings: { en: 'kind' } },
      { term: 'zeviyan', meanings: { en: 'fields', de: 'Felder' } },
    ],
    questions: [
      {
        id: 'q1',
        kind: 'detail',
        prompt: 'Rojîn çend salî ye?',
        promptEn: 'How old is Rojîn?',
        options: ['Deh salî', 'Neh salî', 'Heşt salî'],
        correctIndex: 0,
        explanation: 'Çîrok dibêje: “Rojîn deh salî ye.”',
        explanationEn: 'The story says: “Rojîn is ten years old.”',
        evidenceParagraph: 0,
        evidenceSentence: 0,
      },
      {
        id: 'q2',
        kind: 'detail',
        prompt: 'Gundê Rojînê li ku ye?',
        promptEn: 'Where is Rojîn’s village?',
        options: ['Li ber deryayê', 'Li ber çiyayekî', 'Li nav bajêr'],
        correctIndex: 1,
        explanation: null,
        explanationEn: null,
        evidenceParagraph: 0,
        evidenceSentence: 2,
      },
      {
        id: 'q3',
        kind: 'vocabulary',
        prompt: '“Dilovan” tê çi wateyê?',
        promptEn: 'What does “dilovan” mean?',
        options: ['angry', 'tired', 'kind'],
        correctIndex: 2,
        explanation: null,
        explanationEn: null,
        evidenceParagraph: 2,
        evidenceSentence: 1,
      },
      {
        id: 'q4',
        kind: 'sequence',
        prompt: 'Piştî dibistanê çi dibe?',
        promptEn: 'What happens after school?',
        options: ['Ew diçin zeviyan', 'Ew vedigerin malê', 'Ew çîrokan dixwînin'],
        correctIndex: 1,
        explanation: null,
        explanationEn: null,
        evidenceParagraph: 2,
        evidenceSentence: 3,
      },
      {
        id: 'q5',
        kind: 'detail',
        prompt: 'Rojîn ji kîjan kulîlkan hez dike?',
        promptEn: 'Which flowers does Rojîn like?',
        options: ['Yên sor', 'Yên zer', 'Yên spî'],
        correctIndex: 0,
        explanation: null,
        explanationEn: null,
        evidenceParagraph: 1,
        evidenceSentence: 3,
      },
      {
        id: 'q6',
        kind: 'gist',
        prompt: 'Çîrok li ser çi ye?',
        promptEn: 'What is the story about?',
        options: ['Rêya Rojînê ya dibistanê', 'Cejneke li gund', 'Rojeke li bajêr'],
        correctIndex: 0,
        explanation: null,
        explanationEn: null,
        evidenceParagraph: null,
        evidenceSentence: null,
      },
    ],
    status: 'draft',
    source: 'admin',
    wordCount: 72,
    length: 'short',
    readingMinutes: 2,
    lockVersion: 4,
    publishedAt: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-02T09:00:00.000Z',
    problems: { errors: [], warnings: [] },
    ...over,
  };
}

export function summaryOf(story: AdminStory, over: Partial<AdminStorySummary> = {}): AdminStorySummary {
  return {
    id: story.id,
    slug: story.slug,
    dialect: story.dialect,
    level: story.level,
    title: story.title,
    status: story.status,
    source: story.source,
    wordCount: story.wordCount,
    length: story.length,
    questionCount: story.questions.length,
    lockVersion: story.lockVersion,
    publishedAt: story.publishedAt,
    updatedAt: story.updatedAt,
    problems: { errors: story.problems.errors.length, warnings: story.problems.warnings.length },
    ...over,
  };
}
