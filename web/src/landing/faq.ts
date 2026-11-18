import type { MessageKey } from '../i18n/en';

/**
 * The FAQ. Each answer matches what the code does: nothing costs money (api/src/shop), Rhyming Words works in Soranî
 * (pages/Rhyme.tsx), demotion needs a large enough group (MIN_FOR_DEMOTION), and the research answer matches
 * teaching/principles.ts. When one of those changes, change its answer. The front page shows the first six.
 */
export interface FaqEntry {
  /** Stable, for anchors such as /faq#faq-free. */
  id: string;
  q: MessageKey;
  a: MessageKey;
  /** Where to read more, when the short answer is not the whole story. */
  link?: { to: string; label: MessageKey; external?: boolean };
}

export const FAQ: ReadonlyArray<FaqEntry> = [
  { id: 'what', q: 'faq.what.q', a: 'faq.what.a' },
  { id: 'free', q: 'faq.free.q', a: 'faq.free.a' },
  { id: 'kurdish', q: 'faq.kurdish.q', a: 'faq.kurdish.a' },
  { id: 'account', q: 'faq.account.q', a: 'faq.account.a' },
  { id: 'friends', q: 'faq.friends.q', a: 'faq.friends.a' },
  { id: 'app', q: 'faq.app.q', a: 'faq.app.a' },
  // What research the lessons follow, and what is not claimed for it.
  { id: 'research', q: 'faq.research.q', a: 'faq.research.a', link: { to: '/how-hevalo-teaches', label: 'footer.teach' } },
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
