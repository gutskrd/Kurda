import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PromptToken } from '@kurda/shared';
import { SpeakerIcon } from '../components/icons';
import { onPlaying, play } from '../lib/sound';
import { useAutoplay } from './useAutoplay';
import { useT } from '../i18n/I18nProvider';
import { lineTokens, type LineToken } from './asks';

/**
 * A speech bubble for what an exercise asks, its tail pointing to the start side where the character chosen for its
 * recording stands (`ExerciseVoice`); with nobody, it stands alone.
 */
export function Bubble({ className, children }: { className?: string; children: React.ReactNode }): React.JSX.Element {
  return <div className={`lesson-bubble${className ? ` ${className}` : ''}`}>{children}</div>;
}

/**
 * An item's question as a whole (`promptTokens`), for items that do not say what they ask: it may be English around
 * Kurdish, so only the words something is known of open on a tap, click or Enter, and close on Escape, an outside tap
 * or a second tap; one is open at a time. With none, it is plain text.
 */
export function PromptWords({ text, tokens }: { text: string | undefined; tokens?: PromptToken[] }): React.JSX.Element | null {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  const toggle = useCallback((i: number, on: boolean) => setOpen((now) => (on ? i : now === i ? null : now)), []);
  const words = useMemo(() => lineTokens(text ?? '', tokens, undefined), [text, tokens]);
  if (!text) return null;
  if (!words.some(explained))
    return (
      <p className="lesson-prompt" dir="auto">
        {text}
      </p>
    );
  return (
    <div className="lesson-prompt" dir="auto">
      {words.map((token, i) =>
        explained(token) ? <Word key={i} index={i} id={`${base}-w${i}`} token={token} open={open === i} onToggle={toggle} /> : <span key={i}>{token.text}</span>,
      )}
    </div>
  );
}

/** A word something is known of: its meanings, or that they wait for the answer. */
const explained = (token: LineToken): boolean => !!token.word && (!!token.meanings?.length || !!token.withheld);

/**
 * A conversation's line as words a tap explains, as the prompt's are (`PromptWords`), in the course's Kurdish.
 */
export function SaidWords({ text, tokens, lang, dir }: { text: string; tokens?: PromptToken[] | null; lang?: string; dir: 'ltr' | 'rtl' }): React.JSX.Element {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  const toggle = useCallback((i: number, on: boolean) => setOpen((now) => (on ? i : now === i ? null : now)), []);
  const words = useMemo(() => lineTokens(text, tokens, undefined), [text, tokens]);
  return (
    <span className="lesson-line-text" lang={lang} dir={dir}>
      {words.map((token, i) =>
        token.word ? <Word key={i} index={i} id={`${base}-w${i}`} token={token} open={open === i} onToggle={toggle} /> : <span key={i}>{token.text}</span>,
      )}
    </span>
  );
}

/** What a missing-word gap holds: nothing yet, or the word chosen or typed and how it was graded. */
export interface GapFill {
  text: string;
  verdict: 'right' | 'wrong' | null;
}

/**
 * An item's line alone in its bubble (`lineTokens`): a Kurdish line in the display face with glossed words, new ones
 * underlined more strongly; an English line in the plain face. A missing word's gap is a word-wide slot holding the
 * answer as it is given (`gap`), so the sentence reads whole before Check.
 */
export function LineWords({
  tokens,
  english,
  lang,
  dir,
  big = false,
  gap,
}: {
  tokens: readonly LineToken[];
  english: boolean;
  /** The course's Kurdish, for a Kurdish line. */
  lang?: string;
  dir: 'ltr' | 'rtl';
  /** A single word to name (a picture item's), larger still. */
  big?: boolean;
  gap?: GapFill;
}): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  const toggle = useCallback((i: number, on: boolean) => setOpen((now) => (on ? i : now === i ? null : now)), []);
  return (
    <div
      className={`lesson-prompt lesson-line-text${english ? ' is-english' : ''}${big ? ' is-big' : ''}`}
      lang={english ? undefined : lang}
      dir={english ? 'auto' : dir}
    >
      {tokens.map((token, i) =>
        token.gap ? (
          <span key={i} className={`lesson-gap${gap?.text ? ' is-filled' : ''}${gap?.verdict ? ` is-${gap.verdict}` : ''}`}>
            {gap?.text ? gap.text : <span className="sr-only">{t('lesson.ask.gap')}</span>}
          </span>
        ) : token.word && (!english || explained(token)) ? (
          // Every Kurdish word opens; an English line's open where there is Kurdish for them, which takes the course's face.
          <Word key={i} index={i} id={`${base}-w${i}`} token={token} meaningLang={english ? lang : undefined} open={open === i} onToggle={toggle} />
        ) : (
          <span key={i}>{token.text}</span>
        ),
      )}
    </div>
  );
}

/**
 * A line's recording at the start of its bubble: a round red play button, with a 0.75× chip under it (`PlayButton`).
 * `auto` plays it by itself as the exercise appears (`useAutoplay`).
 */
export function LinePlay({ src, auto = false }: { src: string; auto?: boolean }): React.JSX.Element {
  const t = useT();
  useAutoplay(src, auto);
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => onPlaying((now, speed) => setRate(now === src ? speed : null)), [src]);
  const label = t('lesson.listen.slow');
  return (
    <span className="lesson-line-play">
      <button
        type="button"
        className={`lesson-play lesson-play-round${rate === 1 ? ' is-on' : ''}`}
        aria-label={t('lesson.hear')}
        title={t('lesson.hear')}
        onClick={() => play(src)}
      >
        <SpeakerIcon size={22} />
      </button>
      <button type="button" className={`lesson-slow-chip${rate === 0.75 ? ' is-on' : ''}`} aria-label={label} title={label} onClick={() => play(src, 0.75)}>
        0.75×
      </button>
    </span>
  );
}

/** How close a word's meanings may come to the window's edge. */
const EDGE = 8;

/**
 * One word of a line and, open, what is known of it: its meanings and the word an inflected form comes from; or that its
 * meaning waits because it would give the answer away; or that the course has none for it yet.
 */
function Word({
  index,
  id,
  token,
  meaningLang,
  open,
  onToggle,
}: {
  index: number;
  id: string;
  token: LineToken;
  /** The language the meanings are in, when it is not the interface's (Kurdish, for an English line). */
  meaningLang?: string;
  open: boolean;
  onToggle: (index: number, on: boolean) => void;
}): React.JSX.Element {
  const t = useT();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const { text, meanings, base, withheld, isNew = false } = token;
  const label = t('lesson.words.meaningsOf', { word: text });

  // Escape closes them before the lesson takes it as "leave"; so does a tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onToggle(index, false);
      button.current?.focus({ preventScroll: true });
    };
    const onDown = (e: Event): void => {
      if (!wrap.current?.contains(e.target as Node)) onToggle(index, false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, index, onToggle]);

  // Centred under the word and kept inside the window, the arrow still on the word.
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    const box = el.getBoundingClientRect();
    const room = document.documentElement.clientWidth;
    const shift = box.left < EDGE ? EDGE - box.left : box.right > room - EDGE ? room - EDGE - box.right : 0;
    if (shift) el.style.setProperty('--shift', `${Math.round(shift)}px`);
  }, [open]);

  const known = !!meanings?.length;
  return (
    <span className="lesson-word-wrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={`lesson-word${isNew ? ' is-new' : ''}${open ? ' is-open' : ''}`}
        // Named by the word itself, so a line of them still reads as the sentence; its list says what it is.
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => onToggle(index, !open)}
      >
        {text}
      </button>
      {open && (
        <span id={id} ref={pop} className="lesson-meanings" role="list" aria-label={label}>
          {known ? (
            meanings.map((meaning, i) => (
              <span key={i} role="listitem" className="lesson-meaning" lang={meaningLang} dir="auto">
                {meaning}
              </span>
            ))
          ) : (
            <span role="listitem" className="lesson-meaning is-note">
              {t(withheld ? 'lesson.words.withheld' : 'lesson.words.none')}
            </span>
          )}
          {known && base && (
            <span role="listitem" className="lesson-meaning is-base">
              {t('lesson.words.from', { word: base })}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** The waveform's bars, tallest mid-phrase, in tenths of the bubble's height. */
const WAVE = [2, 4, 3, 6, 9, 5, 8, 10, 7, 4, 8, 9, 5, 3, 2];

/** Listening's bubble: a speaker and a waveform that moves while playing (still under reduced motion); "Slower" plays at 0.75×. */
export function SoundBubble({ src, label }: { src: string; label: string }): React.JSX.Element {
  const t = useT();
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => onPlaying((now, speed) => setRate(now === src ? speed : null)), [src]);
  return (
    <div className="lesson-sound">
      <Bubble className="is-sound">
        <button type="button" className={`lesson-sound-play${rate !== null ? ' is-on' : ''}`} aria-label={label} onClick={() => play(src)}>
          <SpeakerIcon size={30} weight="fill" />
          <span className="lesson-wave" aria-hidden="true">
            {WAVE.map((h, i) => (
              <span key={i} style={{ '--h': h, '--i': i } as React.CSSProperties} />
            ))}
          </span>
        </button>
      </Bubble>
      <button type="button" className={`lesson-slow${rate === 0.75 ? ' is-on' : ''}`} onClick={() => play(src, 0.75)}>
        {t('lesson.listen.slow')}
      </button>
    </div>
  );
}
