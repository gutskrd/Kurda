import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { PromptToken } from '@kurda/shared';
import { SpeakerIcon } from '../components/icons';
import { onPlaying, play } from '../lib/sound';
import { useT } from '../i18n/I18nProvider';
import type { LineToken } from './asks';

/**
 * A speech bubble: what an exercise asks, said by the character standing
 * beside it when one was chosen for its recording (`ExerciseVoice`), its tail
 * pointing to where they stand — the start side, whichever way the page
 * reads. With nobody chosen it stands alone, tail and all.
 */
export function Bubble({ className, children }: { className?: string; children: React.ReactNode }): React.JSX.Element {
  return <div className={`lesson-bubble${className ? ` ${className}` : ''}`}>{children}</div>;
}

/**
 * The prompt, its words a tap away from what they mean (`promptTokens`): a
 * word the course knows is underlined with dots, and a tap, a click or Enter
 * on it opens its meanings under it. Escape, a tap anywhere else or a second
 * tap closes them; one is open at a time. Tokens that do not add up to the
 * prompt are not trusted, and the prompt is shown as it is.
 */
export function PromptWords({ text, tokens }: { text: string | undefined; tokens?: PromptToken[] }): React.JSX.Element | null {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  const toggle = useCallback((i: number, on: boolean) => setOpen((now) => (on ? i : now === i ? null : now)), []);
  if (!text) return null;
  const known = !!tokens && tokens.some((token) => !!token.meanings?.length) && tokens.map((token) => token.text).join('') === text;
  if (!known)
    return (
      <p className="lesson-prompt" dir="auto">
        {text}
      </p>
    );
  return (
    <div className="lesson-prompt" dir="auto">
      {tokens.map((token, i) =>
        token.meanings?.length ? (
          <Word key={i} index={i} id={`${base}-w${i}`} text={token.text} meanings={token.meanings} open={open === i} onToggle={toggle} />
        ) : (
          <span key={i}>{token.text}</span>
        ),
      )}
    </div>
  );
}

/** What a missing-word item's gap holds: nothing yet, the word chosen or typed, and how that word was graded. */
export interface GapFill {
  text: string;
  verdict: 'right' | 'wrong' | null;
}

/**
 * An item's line, alone in its bubble (`lineTokens`): a Kurdish line in the
 * display face, each word the course knows a tap away from its meanings and a
 * word the item brings in underlined a little more strongly; an English line
 * in the plain face. A missing-word item's gap is a slot the width of a word,
 * which holds the word chosen or typed as the learner answers (`gap`), so the
 * sentence is read whole before Check.
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
  /** the course's Kurdish, for a Kurdish line */
  lang?: string;
  dir: 'ltr' | 'rtl';
  /** a single word to name (a picture item's): larger still */
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
        ) : token.meanings?.length ? (
          <Word key={i} index={i} id={`${base}-w${i}`} text={token.text} meanings={token.meanings} isNew={token.isNew} open={open === i} onToggle={toggle} />
        ) : (
          <span key={i}>{token.text}</span>
        ),
      )}
    </div>
  );
}

/**
 * The native recording of a line, at the start of its bubble: the speaker in a
 * round red button, and under it the same recording at 0.75× in a small chip,
 * each lit while it plays (`PlayButton`).
 */
export function LinePlay({ src }: { src: string }): React.JSX.Element {
  const t = useT();
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

/** How near the window's edge a word's meanings may come. */
const EDGE = 8;

function Word({
  index,
  id,
  text,
  meanings,
  open,
  onToggle,
  isNew = false,
}: {
  index: number;
  id: string;
  text: string;
  meanings: string[];
  open: boolean;
  onToggle: (index: number, on: boolean) => void;
  /** a word the item brings in: its underline a little stronger */
  isNew?: boolean;
}): React.JSX.Element {
  const t = useT();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const label = t('lesson.words.meaningsOf', { word: text });

  // Escape closes them before the lesson hears it as "leave"; so does a tap anywhere else
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

  // centred under the word, and moved along to stay inside the window, its arrow still on the word
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    const box = el.getBoundingClientRect();
    const room = document.documentElement.clientWidth;
    const shift = box.left < EDGE ? EDGE - box.left : box.right > room - EDGE ? room - EDGE - box.right : 0;
    if (shift) el.style.setProperty('--shift', `${Math.round(shift)}px`);
  }, [open]);

  return (
    <span className="lesson-word-wrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={`lesson-word${isNew ? ' is-new' : ''}${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => onToggle(index, !open)}
      >
        {text}
      </button>
      {open && (
        <span id={id} ref={pop} className="lesson-meanings" role="list" aria-label={label}>
          {meanings.map((meaning, i) => (
            <span key={i} role="listitem" className="lesson-meaning" dir="auto">
              {meaning}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** The waveform's bars, tallest in the middle of a phrase, in tenths of the bubble's height. */
const WAVE = [2, 4, 3, 6, 9, 5, 8, 10, 7, 4, 8, 9, 5, 3, 2];

/**
 * Listening's bubble: the recording itself, a speaker and its waveform, which
 * moves while it plays (and is still under reduced motion). A tap plays it
 * again; "Slower" under the bubble plays it at 0.75×, lit while it does.
 */
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
