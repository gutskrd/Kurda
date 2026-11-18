import type { MessageKey } from '../i18n/en';
import type { SourceId } from './sources';

/**
 * What "How Hevalo teaches" says, principle by principle: what the research found (no more than each paper's own
 * summary supports), what Hevalo does (only what the code does), and the studies cited. The "does" sentences describe
 * code in api/src/content/exercises.ts, api/src/review/sm2.ts, shared/src/lesson-player.ts, api/src/lessonaudio,
 * api/src/rewards, api/src/streaks and api/src/users/age.ts; when that code changes, change or remove the sentence.
 * Where Hevalo does less than a study did (one recording per text, no listening or speaking in the first course, a
 * completion-contingent daily reward), the section says so. The references are in sources.ts and are not translated.
 */
interface Principle {
  /** The section's anchor, as in /how-hevalo-teaches#spacing. */
  id: string;
  title: MessageKey;
  /** What the research found, a sentence or two each. */
  found: ReadonlyArray<MessageKey>;
  /** What Hevalo does about it. */
  does: ReadonlyArray<MessageKey>;
  /** The studies the section cites, in the order its sentences use them. */
  sources: ReadonlyArray<SourceId>;
}

export const PRINCIPLES: ReadonlyArray<Principle> = [
  {
    id: 'retrieval',
    title: 'teach.retrieval.title',
    found: ['teach.retrieval.found1', 'teach.retrieval.found2'],
    does: ['teach.retrieval.does1', 'teach.retrieval.does2', 'teach.retrieval.does3'],
    sources: ['roediger2006', 'adesope2017'],
  },
  {
    id: 'spacing',
    title: 'teach.spacing.title',
    found: ['teach.spacing.found1', 'teach.spacing.found2'],
    does: [
      'teach.spacing.does1',
      'teach.spacing.does2',
      'teach.spacing.does3',
      'teach.spacing.does4',
      'teach.spacing.does5',
    ],
    sources: ['cepeda2006', 'kimWebb2022', 'settlesMeeder2016'],
  },
  {
    id: 'again',
    title: 'teach.again.title',
    found: ['teach.again.found1', 'teach.again.found2'],
    does: ['teach.again.does1', 'teach.again.does2', 'teach.again.does3', 'teach.again.does4'],
    sources: ['nakata2017'],
  },
  {
    id: 'feedback',
    title: 'teach.feedback.title',
    found: ['teach.feedback.found1', 'teach.feedback.found2'],
    does: [
      'teach.feedback.does1',
      'teach.feedback.does2',
      'teach.feedback.does3',
      'teach.feedback.does4',
      'teach.feedback.does5',
    ],
    sources: ['li2010', 'metcalfe2017'],
  },
  {
    id: 'voices',
    title: 'teach.voices.title',
    found: ['teach.voices.found1', 'teach.voices.found2'],
    does: [
      'teach.voices.does1',
      'teach.voices.does2',
      'teach.voices.does3',
      'teach.voices.does4',
      'teach.voices.does5',
      'teach.voices.does6',
    ],
    sources: ['uchihara2025', 'saitoPlonsky2019'],
  },
  {
    id: 'rewards',
    title: 'teach.rewards.title',
    found: ['teach.rewards.found1', 'teach.rewards.found2'],
    does: [
      'teach.rewards.does1',
      'teach.rewards.does2',
      'teach.rewards.does3',
      'teach.rewards.does4',
      'teach.rewards.does5',
    ],
    sources: ['deci1999', 'sailerHomner2020'],
  },
  {
    id: 'younger',
    title: 'teach.younger.title',
    found: ['teach.younger.found1', 'teach.younger.found2', 'teach.younger.found3'],
    does: [
      'teach.younger.does1',
      'teach.younger.does2',
      'teach.younger.does3',
      'teach.younger.does4',
      'teach.younger.does5',
    ],
    sources: ['radesky2022', 'hirshPasek2015'],
  },
];

/** What the page does not claim. */
export const LIMITS: ReadonlyArray<MessageKey> = [
  'teach.limits.fluent',
  'teach.limits.pronunciation',
  'teach.limits.languages',
  'teach.limits.numbers',
];
