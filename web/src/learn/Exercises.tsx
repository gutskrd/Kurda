import { useEffect, useRef, useState } from 'react';
import { emptyMatch, isLeftMatched, isRightMatched, tapLeft, tapRight, type DeliveredExercise, type Feedback } from '@kurda/shared';
import { CheckIcon, CloseIcon } from '../components/icons';
import { Sound } from '../alphabet/Sound';
import { onPlaying, play } from '../lib/sound';
import { useT } from '../i18n/I18nProvider';
import { kurdishText } from './map';
import { PlayButton } from './PlayButton';
import { TextAnswer } from './TextAnswer';
import { ExerciseVoice, exerciseClips } from './Voice';

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
  /**
   * The id of the form the exercise answers through. Check is not the
   * exercise's own: it is in the action bar at the foot of the lesson
   * (ActionBar.tsx), in the same place for every exercise, and submits this
   * form; a typed answer's Enter submits it too.
   */
  formId: string;
  /** whether there is an answer to check yet: the action bar's Check waits for it */
  onReady: (ready: boolean) => void;
  /** `given` is what was typed, for the feedback to set beside the right answer */
  onAnswer: (answer: unknown, given?: string) => void;
  /** put this one off by itself: an item that cannot be done at all, such as a listening item with no recording */
  onSkip: () => void;
}

/** How an answer was graded, for the part it was given with to answer back. */
export function verdictOf(feedback: Feedback | null): 'right' | 'wrong' | null {
  return feedback ? (feedback.accepted ? 'right' : 'wrong') : null;
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

/** Choose one: the question, with whoever says its recordings, and the options under it (`Choices`). */
export function MultipleChoice(props: ExerciseProps): React.JSX.Element {
  const t = useT();
  const { exercise, feedback } = props;
  return (
    <div className="lesson-exercise">
      <Ask focus>{t('lesson.mc.ask')}</Ask>
      <ExerciseVoice clips={exerciseClips(exercise)} verdict={verdictOf(feedback)}>
        <Prompt text={exercise.prompt} />
        <Model exercise={exercise} />
      </ExerciseVoice>
      <Choices {...props} />
    </div>
  );
}

/**
 * The options, for a multiple-choice item and for the question after a
 * conversation alike: large buttons, 1–6 on a keyboard. A tap or a number
 * chooses — a stray tap is not an answer, and the learner can think again —
 * and Check, or Enter, answers with the option's place as shown, as the phone
 * does. Once it is graded the chosen option and the right one are marked with
 * a tick and a cross as well as a colour. (The alphabet's quick questions
 * still answer on the tap: one letter at a time is a different rhythm.)
 */
export function Choices({ exercise, locked, busy, feedback, formId, onReady, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const options = exercise.options ?? [];
  const [chosen, setChosen] = useState<number | null>(null);

  useEffect(() => onReady(chosen !== null), [chosen, onReady]);

  const choose = (i: number): void => {
    if (locked || busy) return;
    setChosen(i);
  };

  useEffect(() => {
    if (locked || busy) return;
    const onKey = (e: KeyboardEvent): void => {
      // not while typing somewhere, and not from inside a dialog (the Tips) over the lesson
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        setChosen(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, busy, options.length]);

  // graded: the right option is the one the correction names, or the one chosen when it was right
  const right = (i: number): boolean => (feedback?.accepted ? i === chosen : feedback?.correction === options[i]);

  return (
    <form
      id={formId}
      className="lesson-choices"
      onSubmit={(e) => {
        e.preventDefault();
        if (!locked && !busy && chosen !== null) onAnswer({ choice: chosen });
      }}
    >
      <div className="lesson-options" role="group" aria-label={t('lesson.mc.options')}>
        {options.map((option, i) => {
          // the one chosen pops (right) or shakes (wrong) as it is graded — styles/motion.css
          const state = !locked
            ? i === chosen
              ? ' is-selected'
              : ''
            : (right(i) ? ' is-right' : i === chosen ? ' is-wrong' : ' is-dim') + (i === chosen ? ' is-chosen' : '');
          const clip = exercise.audio?.[option];
          return (
            <div className="lesson-option-row" key={`${i}:${option}`}>
              <button
                type="button"
                className={`lesson-option${state}`}
                aria-pressed={locked ? undefined : i === chosen}
                disabled={locked || busy}
                onClick={() => choose(i)}
              >
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
      {/* kept in its place once answered (unseen), so nothing above the verdict moves */}
      {options.length > 1 && (
        <p className={`lesson-hint lesson-hint--keys${locked ? ' is-spent' : ''}`} aria-hidden={locked || undefined}>
          {t('lesson.mc.keysSelect', { count: options.length })}
        </p>
      )}
    </form>
  );
}

// ---------- translate and writing ----------

/** Translate into Kurdish, or write a sentence: a typed answer with the key bar. */
export function TypedExercise({ exercise, dialect, locked, busy, feedback, formId, onReady, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  return (
    <div className="lesson-exercise">
      <Ask focus={false}>{exercise.type === 'writing' ? t('lesson.write.ask') : t('lesson.translate.ask')}</Ask>
      <ExerciseVoice clips={exerciseClips(exercise)} verdict={verdictOf(feedback)}>
        <Prompt text={exercise.prompt} />
        <Model exercise={exercise} />
      </ExerciseVoice>
      <TextAnswer
        id={formId}
        label={exercise.type === 'writing' ? t('lesson.write.label') : t('lesson.translate.label')}
        dialect={dialect}
        locked={locked}
        busy={busy}
        verdict={verdictOf(feedback)}
        onReady={onReady}
        onAnswer={onAnswer}
      />
    </div>
  );
}

// ---------- listening ----------

/**
 * Listen and type what you hear (KUR-035): the recording at full speed and at
 * 0.75×, as often as wanted. "Can't listen now", in the action bar, puts off
 * listening for the rest of the lesson without a mistake. An item with no
 * recording at all cannot be done, so it is put off by itself, once.
 */
export function Listening({ exercise, dialect, locked, busy, feedback, formId, onReady, onAnswer, onSkip }: ExerciseProps): React.JSX.Element | null {
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
      <ExerciseVoice clips={exerciseClips(exercise)} verdict={verdictOf(feedback)}>
        <div className="lesson-listen">
          <PlayButton src={src} label={played ? t('lesson.listen.again') : t('lesson.listen.play')} primary />
          <PlayButton src={src} rate={0.75} label={t('lesson.listen.slow')} />
        </div>
      </ExerciseVoice>
      <Prompt text={exercise.prompt} />
      <TextAnswer
        id={formId}
        label={t('lesson.listen.label')}
        dialect={dialect}
        locked={locked}
        busy={busy}
        verdict={verdictOf(feedback)}
        onReady={onReady}
        onAnswer={onAnswer}
      />
    </div>
  );
}

// ---------- match pairs ----------

/**
 * Tap a Kurdish card, then its meaning. A pair made shows the same number on
 * both cards, so which card went with which is plain without colour; tap
 * either card again to undo it. A Kurdish card with a recording plays it when
 * it is tapped — hearing the word as it is chosen. On a keyboard, a number
 * picks that Kurdish card and Shift with it that meaning. Check, in the
 * action bar, waits until every card has its pair.
 */
export function MatchPairs({ exercise, dialect, locked, busy, feedback, formId, onReady, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const lefts = exercise.lefts ?? [];
  const rights = exercise.rights ?? [];
  const [state, setState] = useState(emptyMatch);
  const { lang, dir } = kurdishText(dialect);
  const pairOf = (side: 'left' | 'right', text: string): number => state.matches.findIndex((m) => m[side] === text);
  const complete = state.matches.length === lefts.length && lefts.length > 0;
  // the keys read the pairs as they are now, not as they were when the listener was set
  const live = useRef(state);
  live.current = state;

  useEffect(() => onReady(complete), [complete, onReady]);

  const tapKurdish = (left: string): void => {
    const clip = exercise.audio?.[left];
    if (clip && !isLeftMatched(live.current, left)) play(clip);
    setState(tapLeft(live.current, left));
  };
  const tapMeaning = (right: string): void => setState(tapRight(live.current, right));
  const keys = useRef({ tapKurdish, tapMeaning });
  keys.current = { tapKurdish, tapMeaning };

  useEffect(() => {
    if (locked || busy) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      // the key's place, not what it types: Shift+1 is "!" on one keyboard and "+" on another
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      if (!n) return;
      const side = e.shiftKey ? rights : lefts;
      const text = side[Number(n) - 1];
      if (text === undefined) return;
      e.preventDefault();
      if (e.shiftKey) keys.current.tapMeaning(text);
      else keys.current.tapKurdish(text);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, busy, lefts, rights]);

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
        onClick={() => (side === 'left' ? tapKurdish(text) : tapMeaning(text))}
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
      <ExerciseVoice clips={exerciseClips(exercise)} verdict={verdictOf(feedback)}>
        <p className="lesson-hint">{t('lesson.match.how')}</p>
      </ExerciseVoice>
      <form
        id={formId}
        className={`lesson-match${verdictOf(feedback) ? ` is-${verdictOf(feedback)}` : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!locked && !busy && complete) onAnswer({ matches: state.matches });
        }}
      >
        <div className="lesson-match-col" role="group" aria-label={t('lesson.match.kurdish')}>
          {lefts.map((l) => card('left', l))}
        </div>
        <div className="lesson-match-col" role="group" aria-label={t('lesson.match.meanings')}>
          {rights.map((r) => card('right', r))}
        </div>
      </form>
      <p className={`lesson-hint lesson-hint--keys${locked ? ' is-spent' : ''}`} aria-hidden={locked || undefined}>
        {t('lesson.match.keys', { n: Math.min(9, lefts.length) })}
      </p>
    </div>
  );
}
