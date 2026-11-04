import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  glossFor,
  glossSpans,
  storySentences,
  storyTextDirection,
  type StoryDialect,
  type StoryGlossEntry,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { saveWord, saveWordError, unsaveWord } from '../dictionary/save';
import { useLocale, useT } from '../i18n/I18nProvider';
import { BookmarkIcon, PlayIcon, SpeakerIcon, StopIcon, WaveformIcon } from '../components/icons';
import { play } from '../lib/sound';
import { useMediaQuery } from '../lib/useMediaQuery';
import { TEXT_SIZES } from './prefs';
import type { StoryAudio } from './useStoryAudio';

/** Where an answer is in the text, to show it marked. */
export interface Evidence {
  paragraph: number;
  sentence: number | null;
}

/**
 * One run of a paragraph: plain text, or a word from the glossary — with the
 * quote or comma that touches it, so a line never breaks between “ and the
 * word (a button is laid out as a block of its own, and would let it).
 */
type Piece = { text: string; gloss?: StoryGlossEntry; lead?: string; trail?: string };

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
    // the characters glued to a glossary word go with it
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

/** How much of the screen's top (the app's bar) and foot (the docked player) a sentence must clear to count as in sight. */
const IN_SIGHT = { top: 96, bottom: 168 } as const;

/**
 * A story's text, as the reader and the game show it.
 *
 * Every string from the story carries the story's own `lang` and `dir` — a
 * Soranî story reads right to left inside an English page, in a face made for
 * Arabic script, and a screen reader speaks it as Kurdish. Words from the
 * glossary are marked with a dotted gold line and open their meaning (in the
 * reader's language, else English, marked as English), the part of speech
 * and a pronunciation when the dictionary has them, and Save word when the
 * term is a dictionary headword.
 *
 * Nothing plays by touching the text, with one exception: the sentence being
 * read aloud, on its gold band, says itself again when tapped (the player's
 * replay), and carries a small button for the same so a keyboard can ask
 * too. A paragraph with recordings has its own Listen button, and under it,
 * when the story has a translation in the reader's language, a Translation
 * toggle that shows the paragraph's own translation in secondary ink.
 *
 * `observe` hands each paragraph's element to the reading-progress watcher.
 */
export function StoryText({
  paragraphs,
  glossary,
  dialect,
  textSize,
  audio,
  evidence,
  translations,
  observe,
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
  /** the story's translation into the reader's language (or English), one entry per paragraph; none shows no toggle */
  translations?: { lang: string; paragraphs: readonly string[] } | null;
  /** a ref for each paragraph, for the reading-progress watcher */
  observe?: (index: number) => (el: HTMLElement | null) => void;
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const { lang, dir } = storyTextDirection(dialect);
  const cut = useMemo(() => paragraphs.map((p) => paragraphSentences(p, glossary)), [paragraphs, glossary]);
  const [open, setOpen] = useState<{ key: string; entry: StoryGlossEntry; anchor: HTMLElement } | null>(null);
  const [shownTranslations, setShownTranslations] = useState<ReadonlySet<number>>(() => new Set());
  const reading = useRef<HTMLSpanElement | null>(null);
  const marked = useRef<HTMLElement | null>(null);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const current = audio?.current ?? null;

  /*
   * The sentence being read stays in view. While it is already in sight —
   * clear of the bar at the top and the player docked at the foot — the page
   * stays where the reader put it; once it leaves, it is brought to the middle
   * of the screen, where the next few lines are in sight too, rather than to
   * an edge the player would cover. Under reduced motion it jumps rather than
   * glides.
   */
  useEffect(() => {
    const el = reading.current;
    if (!current || !el) return;
    const box = el.getBoundingClientRect();
    const height = window.innerHeight;
    if (box.height > 0 && box.top >= IN_SIGHT.top && box.bottom <= height - IN_SIGHT.bottom) return;
    el.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }, [current?.paragraph, current?.sentence, calm]);

  // the evidence for an answer is brought into view when it changes
  useEffect(() => {
    if (evidence && marked.current) marked.current.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }, [evidence?.paragraph, evidence?.sentence, calm]);

  const toggleTranslation = (p: number): void =>
    setShownTranslations((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  return (
    <div
      className={`story-text${className ? ` ${className}` : ''}`}
      style={{ '--story-size': `${TEXT_SIZES[textSize] ?? 1}` } as React.CSSProperties}
    >
      {cut.map((sentences, p) => {
        const hasAudio = audio?.paragraphsWithAudio.has(p) ?? false;
        const thisPlaying = audio?.playing && audio.scope?.kind === 'paragraph' && audio.scope.paragraph === p;
        const wholeParagraph = evidence?.paragraph === p && evidence.sentence === null;
        const translation = translations?.paragraphs[p];
        const translated = translation !== undefined && translation.trim() !== '';
        const showTranslation = translated && shownTranslations.has(p);
        return (
          <div className="story-para" key={p} dir={dir} ref={observe?.(p)} data-paragraph={p}>
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
                      onClick={
                        isReading && audio
                          ? (e) => {
                              // a tap on the band says the sentence again; a tap on a word in it opens the word
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
 * Save word / Saved for a glossary term that is a dictionary headword, from
 * the popover and from the key vocabulary alike. The mark fills at once; a
 * refusal turns it back and says why — a full vocabulary names its limit.
 * Only for a signed-in reader: a visitor has no vocabulary to save into.
 */
export function SaveWordButton({ entryId, className }: { entryId: string; className?: string }): React.JSX.Element | null {
  const t = useT();
  const { client, status } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (status !== 'signedIn') return null;
  const toggle = async (): Promise<void> => {
    if (busy) return;
    const next = !saved;
    setSaved(next);
    setProblem(null);
    setBusy(true);
    const res = next ? await saveWord(client, entryId) : await unsaveWord(client, entryId);
    setBusy(false);
    if (res.ok) return;
    setSaved(!next);
    setProblem(saveWordError(res.error, t));
  };
  return (
    <>
      <button type="button" className={`story-save${saved ? ' is-on' : ''}${className ? ` ${className}` : ''}`} aria-pressed={saved} onClick={() => void toggle()}>
        <BookmarkIcon size={14} weight={saved ? 'fill' : 'regular'} />
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
 * The meaning of a glossary word, beside the word (design notes §3): the
 * word, its part of speech when the dictionary knows it, the meaning, a
 * play button when the dictionary has a recording, and Save word when the
 * term is a headword. Escape, a click elsewhere or the close button shuts it
 * and hands focus back to the word.
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
