import { useEffect, useRef, useState } from 'react';
import { emptyMatch, isLeftMatched, isRightMatched, tapLeft, tapRight, type DeliveredExercise, type Feedback } from '@kurda/shared';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon } from '../components/icons';
import { Sound } from '../alphabet/Sound';
import { onPlaying, play } from '../lib/sound';
import { useT } from '../i18n/I18nProvider';
import { kurdishText } from './map';
import { PlayButton } from './PlayButton';
import { TextAnswer } from './TextAnswer';

/** What every exercise is given by the player. */
export interface ExerciseProps {
  exercise: DeliveredExercise;
  /** the course's variety of Kurdish, for the key bar and for marking Kurdish text */
  dialect: string | null | undefined;
  /** graded: the answer stands and the feedback is showing */
  locked: boolean;
  /** an answer is on its way to the server */
  busy: boolean;
  feedback: Feedback | null;
  /** `given` is what was typed, for the feedback to set beside the right answer */
  onAnswer: (answer: unknown, given?: string) => void;
  /** put this one off: not answered, not a mistake ("can't listen now") */
  onSkip: () => void;
}

/**
 * The question, as a heading the focus can be put on: when an exercise that
 * starts with no field comes on screen, a screen reader is taken to what it
 * asks rather than left on the button that was pressed before it.
 */
export function Ask({ children, focus }: { children: React.ReactNode; focus: boolean }): React.JSX.Element {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <h2 className="lesson-ask" tabIndex={-1} ref={ref}>
      {children}
    </h2>
  );
}

/**
 * The exercise's own text. Prompts are written in the interface language, in
 * Kurdish, or both ("“Roj baş” tê çi wateyê?"), so they are not marked as
 * either; `dir="auto"` still sets a Soranî prompt right to left.
 */
export function Prompt({ text }: { text: string | undefined }): React.JSX.Element | null {
  if (!text) return null;
  return (
    <p className="lesson-prompt" dir="auto">
      {text}
    </p>
  );
}

/** The native recording, when it can be heard before answering without giving the answer away. */
function Model({ exercise }: { exercise: DeliveredExercise }): React.JSX.Element | null {
  const t = useT();
  if (!exercise.modelAudioUrl) return null;
  return (
    <div className="lesson-listen">
      <PlayButton src={exercise.modelAudioUrl} label={t('lesson.hear')} />
    </div>
  );
}

// ---------- multiple choice ----------

/**
 * Choose one: large buttons, 1–6 on a keyboard. A tap answers — as the
 * alphabet's questions do — and once it is graded the chosen option and the
 * right one are marked with a tick and a cross as well as a colour.
 */
export function MultipleChoice({ exercise, locked, busy, feedback, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const options = exercise.options ?? [];
  const [chosen, setChosen] = useState<number | null>(null);

  const choose = (i: number): void => {
    if (locked || busy) return;
    setChosen(i);
    onAnswer({ choice: i });
  };

  useEffect(() => {
    if (locked || busy) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        setChosen(n - 1);
        onAnswer({ choice: n - 1 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, busy, options.length, onAnswer]);

  // graded: the right option is the one the correction names, or the one chosen when it was right
  const right = (i: number): boolean => (feedback?.accepted ? i === chosen : feedback?.correction === options[i]);

  return (
    <div className="lesson-exercise">
      <Ask focus>{t('lesson.mc.ask')}</Ask>
      <Prompt text={exercise.prompt} />
      <Model exercise={exercise} />
      <div className="lesson-options" role="group" aria-label={t('lesson.mc.options')}>
        {options.map((option, i) => {
          const state = !locked ? '' : right(i) ? ' is-right' : i === chosen ? ' is-wrong' : ' is-dim';
          const clip = exercise.audio?.[option];
          return (
            <div className="lesson-option-row" key={`${i}:${option}`}>
              <button type="button" className={`lesson-option${state}`} disabled={locked || busy} onClick={() => choose(i)}>
                <span className="lesson-option-key" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="lesson-option-text" dir="auto">
                  {option}
                </span>
                {locked && right(i) && (
                  <span className="lesson-option-mark">
                    <CheckIcon size={18} />
                    <span className="sr-only">{t('lesson.mc.right')}</span>
                  </span>
                )}
                {locked && !right(i) && i === chosen && (
                  <span className="lesson-option-mark">
                    <CloseIcon size={18} />
                    <span className="sr-only">{t('lesson.mc.yourChoice')}</span>
                  </span>
                )}
              </button>
              {clip && <Sound src={clip} label={t('lesson.mc.hearOption', { option })} size="sm" />}
            </div>
          );
        })}
      </div>
      {!locked && options.length > 1 && <p className="lesson-hint lesson-hint--keys">{t('lesson.mc.keys', { count: options.length })}</p>}
    </div>
  );
}

// ---------- translate and writing ----------

/** Translate into Kurdish, or write a sentence: a typed answer with the key bar. */
export function TypedExercise({ exercise, dialect, locked, busy, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  return (
    <div className="lesson-exercise">
      <Ask focus={false}>{exercise.type === 'writing' ? t('lesson.write.ask') : t('lesson.translate.ask')}</Ask>
      <Prompt text={exercise.prompt} />
      <Model exercise={exercise} />
      <TextAnswer
        label={exercise.type === 'writing' ? t('lesson.write.label') : t('lesson.translate.label')}
        dialect={dialect}
        locked={locked}
        busy={busy}
        onAnswer={onAnswer}
      />
    </div>
  );
}

// ---------- listening ----------

/**
 * Listen and type what you hear (KUR-035): the recording at full speed and at
 * 0.75×, as often as wanted. "Can't listen now" puts it off without a mistake.
 * An item with no recording at all cannot be done, so it is put off by
 * itself, once.
 */
export function Listening({ exercise, dialect, locked, busy, onAnswer, onSkip }: ExerciseProps): React.JSX.Element | null {
  const t = useT();
  const src = exercise.audioUrl;
  const [played, setPlayed] = useState(false);
  const skipped = useRef(false);

  useEffect(() => {
    if (src || skipped.current) return;
    skipped.current = true;
    onSkip();
  }, [src, onSkip]);

  // the question is the sound, so it plays as the exercise appears (where the
  // browser allows it: the tap on Continue usually counts); "Play" says
  // "Play again" once it has actually been heard
  useEffect(() => {
    if (!src) return;
    const off = onPlaying((now) => {
      if (now === src) setPlayed(true);
    });
    play(src);
    return off;
  }, [src]);

  if (!src) return null;
  return (
    <div className="lesson-exercise">
      <Ask focus={false}>{t('lesson.listen.ask')}</Ask>
      <div className="lesson-listen">
        <PlayButton src={src} label={played ? t('lesson.listen.again') : t('lesson.listen.play')} primary />
        <PlayButton src={src} rate={0.75} label={t('lesson.listen.slow')} />
      </div>
      <Prompt text={exercise.prompt} />
      <TextAnswer label={t('lesson.listen.label')} dialect={dialect} locked={locked} busy={busy} onAnswer={onAnswer} />
      {!locked && (
        <button type="button" className="link-btn lesson-skip" onClick={onSkip} disabled={busy}>
          {t('lesson.listen.skip')}
        </button>
      )}
    </div>
  );
}

// ---------- match pairs ----------

/**
 * Tap a Kurdish card, then its meaning. A pair made shows the same number on
 * both cards, so which card went with which is plain without colour; tap
 * either card again to undo it. A Kurdish card with a recording plays it when
 * it is tapped — hearing the word as it is chosen.
 */
export function MatchPairs({ exercise, dialect, locked, busy, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const lefts = exercise.lefts ?? [];
  const rights = exercise.rights ?? [];
  const [state, setState] = useState(emptyMatch);
  const { lang, dir } = kurdishText(dialect);
  const pairOf = (side: 'left' | 'right', text: string): number => state.matches.findIndex((m) => m[side] === text);
  const complete = state.matches.length === lefts.length && lefts.length > 0;

  const tapKurdish = (left: string): void => {
    const clip = exercise.audio?.[left];
    if (clip && !isLeftMatched(state, left)) play(clip);
    setState(tapLeft(state, left));
  };

  const card = (side: 'left' | 'right', text: string): React.JSX.Element => {
    const n = pairOf(side, text);
    const matched = side === 'left' ? isLeftMatched(state, text) : isRightMatched(state, text);
    const selected = side === 'left' && state.selectedLeft === text;
    const other = n >= 0 ? state.matches[n]![side === 'left' ? 'right' : 'left'] : null;
    return (
      <button
        key={text}
        type="button"
        className={`lesson-card${matched ? ' is-matched' : ''}${selected ? ' is-selected' : ''}`}
        aria-pressed={side === 'left' ? selected : undefined}
        disabled={locked || busy}
        onClick={() => (side === 'left' ? tapKurdish(text) : setState(tapRight(state, text)))}
      >
        {side === 'left' ? (
          <span lang={lang} dir={dir}>
            {text}
          </span>
        ) : (
          <span dir="auto">{text}</span>
        )}
        {n >= 0 && (
          <span className="lesson-card-pair" aria-hidden="true">
            {n + 1}
          </span>
        )}
        {other !== null && <span className="sr-only">{t('lesson.match.pairedWith', { other })}</span>}
      </button>
    );
  };

  return (
    <div className="lesson-exercise">
      <Ask focus>{t('lesson.match.ask')}</Ask>
      <p className="lesson-hint">{t('lesson.match.how')}</p>
      <div className="lesson-match">
        <div className="lesson-match-col" role="group" aria-label={t('lesson.match.kurdish')}>
          {lefts.map((l) => card('left', l))}
        </div>
        <div className="lesson-match-col" role="group" aria-label={t('lesson.match.meanings')}>
          {rights.map((r) => card('right', r))}
        </div>
      </div>
      {!locked && (
        <Button className="lesson-check" disabled={!complete || busy} onClick={() => onAnswer({ matches: state.matches })}>
          {busy ? t('lesson.checking') : t('lesson.check')}
        </Button>
      )}
    </div>
  );
}
