import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  glossFor,
  glossSpans,
  storyHeadingTitle,
  storySentences,
  storyTextDirection,
  type StoryDialect,
  type StoryGlossEntry,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useOptimistic } from '../lib/optimistic';
import { saveWord, saveWordError, unsaveWord } from '../dictionary/save';
import { useLocale, useT } from '../i18n/I18nProvider';
import { BookmarkIcon, PlayIcon, SpeakerIcon, StopIcon, WaveformIcon } from '../components/icons';
import { play } from '../lib/sound';
import { useMediaQuery } from '../lib/useMediaQuery';
import { TEXT_SIZES } from './prefs';
import type { StoryAudio } from './useStoryAudio';

/** One run of a paragraph: plain text, or a glossary word with the quote or comma touching it, so a line never breaks between them. */
type Piece = { text: string; gloss?: StoryGlossEntry; lead?: string; trail?: string };

interface Sentence {
  index: number;
  /** The whitespace before it, kept so the paragraph reads as written. */
  lead: string;
  pieces: Piece[];
}

/**
 * A paragraph cut into sentences (the cuts recordings are made by, so they line up), with glossary words marked the
 * first time each appears (`glossSpans`), and only within one sentence.
 */
export function paragraphSentences(paragraph: string, glossary: readonly StoryGlossEntry[]): Sentence[] {
  const text = paragraph.normalize('NFC');
  const spans = glossSpans(text, glossary);
  const out: Sentence[] = [];
  let cursor = 0;
  storySentences(text).forEach((sentence, index) => {
    const start = text.indexOf(sentence, cursor);
    if (start < 0) return;
    const end = start + sentence.length;
    const pieces: Piece[] = [];
    let at = start;
    for (const span of spans) {
      if (span.start < start || span.end > end) continue;
      if (span.start > at) pieces.push({ text: text.slice(at, span.start) });
      pieces.push({ text: text.slice(span.start, span.end), gloss: span.entry });
      at = span.end;
    }
    if (at < end) pieces.push({ text: text.slice(at, end) });
    // The characters glued to a glossary word go with it.
    pieces.forEach((piece, i) => {
      if (!piece.gloss) return;
      const before = pieces[i - 1];
      const after = pieces[i + 1];
      if (before && !before.gloss) {
        const glued = /\S+$/.exec(before.text)?.[0] ?? '';
        piece.lead = glued;
        before.text = before.text.slice(0, before.text.length - glued.length);
      }
      if (after && !after.gloss) {
        const glued = /^\S+/.exec(after.text)?.[0] ?? '';
        piece.trail = glued;
        after.text = after.text.slice(glued.length);
      }
    });
    out.push({ index, lead: text.slice(cursor, start), pieces });
    cursor = end;
  });
  return out;
}

/** How much of the screen's top bar and docked player a sentence must clear to count as in sight. */
const IN_SIGHT = { top: 96, bottom: 168 } as const;

/**
 * A story's text as the reader and the game show it. Every string carries the story's `lang` and `dir`, so a Soranî
 * story reads right to left in an Arabic-script face inside any page. Glossary words have a dotted violet line and open
 * their meaning, part of speech, pronunciation and Save word. Only the sentence being read aloud responds to a tap (and
 * a small button), replaying itself. Paragraphs with recordings have a Listen button, and a Translation toggle when the
 * reader's language has one. `observe` hands each paragraph's element to the reading-progress watcher.
 */
export function StoryText({
  paragraphs,
  glossary,
  dialect,
  textSize,
  audio,
  translations,
  observe,
  className,
}: {
  paragraphs: readonly string[];
  glossary: readonly StoryGlossEntry[];
  dialect: StoryDialect;
  /** A step of TEXT_SIZES. */
  textSize: number;
  /** Read aloud; leave out where the text is only for looking back. */
  audio?: StoryAudio;
  /** The translation into the reader's language (or English), one entry per paragraph; none shows no toggle. */
  translations?: { lang: string; paragraphs: readonly string[] } | null;
  /** A ref for each paragraph, for the reading-progress watcher. */
  observe?: (index: number) => (el: HTMLElement | null) => void;
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = storyTextDirection(dialect);
  const cut = useMemo(() => paragraphs.map((p) => paragraphSentences(p, glossary)), [paragraphs, glossary]);
  const [open, setOpen] = useState<{ key: string; entry: StoryGlossEntry; anchor: HTMLElement } | null>(null);
  const [shownTranslations, setShownTranslations] = useState<ReadonlySet<number>>(() => new Set());
  const reading = useRef<HTMLSpanElement | null>(null);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const current = audio?.current ?? null;

  /*
   * Keeps the sentence being read in view: untouched while it is clear of the top bar and the docked player, otherwise
   * scrolled to the middle of the screen. It jumps under reduced motion.
   */
  useEffect(() => {
    const el = reading.current;
    if (!current || !el) return;
    const box = el.getBoundingClientRect();
    const clearOfBar = box.top >= IN_SIGHT.top;
    const clearOfPlayer = box.bottom <= window.innerHeight - IN_SIGHT.bottom;
    if (box.height > 0 && clearOfBar && clearOfPlayer) return;
    el.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }, [current?.paragraph, current?.sentence, calm]);

  // A legend's chapters: each heading's place and number, and where the introduction ends.
  const chapters = useMemo(() => {
    const at = new Map<number, number>();
    paragraphs.forEach((paragraph, i) => {
      if (storyHeadingTitle(paragraph) !== null) at.set(i, at.size + 1);
    });
    const first = at.size > 0 ? Math.min(...at.keys()) : 0;
    return { at, introEnd: first };
  }, [paragraphs]);

  const toggleTranslation = (p: number): void =>
    setShownTranslations((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  return (
    <div
      className={`story-text hue-violet${className ? ` ${className}` : ''}`}
      style={{ '--story-size': `${TEXT_SIZES[textSize] ?? 1}` } as React.CSSProperties}
    >
      {cut.map((sentences, p) => {
        const heading = storyHeadingTitle(paragraphs[p] ?? '');
        if (heading !== null) {
          // A chapter title is never tapped, glossed or heard, and its translation sits beside it, except when the
          // reader's language is the story's own.
          const translated = locale === lang ? null : storyHeadingTitle(translations?.paragraphs[p] ?? '');
          return (
            <div className="story-para story-chapter" key={p} dir={dir} ref={observe?.(p)} data-paragraph={p} data-chapter={chapters.at.get(p)}>
              <p className="story-chapter-n">{t('stories.chapters.n', { n: chapters.at.get(p) ?? 1 })}</p>
              <h2 className="story-chapter-title" lang={lang}>
                {heading}
              </h2>
              {translated && translations && (
                <p className="story-chapter-tr" lang={translations.lang} dir={translations.lang === 'ar' || translations.lang === 'ckb' ? 'rtl' : 'ltr'}>
                  {translated}
                </p>
              )}
            </div>
          );
        }
        const intro = p < chapters.introEnd;
        const hasAudio = audio?.paragraphsWithAudio.has(p) ?? false;
        const thisPlaying = audio?.playing && audio.scope?.kind === 'paragraph' && audio.scope.paragraph === p;
        const translation = translations?.paragraphs[p];
        const translated = translation !== undefined && translation.trim() !== '';
        const showTranslation = translated && shownTranslations.has(p);
        return (
          <div className={`story-para${intro ? ' is-intro' : ''}`} key={p} dir={dir} ref={observe?.(p)} data-paragraph={p}>
            {intro && p === 0 && <p className="story-intro-label">{t('stories.chapters.intro')}</p>}
            <p lang={lang}>
              {sentences.map((s) => {
                const isReading = current?.paragraph === p && current.sentence === s.index;
                return (
                  <span key={s.index}>
                    {s.lead}
                    <span
                      className={`story-sentence${isReading ? ' is-reading' : ''}`}
                      ref={(el) => {
                        if (isReading) reading.current = el;
                      }}
                      onClick={
                        isReading && audio
                          ? (e) => {
                              // A tap on the band replays the sentence; a tap on a word in it opens the word.
                              if ((e.target as HTMLElement).closest('.story-gloss')) return;
                              audio.replay();
                            }
                          : undefined
                      }
                    >
                      {s.pieces.map((piece, i) =>
                        piece.gloss ? (
                          <span key={i} className="story-gloss-hold">
                            {piece.lead}
                            <GlossWord
                              text={piece.text}
                              entry={piece.gloss}
                              expanded={open?.key === `${p}:${s.index}:${i}`}
                              onOpen={(anchor) => setOpen({ key: `${p}:${s.index}:${i}`, entry: piece.gloss!, anchor })}
                            />
                            {piece.trail}
                          </span>
                        ) : (
                          <span key={i}>{piece.text}</span>
                        ),
                      )}
                    </span>
                    {isReading && audio && (
                      <button type="button" className="story-replay" onClick={audio.replay} aria-label={t('stories.reader.replay')}>
                        <SpeakerIcon size={14} />
                      </button>
                    )}
                  </span>
                );
              })}
            </p>
            {(hasAudio || translated) && (
              <div className="story-para-tools">
                {audio && hasAudio && (
                  <button
                    type="button"
                    className={`story-listen${thisPlaying ? ' is-on' : ''}`}
                    aria-pressed={thisPlaying}
                    onClick={() => (thisPlaying ? audio.halt() : audio.playParagraph(p))}
                  >
                    {thisPlaying ? <StopIcon size={14} /> : <PlayIcon size={14} />}
                    {thisPlaying ? t('stories.reader.stop') : t('stories.reader.listen')}
                  </button>
                )}
                {translated && (
                  <button
                    type="button"
                    className={`story-listen story-translate${showTranslation ? ' is-on' : ''}`}
                    aria-expanded={showTranslation}
                    aria-controls={`story-translation-${p}`}
                    onClick={() => toggleTranslation(p)}
                  >
                    {showTranslation ? t('stories.reader.hideTranslation') : t('stories.reader.translation')}
                  </button>
                )}
              </div>
            )}
            {showTranslation && translations && (
              <p id={`story-translation-${p}`} className="story-translation" lang={translations.lang} dir={translations.lang === 'ar' || translations.lang === 'ckb' ? 'rtl' : 'ltr'}>
                {translation}
              </p>
            )}
          </div>
        );
      })}
      {open && <GlossPopover entry={open.entry} anchor={open.anchor} dialect={dialect} onClose={() => setOpen(null)} />}
    </div>
  );
}

function GlossWord({
  text,
  entry,
  expanded,
  onOpen,
}: {
  text: string;
  entry: StoryGlossEntry;
  expanded: boolean;
  onOpen: (anchor: HTMLElement) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="story-gloss"
      // The word is the label; "has popup, collapsed" says what pressing it does.
      aria-expanded={expanded}
      aria-haspopup="dialog"
      data-term={entry.term}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      {text}
    </button>
  );
}

/**
 * Save word / Saved for a glossary term that is a dictionary headword. It fills at once and reverts with the reason on
 * a refusal (a full vocabulary names its limit). Signed-in readers only.
 */
export function SaveWordButton({ entryId, className }: { entryId: string; className?: string }): React.JSX.Element | null {
  const t = useT();
  const { client, status } = useAuth();
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, want] = useOptimistic(false, (on) => (on ? saveWord(client, entryId) : unsaveWord(client, entryId)), {
    onFailed: (error) => setProblem(saveWordError(error, t)),
  });
  if (status !== 'signedIn') return null;
  const toggle = (): void => {
    setProblem(null);
    want((on) => !on);
  };
  return (
    <>
      <button type="button" className={`story-save${saved ? ' is-on' : ''}${className ? ` ${className}` : ''}`} aria-pressed={saved} onClick={toggle}>
        <BookmarkIcon size={14} weight={saved ? 'fill' : 'regular'} className={saved ? 'saved-mark' : undefined} />
        {saved ? t('stories.reader.savedWord') : t('stories.reader.saveWord')}
      </button>
      {problem && (
        <span className="story-save-problem" role="alert">
          {problem}
        </span>
      )}
    </>
  );
}

/** A pronunciation from the dictionary, played through the app's one player. */
export function PlayWordButton({ url }: { url: string }): React.JSX.Element {
  const t = useT();
  return (
    <button type="button" className="story-play-word" onClick={() => play(url)} aria-label={t('dictionary.playPronunciation')}>
      <WaveformIcon size={16} />
    </button>
  );
}

/**
 * A glossary word's meaning beside it: the word, its part of speech, the meaning, a play button and Save word where the
 * dictionary has them. Escape, an outside click or close shuts it and returns focus to the word.
 */
function GlossPopover({
  entry,
  anchor,
  dialect,
  onClose,
}: {
  entry: StoryGlossEntry;
  anchor: HTMLElement;
  dialect: StoryDialect;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const meaning = glossFor(entry, locale);
  const { lang, dir } = storyTextDirection(dialect);

  useLayoutEffect(() => {
    const place = (): void => {
      const box = anchor.getBoundingClientRect();
      const panel = ref.current;
      const width = panel?.offsetWidth ?? 240;
      const height = panel?.offsetHeight ?? 80;
      const margin = 12;
      const left = Math.min(Math.max(box.left + box.width / 2 - width / 2, margin), window.innerWidth - width - margin);
      const below = box.bottom + 8;
      const top = below + height > window.innerHeight - margin ? Math.max(box.top - height - 8, margin) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        anchor.focus();
      }
    };
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node) && e.target !== anchor) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      className="story-gloss-pop"
      role="dialog"
      aria-labelledby={id}
      tabIndex={-1}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
    >
      <span className="story-gloss-head">
        <span className="story-gloss-term" id={id} lang={lang} dir={dir}>
          {entry.term}
        </span>
        {entry.pos && <span className="story-gloss-pos">{entry.pos}</span>}
        {entry.audioUrl && <PlayWordButton url={entry.audioUrl} />}
      </span>
      <span className="story-gloss-meaning" lang={meaning.lang} dir={meaning.lang === 'en' ? 'ltr' : undefined}>
        {meaning.text}
      </span>
      <span className="story-gloss-foot">
        {entry.entryId && <SaveWordButton entryId={entry.entryId} />}
        <button
          type="button"
          className="story-gloss-close"
          onClick={() => {
            onClose();
            anchor.focus();
          }}
        >
          {t('common.close')}
        </button>
      </span>
    </div>
  );
}
