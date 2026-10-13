import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  glossFor,
  glossSpans,
  storySentences,
  storyTextDirection,
  type StoryDialect,
  type StoryGlossEntry,
} from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import { PlayIcon } from '../components/icons';
import { useMediaQuery } from '../lib/useMediaQuery';
import { TEXT_SIZES } from './prefs';
import type { StoryAudio } from './useStoryAudio';

/** Where an answer is in the text, to show it marked. */
export interface Evidence {
  paragraph: number;
  sentence: number | null;
}

/** One run of a paragraph: plain text, or a word from the glossary. */
type Piece = { text: string; gloss?: StoryGlossEntry };

interface Sentence {
  index: number;
  /** the whitespace before it, kept so the paragraph reads as written */
  lead: string;
  pieces: Piece[];
}

/**
 * A paragraph cut into its sentences (the cuts the studio records by, so a
 * sentence and its recording line up), each with its glossary words marked —
 * the first time each word appears in the paragraph (`glossSpans`), and only
 * where it sits inside one sentence.
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
    out.push({ index, lead: text.slice(cursor, start), pieces });
    cursor = end;
  });
  return out;
}

/**
 * A story's text, as the reader and the game show it.
 *
 * Every string from the story carries the story's own `lang` and `dir` — a
 * Soranî story reads right to left inside an English page, in a face made for
 * Arabic script, and a screen reader speaks it as Kurdish. Words from the
 * glossary are buttons that open their meaning (in the reader's language,
 * else English, marked as English); "Words in this story" lists the same
 * meanings for anyone who would rather not hunt for them.
 *
 * Nothing plays by touching the text. A paragraph with recordings has its own
 * Listen button, and the sentence being read is marked and kept in view.
 */
export function StoryText({
  paragraphs,
  glossary,
  dialect,
  textSize,
  audio,
  evidence,
  className,
}: {
  paragraphs: readonly string[];
  glossary: readonly StoryGlossEntry[];
  dialect: StoryDialect;
  /** a step of TEXT_SIZES */
  textSize: number;
  /** read aloud; leave out where the text is only to look back at */
  audio?: StoryAudio;
  /** the sentence (or paragraph) an answer comes from, marked */
  evidence?: Evidence | null;
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const { lang, dir } = storyTextDirection(dialect);
  const cut = useMemo(() => paragraphs.map((p) => paragraphSentences(p, glossary)), [paragraphs, glossary]);
  const [open, setOpen] = useState<{ key: string; entry: StoryGlossEntry; anchor: HTMLElement } | null>(null);
  const reading = useRef<HTMLSpanElement | null>(null);
  const marked = useRef<HTMLElement | null>(null);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const current = audio?.current ?? null;

  // the sentence being read stays in view; under reduced motion it jumps rather than glides
  useEffect(() => {
    if (current && reading.current) {
      reading.current.scrollIntoView?.({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    }
  }, [current?.paragraph, current?.sentence, calm]);

  // the evidence for an answer is brought into view when it changes
  useEffect(() => {
    if (evidence && marked.current) marked.current.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }, [evidence?.paragraph, evidence?.sentence, calm]);

  return (
    <div
      className={`story-text${className ? ` ${className}` : ''}`}
      style={{ '--story-size': `${TEXT_SIZES[textSize] ?? 1}rem` } as React.CSSProperties}
    >
      {cut.map((sentences, p) => {
        const hasAudio = audio?.paragraphsWithAudio.has(p) ?? false;
        const thisPlaying = audio?.playing && audio.scope?.kind === 'paragraph' && audio.scope.paragraph === p;
        const wholeParagraph = evidence?.paragraph === p && evidence.sentence === null;
        return (
          <div className="story-para" key={p} dir={dir}>
            <p
              lang={lang}
              className={wholeParagraph ? 'is-evidence' : undefined}
              ref={wholeParagraph ? (el) => void (marked.current = el) : undefined}
            >
              {sentences.map((s) => {
                const isReading = current?.paragraph === p && current.sentence === s.index;
                const isEvidence = evidence?.paragraph === p && evidence.sentence === s.index;
                return (
                  <span key={s.index}>
                    {s.lead}
                    <span
                      className={`story-sentence${isReading ? ' is-reading' : ''}${isEvidence ? ' is-evidence' : ''}`}
                      ref={(el) => {
                        if (isReading) reading.current = el;
                        if (isEvidence) marked.current = el;
                      }}
                    >
                      {s.pieces.map((piece, i) =>
                        piece.gloss ? (
                          <GlossWord
                            key={i}
                            text={piece.text}
                            entry={piece.gloss}
                            expanded={open?.key === `${p}:${s.index}:${i}`}
                            onOpen={(anchor) => setOpen({ key: `${p}:${s.index}:${i}`, entry: piece.gloss!, anchor })}
                          />
                        ) : (
                          <span key={i}>{piece.text}</span>
                        ),
                      )}
                    </span>
                  </span>
                );
              })}
            </p>
            {audio && hasAudio && (
              <button
                type="button"
                className={`story-listen${thisPlaying ? ' is-on' : ''}`}
                aria-pressed={thisPlaying}
                onClick={() => (thisPlaying ? audio.halt() : audio.playParagraph(p))}
              >
                <PlayIcon size={14} />
                {thisPlaying ? t('stories.reader.stop') : t('stories.reader.listen')}
              </button>
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
      // the word itself is the label; "has popup, collapsed" says what pressing it does
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
 * The meaning of a glossary word, beside the word. Escape, a click elsewhere
 * or the close button shuts it and hands focus back to the word.
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
      <span className="story-gloss-term" id={id} lang={lang} dir={dir}>
        {entry.term}
      </span>
      <span className="story-gloss-meaning" lang={meaning.lang} dir={meaning.lang === 'en' ? 'ltr' : undefined}>
        {meaning.text}
      </span>
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
    </div>
  );
}

/** "Words in this story": every glossary word with its meaning — the way to them that needs no hunting. */
export function StoryWords({ glossary, dialect }: { glossary: readonly StoryGlossEntry[]; dialect: StoryDialect }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = storyTextDirection(dialect);
  if (glossary.length === 0) return null;
  return (
    <section className="story-words" aria-labelledby="story-words-title">
      <h2 id="story-words-title" className="story-section-title">
        {t('stories.reader.words')}
      </h2>
      <dl>
        {glossary.map((g) => {
          const meaning = glossFor(g, locale);
          return (
            <div key={g.term} className="story-word">
              <dt lang={lang} dir={dir}>
                {g.term}
              </dt>
              <dd lang={meaning.lang} dir={meaning.lang === 'en' ? 'ltr' : undefined}>
                {meaning.text}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
