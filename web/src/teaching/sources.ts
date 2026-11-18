/**
 * The studies "How Hevalo teaches" cites, as published; each entry was checked against the paper. References are not
 * translated, since they name papers as printed. The Worker also bundles this file to write the same list as
 * schema.org `citation`s, so it must not import React or the DOM.
 */

export type SourceId =
  | 'roediger2006'
  | 'adesope2017'
  | 'cepeda2006'
  | 'kimWebb2022'
  | 'nakata2017'
  | 'li2010'
  | 'metcalfe2017'
  | 'uchihara2025'
  | 'saitoPlonsky2019'
  | 'deci1999'
  | 'sailerHomner2020'
  | 'hirshPasek2015'
  | 'radesky2022'
  | 'settlesMeeder2016';

export interface Source {
  /** Family name and initials, in the order the paper lists them. */
  authors: ReadonlyArray<readonly [family: string, initials: string]>;
  /** More authors than are listed, so the reference ends "et al.". */
  etAl?: boolean;
  year: number;
  title: string;
  /** The journal, or the proceedings for a conference paper. */
  venue: string;
  /** A journal is a Periodical in schema.org; a proceedings volume is not. */
  kind: 'journal' | 'proceedings';
  volume?: string;
  issue?: string;
  pages?: string;
  url: string;
}

export const SOURCES: Readonly<Record<SourceId, Source>> = {
  roediger2006: {
    authors: [
      ['Roediger', 'H. L.'],
      ['Karpicke', 'J. D.'],
    ],
    year: 2006,
    title: 'Test-enhanced learning: Taking memory tests improves long-term retention',
    venue: 'Psychological Science',
    kind: 'journal',
    volume: '17',
    issue: '3',
    pages: '249–255',
    url: 'https://profiles.wustl.edu/en/publications/test-enhanced-learning-taking-memory-tests-improves-long-term-ret/',
  },
  adesope2017: {
    authors: [
      ['Adesope', 'O. O.'],
      ['Trevisan', 'D. A.'],
      ['Sundararajan', 'N.'],
    ],
    year: 2017,
    title: 'Rethinking the use of tests: A meta-analysis of practice testing',
    venue: 'Review of Educational Research',
    kind: 'journal',
    volume: '87',
    issue: '3',
    pages: '659–701',
    url: 'https://journals.sagepub.com/doi/10.3102/0034654316689306',
  },
  cepeda2006: {
    authors: [
      ['Cepeda', 'N. J.'],
      ['Pashler', 'H.'],
      ['Vul', 'E.'],
      ['Wixted', 'J. T.'],
      ['Rohrer', 'D.'],
    ],
    year: 2006,
    title: 'Distributed practice in verbal recall tasks: A review and quantitative synthesis',
    venue: 'Psychological Bulletin',
    kind: 'journal',
    volume: '132',
    issue: '3',
    pages: '354–380',
    url: 'https://pubmed.ncbi.nlm.nih.gov/16719566/',
  },
  kimWebb2022: {
    authors: [
      ['Kim', 'S. K.'],
      ['Webb', 'S.'],
    ],
    year: 2022,
    title: 'The effects of spaced practice on second language learning: A meta-analysis',
    venue: 'Language Learning',
    kind: 'journal',
    url: 'https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479',
  },
  nakata2017: {
    authors: [['Nakata', 'T.']],
    year: 2017,
    title:
      'Does repeated practice make perfect? The effects of within-session repeated retrieval on second language vocabulary learning',
    venue: 'Studies in Second Language Acquisition',
    kind: 'journal',
    volume: '39',
    issue: '4',
    url: 'https://resolve.cambridge.org/core/journals/studies-in-second-language-acquisition/article/does-repeated-practice-make-perfect-the-effects-of-withinsession-repeated-retrieval-on-second-language-vocabulary-learning/F14BA8A576CD2563D14CEA46E35D842E',
  },
  li2010: {
    authors: [['Li', 'S.']],
    year: 2010,
    title: 'The effectiveness of corrective feedback in SLA: A meta-analysis',
    venue: 'Language Learning',
    kind: 'journal',
    volume: '60',
    issue: '2',
    pages: '309–365',
    url: 'https://researchspace.auckland.ac.nz/handle/2292/24985',
  },
  metcalfe2017: {
    authors: [['Metcalfe', 'J.']],
    year: 2017,
    title: 'Learning from errors',
    venue: 'Annual Review of Psychology',
    kind: 'journal',
    volume: '68',
    url: 'https://annualreviewsnews.org/2017/01/18/the-annual-review-of-psychology-volume-68/',
  },
  uchihara2025: {
    authors: [
      ['Uchihara', 'T.'],
      ['Karas', 'M.'],
      ['Thomson', 'R. I.'],
    ],
    year: 2025,
    title: 'High variability phonetic training (HVPT): A meta-analysis of L2 perceptual training studies',
    venue: 'Studies in Second Language Acquisition',
    kind: 'journal',
    url: 'https://resolve.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6/core-reader',
  },
  saitoPlonsky2019: {
    authors: [
      ['Saito', 'K.'],
      ['Plonsky', 'L.'],
    ],
    year: 2019,
    title:
      'Effects of second language pronunciation teaching revisited: A proposed measurement framework and meta-analysis',
    venue: 'Language Learning',
    kind: 'journal',
    volume: '69',
    issue: '3',
    pages: '652–708',
    url: 'https://discovery-pp.ucl.ac.uk/id/eprint/10068780',
  },
  deci1999: {
    authors: [
      ['Deci', 'E. L.'],
      ['Koestner', 'R.'],
      ['Ryan', 'R. M.'],
    ],
    year: 1999,
    title: 'A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation',
    venue: 'Psychological Bulletin',
    kind: 'journal',
    volume: '125',
    issue: '6',
    pages: '627–668',
    url: 'https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf',
  },
  sailerHomner2020: {
    authors: [
      ['Sailer', 'M.'],
      ['Homner', 'L.'],
    ],
    year: 2020,
    title: 'The gamification of learning: A meta-analysis',
    venue: 'Educational Psychology Review',
    kind: 'journal',
    volume: '32',
    issue: '1',
    pages: '77–112',
    url: 'https://link.springer.com/article/10.1007/S10648-019-09498-W',
  },
  hirshPasek2015: {
    authors: [
      ['Hirsh-Pasek', 'K.'],
      ['Zosh', 'J. M.'],
      ['Golinkoff', 'R. M.'],
      ['Gray', 'J. H.'],
      ['Robb', 'M. B.'],
      ['Kaufman', 'J.'],
    ],
    year: 2015,
    title: 'Putting education in “educational” apps: Lessons from the science of learning',
    venue: 'Psychological Science in the Public Interest',
    kind: 'journal',
    volume: '16',
    issue: '1',
    pages: '3–34',
    url: 'https://www.psychologicalscience.org/publications/educational-apps.html',
  },
  radesky2022: {
    authors: [['Radesky', 'J.']],
    etAl: true,
    year: 2022,
    title: 'Prevalence and characteristics of manipulative design in mobile applications used by children',
    venue: 'JAMA Network Open',
    kind: 'journal',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/',
  },
  settlesMeeder2016: {
    authors: [
      ['Settles', 'B.'],
      ['Meeder', 'B.'],
    ],
    year: 2016,
    title: 'A trainable spaced repetition model for language learning',
    venue: 'Proceedings of ACL 2016',
    kind: 'proceedings',
    url: 'https://aclanthology.org/P16-1174/',
  },
};

/** The order the Sources list prints them in: by first author. */
export const SOURCE_ORDER: ReadonlyArray<SourceId> = (Object.keys(SOURCES) as SourceId[]).sort((a, b) =>
  SOURCES[a].authors[0]![0].localeCompare(SOURCES[b].authors[0]![0], 'en'),
);

/** A study cited in passing, as in "Roediger & Karpicke, 2006" or "Cepeda et al., 2006". */
export function shortCite(s: Source): string {
  const families = s.authors.map(([family]) => family);
  const names =
    families.length === 1 && !s.etAl
      ? families[0]!
      : families.length === 2 && !s.etAl
        ? `${families[0]} & ${families[1]}`
        : `${families[0]} et al.`;
  return `${names}, ${s.year}`;
}

/** "Roediger, H. L., & Karpicke, J. D." — the author list of a full reference. */
export function authorList(s: Source): string {
  const names = s.authors.map(([family, initials]) => `${family}, ${initials}`);
  if (s.etAl) return `${names.join(', ')}, et al.`;
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
}

/** ", 17(3), 249–255" — whatever of volume, issue and pages the paper has. */
export function locator(s: Source): string {
  let out = '';
  if (s.volume) out += `, ${s.volume}${s.issue ? `(${s.issue})` : ''}`;
  if (s.pages) out += `, ${s.pages}`;
  return out;
}
