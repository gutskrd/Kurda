import {
  isAppLocale,
  storyHeadingTitle,
  storyTextDirection,
  type AppLocale,
  type StoryDetail,
  type StoryListItem,
  type StoryNote,
  type StoryQuestionTranslation,
  type StoryReflection,
  type StorySection,
} from '@kurda/shared';

/**
 * What the reader needs to read a legend — a story told in sections — on
 * the phone, kept apart from the screens so it is tested on its own: which
 * chapter a paragraph is in, the title and summary in the reader's language,
 * and each of a legend's texts (a reflection, a note, a question) in the
 * reader's language, else in English.
 *
 * A story's own language is never translated into itself: a Kurmancî story
 * read in the Kurmancî interface shows no translated title, and a Soranî one
 * in the Soranî interface likewise.
 */

/** The interface language a story is written in (Kurmancî stories `ku`, Soranî ones `ckb`). */
export function storyOwnLocale(story: Pick<StoryListItem, 'dialect'>): AppLocale {
  return storyTextDirection(story.dialect).lang;
}

/** The reader's own translation, else the English one, else none; never the story's own language. */
function pick<T>(translations: Partial<Record<AppLocale, T>>, locale: string, own: AppLocale): { value: T; lang: AppLocale } | null {
  if (locale === own) return null;
  const mine = isAppLocale(locale) ? translations[locale] : undefined;
  if (mine !== undefined) return { value: mine, lang: locale as AppLocale };
  return translations.en !== undefined ? { value: translations.en, lang: 'en' } : null;
}

/**
 * The title and summary in the reader's language, beside the Kurdish ones
 * (which stay the main ones). Either can be missing; a title that only
 * repeats the Kurdish is left out.
 */
export function metaFor(story: Pick<StoryListItem, 'dialect' | 'title' | 'metaTranslations'>, locale: string): { title: string | null; summary: string | null; lang: AppLocale } | null {
  const found = pick(story.metaTranslations ?? {}, locale, storyOwnLocale(story));
  if (!found) return null;
  const title = found.value.title?.trim() && found.value.title.trim() !== story.title.trim() ? found.value.title.trim() : null;
  const summary = found.value.summary?.trim() ? found.value.summary.trim() : null;
  return title || summary ? { title, summary, lang: found.lang } : null;
}

/** A reflection's question in the reader's language (English where theirs has none), or null. */
export function reflectionIn(reflection: StoryReflection, story: Pick<StoryDetail, 'dialect'>, locale: string): { text: string; lang: AppLocale } | null {
  const found = pick(reflection.translations, locale, storyOwnLocale(story));
  return found ? { text: found.value, lang: found.lang } : null;
}

/** A note's title and body in the reader's language, or null where only the Kurdish is there. */
export function noteIn(note: StoryNote, story: Pick<StoryDetail, 'dialect'>, locale: string): { title: string; body: string; lang: AppLocale } | null {
  const found = pick(note.translations, locale, storyOwnLocale(story));
  return found ? { ...found.value, lang: found.lang } : null;
}

/**
 * A question in the reader's language: the prompt and options from its
 * translations, else the English prompt and explanation the older stories
 * carry on their own. The options are in the game's order in every
 * language, so the same index is the same option.
 */
export function questionIn(
  q: { translations?: Partial<Record<AppLocale, StoryQuestionTranslation>>; promptEn?: string | null; explanationEn?: string | null },
  locale: string,
): { prompt: string | null; options: string[] | null; explanation: string | null; lang: AppLocale } | null {
  const translations = q.translations ?? {};
  const mine = isAppLocale(locale) ? translations[locale] : undefined;
  const found = mine ? { value: mine, lang: locale as AppLocale } : translations.en ? { value: translations.en, lang: 'en' as AppLocale } : null;
  if (found) {
    return {
      prompt: found.value.prompt || null,
      options: found.value.options?.length ? found.value.options : null,
      explanation: found.value.explanation ?? (found.lang === 'en' ? (q.explanationEn ?? null) : null),
      lang: found.lang,
    };
  }
  if (q.promptEn || q.explanationEn) return { prompt: q.promptEn ?? null, options: null, explanation: q.explanationEn ?? null, lang: 'en' };
  return null;
}

/**
 * Which chapter a paragraph is in: the index of the last section that starts
 * at or before it, or -1 for the introduction (the paragraphs before the
 * first heading) and for a story without sections.
 */
export function chapterAt(sections: readonly StorySection[], paragraph: number): number {
  let at = -1;
  sections.forEach((s, i) => {
    if (s.paragraph <= paragraph) at = i;
  });
  return at;
}

/** Whether a story has an introduction before its first chapter. */
export function hasIntroduction(sections: readonly StorySection[]): boolean {
  return sections.length > 0 && sections[0]!.paragraph > 0;
}

/** A heading's title in a translation, which keeps the heading as a paragraph of its own ("## Title"). */
export function translatedHeading(translated: string | undefined): string | null {
  if (!translated) return null;
  return storyHeadingTitle(translated) ?? (translated.trim() || null);
}
