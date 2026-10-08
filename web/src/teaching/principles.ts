import type { MessageKey } from '../i18n/en';
import type { SourceId } from './sources';

/**
 * What "How Hevalo teaches" says, principle by principle.
 *
 * Each one is three things kept apart on purpose: what the research found,
 * what Hevalo does about it, and the studies to read. Kept apart because they
 * are held to different standards. A finding says no more than the study's own
 * summary supports — the wording was checked against each paper, and the
 * research roadmap in docs/research explains why that line is held so firmly
 * (its fact-checks cut more than one popular figure down to size). What Hevalo
 * does is only what the code does: the review schedule in api/src/review/sm2.ts,
 * the second try in shared/src/lesson-player.ts, the rewards and the age rules
 * on the server. When one of those changes, the sentence about it changes too,
 * or comes out.
 *
 * Every word is a catalogue key; the references are in sources.ts and are not
 * translated.
 */
export interface Principle {
  /** the section's anchor: /how-hevalo-teaches#spacing */
  id: string;
  title: MessageKey;
  /** what the research found, a sentence or two each */
  found: ReadonlyArray<MessageKey>;
  /** what Hevalo does about it */
  does: ReadonlyArray<MessageKey>;
  /** the studies behind `found`, in the order the sentences use them */
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
    found: ['teach.younger.found1', 'teach.younger.found2'],
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

/** What the page does not claim — said as plainly as what it does. */
export const LIMITS: ReadonlyArray<MessageKey> = [
  'teach.limits.fluent',
  'teach.limits.pronunciation',
  'teach.limits.languages',
  'teach.limits.numbers',
];
