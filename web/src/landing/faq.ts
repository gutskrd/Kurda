import type { MessageKey } from '../i18n/en';

/**
 * What people ask before they start, and the honest answer to each.
 *
 * Every answer here is something the product does today, checked against the
 * code rather than written from hope: nothing in the browser costs money (the
 * shop spends Zêr and gems, never cash — api/src/shop); Rhyming Words really can
 * be played in Soranî (pages/Rhyme.tsx); the bottom of a league only moves down
 * in a group big enough to be fair (leagues/format.ts, MIN_FOR_DEMOTION). When
 * one of those changes, the answer about it changes with it.
 *
 * The front page shows the first six; /faq shows them all.
 */
export interface FaqEntry {
  /** stable, for the anchor a link can point at: /faq#faq-free */
  id: string;
  q: MessageKey;
  a: MessageKey;
  /** somewhere to read more, when the short answer is not the whole story */
  link?: { to: string; label: MessageKey; external?: boolean };
}

export const FAQ: ReadonlyArray<FaqEntry> = [
  { id: 'what', q: 'faq.what.q', a: 'faq.what.a' },
  { id: 'free', q: 'faq.free.q', a: 'faq.free.a' },
  { id: 'kurdish', q: 'faq.kurdish.q', a: 'faq.kurdish.a' },
  { id: 'account', q: 'faq.account.q', a: 'faq.account.a' },
  { id: 'friends', q: 'faq.friends.q', a: 'faq.friends.a' },
  { id: 'app', q: 'faq.app.q', a: 'faq.app.a' },
  { id: 'progress', q: 'faq.progress.q', a: 'faq.progress.a' },
  { id: 'heritage', q: 'faq.heritage.q', a: 'faq.heritage.a' },
  { id: 'languages', q: 'faq.languages.q', a: 'faq.languages.a' },
  { id: 'data', q: 'faq.data.q', a: 'faq.data.a', link: { to: '/privacy', label: 'footer.privacy' } },
  {
    id: 'who',
    q: 'faq.who.q',
    a: 'about.makerBody',
    link: { to: 'https://zagrosian.com', label: 'about.makerTitle', external: true },
  },
];

/** The questions somebody deciding whether to start asks first. */
export const HOME_FAQ = FAQ.slice(0, 6);
