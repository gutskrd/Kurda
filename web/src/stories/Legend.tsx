/**
 * What the reader adds for a story told in chapters — a legend — and for the
 * things a story carries beside its text: where the reader is among the
 * chapters, the list of them to jump from, the title and summary in the
 * reader's language, the questions to think about afterwards, and the notes
 * and sources that say what the story is and where it comes from.
 *
 * A chapter is a heading paragraph ("## Title", `storySections`), so every
 * index into the paragraphs — the reader's saved place, the narration, an
 * answer's evidence — is the one list it always was, and progress by chapter
 * is read from the same saved place.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import {
  storyHeadingTitle,
  storyTextDirection,
  type AppLocale,
  type StoryDetail,
  type StoryNoteKind,
  type StorySection,
  type StorySourceType,
} from '@kurda/shared';
import { CheckIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** A story's own interface language: a Kurmancî story is the `ku` interface's language, a Soranî one `ckb`'s. */
export function ownLocale(dialect: StoryDetail['dialect']): AppLocale {
  return dialect === 'sorani' ? 'ckb' : 'ku';
}

/** The direction text in an interface language is set in. */
export function localeDir(lang: string): 'rtl' | 'ltr' {
  return lang === 'ar' || lang === 'ckb' ? 'rtl' : 'ltr';
}

/**
 * Something in the reader's language from a story's translations: theirs,
 * else English. Nothing when the reader's language is the story's own, nor
 * when neither is there.
 */
export function inReaderLanguage<T>(translations: Partial<Record<AppLocale, T>> | undefined, locale: AppLocale, own: AppLocale): { lang: AppLocale; value: T } | null {
  if (locale === own) return null;
  const theirs = translations?.[locale];
  if (theirs) return { lang: locale, value: theirs };
  const en = translations?.en;
  return en ? { lang: 'en', value: en } : null;
}

/** The story's title and summary in the reader's language, each where it has been translated (else English); the Kurdish stays the story's own. */
export function useMetaTranslation(story: Pick<StoryDetail, 'dialect' | 'metaTranslations'>): {
  title: { lang: AppLocale; text: string } | null;
  summary: { lang: AppLocale; text: string } | null;
} {
  const locale = useLocale();
  return useMemo(() => {
    const own = ownLocale(story.dialect);
    const meta = story.metaTranslations ?? {};
    const field = (k: 'title' | 'summary'): { lang: AppLocale; text: string } | null => {
      if (locale === own) return null;
      const theirs = meta[locale]?.[k]?.trim();
      if (theirs) return { lang: locale, text: theirs };
      const en = meta.en?.[k]?.trim();
      return en ? { lang: 'en', text: en } : null;
    };
    return { title: field('title'), summary: field('summary') };
  }, [story.dialect, story.metaTranslations, locale]);
}

/** Where a chapter is: the line under the app's bar and the reader's tools that a chapter has to have crossed to be the one being read. */
const READING_LINE = 180;

/**
 * Which chapter is on the screen and the furthest paragraph scrolled to,
 * read from the page as it scrolls (once a frame at most). -1 is the
 * introduction, or nothing yet. Nothing is watched for a story without
 * chapters, nor where nothing has been laid out (a test).
 */
export function useChapterPosition(container: RefObject<HTMLElement | null>, sections: readonly StorySection[]): { current: number; furthest: number } {
  const [position, setPosition] = useState({ current: -1, furthest: -1 });
  useEffect(() => {
    const root = container.current;
    if (!root || sections.length === 0) return;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      let current = -1;
      sections.forEach((s, i) => {
        const box = root.querySelector(`[data-paragraph="${s.paragraph}"]`)?.getBoundingClientRect();
        if (box && box.height > 0 && box.top <= READING_LINE) current = i;
      });
      let furthest = -1;
      const fold = window.innerHeight * 0.6;
      root.querySelectorAll<HTMLElement>('[data-paragraph]').forEach((el) => {
        const box = el.getBoundingClientRect();
        if (box.height > 0 && box.top < fold) furthest = Math.max(furthest, Number(el.dataset.paragraph));
      });
      setPosition((was) => (was.current === current && was.furthest >= furthest ? was : { current, furthest: Math.max(was.furthest, furthest) }));
    };
    const soon = (): void => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    return () => {
      window.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [container, sections]);
  return position;
}

/** The last paragraph of each chapter: the one before the next heading, or the story's last. */
function chapterEnds(sections: readonly StorySection[], count: number): number[] {
  return sections.map((s, i) => (sections[i + 1]?.paragraph ?? count) - 1);
}

/** A heading's title in the translation the reader is shown, where it has one in the same place. */
function translatedTitle(translation: { paragraphs: readonly string[] } | null, paragraph: number): string | null {
  return storyHeadingTitle(translation?.paragraphs[paragraph] ?? '');
}

/**
 * The chapters, as a book's contents: the introduction when there is one,
 * then each chapter by its number and Kurdish title, its title in the
 * reader's language under it, and a mark for each chapter read — one line of
 * segments above them says how far through the chapters the reader is. Each
 * entry takes them to its chapter.
 */
export function ChapterContents({
  story,
  translation,
  current,
  furthest,
  finished,
  onJump,
}: {
  story: Pick<StoryDetail, 'dialect' | 'sections' | 'paragraphs'>;
  translation: { lang: string; paragraphs: readonly string[] } | null;
  current: number;
  furthest: number;
  finished: boolean;
  onJump: (paragraph: number) => void;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = storyTextDirection(story.dialect);
  const sections = story.sections;
  if (sections.length === 0) return null;
  const ends = chapterEnds(sections, story.paragraphs.length);
  const read = sections.map((_, i) => finished || furthest >= ends[i]!);
  const done = read.filter(Boolean).length;
  const intro = sections[0]!.paragraph > 0;
  const number = (n: number): string => n.toLocaleString(locale);
  return (
    <nav className="story-contents" aria-labelledby="story-contents-title">
      <div className="story-contents-head">
        <h2 id="story-contents-title" className="story-section-title">
          {t('stories.chapters.title')}
        </h2>
        <p className="story-contents-count">{t('stories.chapters.read', { read: number(done), total: number(sections.length) })}</p>
      </div>
      <ol className="story-contents-bar" aria-hidden="true">
        {sections.map((s, i) => (
          <li key={s.paragraph} className={`${read[i] ? 'is-read' : ''}${current === i ? ' is-here' : ''}`} />
        ))}
      </ol>
      <ol className="story-contents-list">
        {intro && (
          <li>
            <button type="button" className={`story-contents-item is-intro${current === -1 && furthest >= 0 ? ' is-here' : ''}`} onClick={() => onJump(0)}>
              <span className="story-contents-n" aria-hidden="true" />
              <span className="story-contents-text">
                <span className="story-contents-name">{t('stories.chapters.intro')}</span>
              </span>
            </button>
          </li>
        )}
        {sections.map((s, i) => {
          const tr = translatedTitle(translation, s.paragraph);
          return (
            <li key={s.paragraph}>
              <button
                type="button"
                className={`story-contents-item${read[i] ? ' is-read' : ''}${current === i ? ' is-here' : ''}`}
                aria-current={current === i ? 'location' : undefined}
                onClick={() => onJump(s.paragraph)}
              >
                <span className="story-contents-n" aria-hidden="true">
                  {number(i + 1)}
                </span>
                <span className="story-contents-text">
                  <span className="sr-only">{t('stories.chapters.n', { n: i + 1 })}</span>
                  <span className="story-contents-name" lang={lang} dir={dir}>
                    {s.title}
                  </span>
                  {tr && (
                    <span className="story-contents-tr" lang={translation?.lang} dir={localeDir(translation?.lang ?? 'en')}>
                      {tr}
                    </span>
                  )}
                </span>
                {read[i] && (
                  <span className="story-contents-mark">
                    <CheckIcon size={14} />
                    <span className="sr-only">{t('stories.chapters.readMark')}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Where the reader is, and the way to any chapter, in the reader's tools that stay in reach while the text scrolls. */
export function ChapterPicker({ sections, current, onJump }: { sections: readonly StorySection[]; current: number; onJump: (paragraph: number) => void }): React.JSX.Element | null {
  const t = useT();
  if (sections.length === 0) return null;
  const intro = sections[0]!.paragraph > 0;
  const value = current === -1 && !intro ? 0 : current;
  return (
    <label className="story-chapter-pick">
      <span className="sr-only">{t('stories.chapters.go')}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const i = Number(e.target.value);
          onJump(i < 0 ? 0 : (sections[i]?.paragraph ?? 0));
        }}
      >
        {intro && <option value="-1">{t('stories.chapters.intro')}</option>}
        {sections.map((s, i) => (
          <option key={s.paragraph} value={String(i)}>
            {t('stories.chapters.option', { n: i + 1, title: s.title })}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * "Think about it": open questions to turn over after reading, in Kurdish
 * with the reader's language under each. Nothing is asked back, scored or
 * paid.
 */
export function Reflections({ story }: { story: Pick<StoryDetail, 'dialect' | 'reflections'> }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = storyTextDirection(story.dialect);
  if (story.reflections.length === 0) return null;
  const own = ownLocale(story.dialect);
  return (
    <section className="story-think" aria-labelledby="story-think-title">
      <h2 id="story-think-title" className="story-section-title">
        {t('stories.think.title')}
      </h2>
      <p className="story-think-lede">{t('stories.think.lede')}</p>
      <ol className="story-think-list">
        {story.reflections.map((r, i) => {
          const tr = inReaderLanguage(r.translations, locale, own);
          return (
            <li key={i} className="story-think-item">
              <p className="story-think-ku" lang={lang} dir={dir}>
                {r.text}
              </p>
              {tr && (
                <p className="story-think-tr" lang={tr.lang} dir={localeDir(tr.lang)}>
                  {tr.value}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const NOTE_KEY: Record<StoryNoteKind, MessageKey> = {
  history: 'stories.about.kind.history',
  legend: 'stories.about.kind.legend',
  versions: 'stories.about.kind.versions',
  culture: 'stories.about.kind.culture',
};

export const SOURCE_TYPE_KEY: Record<StorySourceType, MessageKey> = {
  historical: 'stories.source.type.historical',
  legendary: 'stories.source.type.legendary',
  oral: 'stories.source.type.oral',
  literary: 'stories.source.type.literary',
  adapted: 'stories.source.type.adapted',
};

/** A note's body as its paragraphs. */
function paragraphsOf(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Whether a story has anything for "About this story" beyond the one source line older stories name. */
export function hasAbout(story: Pick<StoryDetail, 'notes' | 'sources'>): boolean {
  return story.notes.length > 0 || story.sources.length > 0;
}

/**
 * "About this story", after reading: the notes — what is history and what is
 * legend, how the versions differ, what a custom means — each in the reader's
 * language with its Kurdish a tap away, then the sources the telling draws
 * on, each with what kind of source it is and a link where there is one. One
 * quiet column under a hairline, never a row of cards.
 */
export function AboutStory({ story }: { story: Pick<StoryDetail, 'dialect' | 'notes' | 'sources' | 'source' | 'sourceUrl' | 'attributionNote'> }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = storyTextDirection(story.dialect);
  if (!hasAbout(story)) return null;
  const own = ownLocale(story.dialect);
  return (
    <section className="story-about story-about-full" aria-labelledby="story-about-title">
      <h2 id="story-about-title" className="story-section-title">
        {t('stories.overview.aboutTitle')}
      </h2>
      {story.notes.map((note, i) => {
        const tr = inReaderLanguage(note.translations, locale, own);
        return (
          <article key={i} className="story-note" aria-labelledby={`story-note-${i}`}>
            <p className="story-note-kind">{t(NOTE_KEY[note.kind])}</p>
            {tr ? (
              <>
                <h3 id={`story-note-${i}`} className="story-note-title" lang={tr.lang} dir={localeDir(tr.lang)}>
                  {tr.value.title}
                </h3>
                {paragraphsOf(tr.value.body).map((para, j) => (
                  <p key={j} lang={tr.lang} dir={localeDir(tr.lang)}>
                    {para}
                  </p>
                ))}
                <details className="story-note-ku">
                  <summary>{t('stories.about.inKurdish')}</summary>
                  <p className="story-note-ku-title" lang={lang} dir={dir}>
                    {note.title}
                  </p>
                  {paragraphsOf(note.body).map((para, j) => (
                    <p key={j} lang={lang} dir={dir}>
                      {para}
                    </p>
                  ))}
                </details>
              </>
            ) : (
              <>
                <h3 id={`story-note-${i}`} className="story-note-title" lang={lang} dir={dir}>
                  {note.title}
                </h3>
                {paragraphsOf(note.body).map((para, j) => (
                  <p key={j} lang={lang} dir={dir}>
                    {para}
                  </p>
                ))}
              </>
            )}
          </article>
        );
      })}
      {story.attributionNote && <p className="story-note-attribution">{story.attributionNote}</p>}
      {(story.sources.length > 0 || story.source) && (
        <div className="story-sources">
          <h3 className="story-sources-title">{t('stories.sources.title')}</h3>
          <ul className="story-source-list">
            {story.source && (
              <li className="story-source">
                <span className="story-source-name" dir="auto">
                  {story.sourceUrl ? (
                    <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {story.source}
                    </a>
                  ) : (
                    story.source
                  )}
                </span>
              </li>
            )}
            {story.sources.map((s, i) => (
              <li key={i} className="story-source">
                <span className="story-source-type">{t(SOURCE_TYPE_KEY[s.type])}</span>
                <span className="story-source-name" dir="auto">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </span>
                {s.author && (
                  <span className="story-source-author" dir="auto">
                    {s.author}
                  </span>
                )}
                {s.note && (
                  <span className="story-source-note" dir="auto">
                    {s.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
