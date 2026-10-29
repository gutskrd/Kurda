import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyLiveMatch,
  emptyMatch,
  isLeftMatched,
  pairKey,
  tapLeft,
  tapLive,
  tapRight,
  type DeliveredExercise,
  type Feedback,
  type LiveMatchState,
  type MatchPair,
} from '@kurda/shared';
import { CheckIcon, CloseIcon, SparkleIcon } from '../components/icons';
import { Sound } from '../alphabet/Sound';
import { STAGE } from '../characters/CharacterStage';
import { haptic } from '../lib/haptics';
import { onPlaying, play } from '../lib/sound';
import { playLessonSound } from '../lib/sounds';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useT } from '../i18n/I18nProvider';
import { kurdishText } from './map';
import { PlayButton } from './PlayButton';
import { Bubble, PromptWords, SoundBubble } from './Bubble';
import { Tile, type TileState } from './Tile';
import { ExerciseVoice, exerciseClips } from './Voice';
import { BuiltAnswer, useAnswerMode } from './WordTiles';

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

/**
 * A stage beside a speech bubble: a card tall (`STAGE.card`), shorter on a
 * phone so the character is narrower and the bubble has room, and shorter
 * still on a short screen so the answer stays in view; and the least share of
 * its width the character keeps — the bubble has the rest.
 */
const BUBBLE_STAGE = { phone: 220, short: 170, share: 0.36 } as const;

/**
 * Whoever says an exercise's recordings, on a stage that leaves room beside
 * them for what they say (`Said`, `SoundBubble`); with nobody chosen, what
 * they say stands alone.
 */
function Scene({ exercise, feedback, children }: { exercise: DeliveredExercise; feedback: Feedback | null; children: React.ReactNode }): React.JSX.Element {
  const phone = useMediaQuery('(max-width: 480px)');
  const short = useMediaQuery('(max-height: 700px)');
  const height = short ? BUBBLE_STAGE.short : phone ? BUBBLE_STAGE.phone : STAGE.card;
  return (
    <ExerciseVoice clips={exerciseClips(exercise)} verdict={verdictOf(feedback)} height={height} share={BUBBLE_STAGE.share}>
      {children}
    </ExerciseVoice>
  );
}

/**
 * What the exercise says, in a speech bubble beside whoever says it: the
 * prompt, its known words a tap away from their meanings, and at its start
 * the native recording when it can be heard before answering without giving
 * the answer away.
 */
function Said({ exercise }: { exercise: DeliveredExercise }): React.JSX.Element | null {
  const t = useT();
  if (!exercise.prompt && !exercise.modelAudioUrl) return null;
  return (
    <Bubble>
      {exercise.modelAudioUrl && <PlayButton src={exercise.modelAudioUrl} label={t('lesson.hear')} round />}
      <PromptWords text={exercise.prompt} tokens={exercise.promptTokens} />
    </Bubble>
  );
}

// ---------- multiple choice ----------

/** Choose one: the question in a bubble, with whoever says its recordings, and the options under it (`Choices`). */
export function MultipleChoice(props: ExerciseProps): React.JSX.Element {
  const t = useT();
  const { exercise, feedback } = props;
  return (
    <div className="lesson-exercise">
      <Ask focus>{t('lesson.mc.ask')}</Ask>
      <Scene exercise={exercise} feedback={feedback}>
        <Said exercise={exercise} />
      </Scene>
      <Choices {...props} />
    </div>
  );
}

/**
 * The options, for a multiple-choice item and for the question after a
 * conversation alike: full-width tiles, 1–6 on a keyboard. A tap or a number
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
          const state: TileState = !locked ? (i === chosen ? 'picked' : 'idle') : right(i) ? 'right' : i === chosen ? 'wrong' : 'dim';
          const clip = exercise.audio?.[option];
          return (
            <div className="lesson-option-row" key={`${i}:${option}`}>
              <Tile
                state={state}
                className={`lesson-option${locked && i === chosen ? ' is-chosen' : ''}`}
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
              </Tile>
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

/**
 * Translate, or write a sentence: what to put into words in a bubble, and the
 * answer — built from word tiles when the item brings a bank (`BuiltAnswer`),
 * else typed with the key bar.
 */
export function TypedExercise({ exercise, dialect, locked, busy, feedback, formId, onReady, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const [mode, setMode] = useAnswerMode(exercise.bank);
  const writing = exercise.type === 'writing';
  return (
    <div className="lesson-exercise">
      <Ask focus={false}>{writing ? t('lesson.write.ask') : mode === 'tiles' ? t('lesson.translate.askTiles') : t('lesson.translate.ask')}</Ask>
      <Scene exercise={exercise} feedback={feedback}>
        <Said exercise={exercise} />
      </Scene>
      <BuiltAnswer
        bank={exercise.bank}
        mode={mode}
        onMode={setMode}
        formId={formId}
        label={writing ? t('lesson.write.label') : t('lesson.translate.label')}
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
 * Listen and put down what you hear (KUR-035): the recording in a bubble, at
 * full speed and at 0.75×, as often as wanted, and the answer built from word
 * tiles or typed (`BuiltAnswer`). "Can't listen now", in the action bar, puts
 * off listening for the rest of the lesson without a mistake. An item with no
 * recording at all cannot be done, so it is put off by itself, once.
 */
export function Listening({ exercise, dialect, locked, busy, feedback, formId, onReady, onAnswer, onSkip }: ExerciseProps): React.JSX.Element | null {
  const t = useT();
  const src = exercise.audioUrl;
  const [played, setPlayed] = useState(false);
  const [mode, setMode] = useAnswerMode(exercise.bank);
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
      <Ask focus={false}>{mode === 'tiles' ? t('lesson.listen.askTiles') : t('lesson.listen.ask')}</Ask>
      <Scene exercise={exercise} feedback={feedback}>
        <SoundBubble src={src} label={played ? t('lesson.listen.again') : t('lesson.listen.play')} />
      </Scene>
      {exercise.prompt && (
        <p className="lesson-hint" dir="auto">
          {exercise.prompt}
        </p>
      )}
      <BuiltAnswer
        bank={exercise.bank}
        mode={mode}
        onMode={setMode}
        formId={formId}
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
 * Match pairs: answered as each pair is made when the server says which
 * meaning each card pairs with (`pairOf`, `LiveMatch`), else made freely and
 * checked together (`FreeMatch`), as before.
 */
export function MatchPairs(props: ExerciseProps): React.JSX.Element {
  const { lefts, rights, pairOf } = props.exercise;
  const key = useMemo(() => pairKey(lefts ?? [], rights ?? [], pairOf), [lefts, rights, pairOf]);
  return key ? <LiveMatch {...props} pairs={key} /> : <FreeMatch {...props} />;
}

/**
 * On a keyboard, a number picks that Kurdish card and Shift with it that
 * meaning — the key's place, not what it types: Shift+1 is "!" on one
 * keyboard and "+" on another.
 */
function useCardKeys(off: boolean, lefts: readonly string[], rights: readonly string[], tap: (side: 'left' | 'right', text: string) => void): void {
  // the keys read the pairs as they are now, not as they were when the listener was set
  const live = useRef(tap);
  live.current = tap;
  useEffect(() => {
    if (off) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      if (!n) return;
      const text = (e.shiftKey ? rights : lefts)[Number(n) - 1];
      if (text === undefined) return;
      e.preventDefault();
      live.current(e.shiftKey ? 'right' : 'left', text);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [off, lefts, rights]);
}

/** A card's words: a Kurdish card marked as Kurdish, a meaning in whatever it is written in. */
function CardText({ side, text, dialect }: { side: 'left' | 'right'; text: string; dialect: string | null | undefined }): React.JSX.Element {
  const { lang, dir } = kurdishText(dialect);
  return side === 'left' ? (
    <span lang={lang} dir={dir}>
      {text}
    </span>
  ) : (
    <span dir="auto">{text}</span>
  );
}

/**
 * Tap a Kurdish card, then its meaning. A pair made shows the same number on
 * both cards, so which card went with which is plain without colour; tap
 * either card again to undo it. A Kurdish card with a recording plays it when
 * it is tapped — hearing the word as it is chosen. Check, in the action bar,
 * waits until every card has its pair.
 */
function FreeMatch({ exercise, dialect, locked, busy, feedback, formId, onReady, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const lefts = exercise.lefts ?? [];
  const rights = exercise.rights ?? [];
  const [state, setState] = useState(emptyMatch);
  const pairOf = (side: 'left' | 'right', text: string): number => state.matches.findIndex((m) => m[side] === text);
  const complete = state.matches.length === lefts.length && lefts.length > 0;
  const live = useRef(state);
  live.current = state;

  useEffect(() => onReady(complete), [complete, onReady]);

  const tap = (side: 'left' | 'right', text: string): void => {
    if (side === 'right') {
      setState(tapRight(live.current, text));
      return;
    }
    const clip = exercise.audio?.[text];
    if (clip && !isLeftMatched(live.current, text)) play(clip);
    setState(tapLeft(live.current, text));
  };
  useCardKeys(locked || busy, lefts, rights, tap);

  const card = (side: 'left' | 'right', text: string): React.JSX.Element => {
    const n = pairOf(side, text);
    const selected = side === 'left' && state.selectedLeft === text;
    const other = n >= 0 ? state.matches[n]![side === 'left' ? 'right' : 'left'] : null;
    return (
      <Tile
        key={text}
        state={selected ? 'picked' : 'idle'}
        className={`lesson-card${n >= 0 ? ' is-paired' : ''}`}
        aria-pressed={side === 'left' ? selected : undefined}
        disabled={locked || busy}
        onClick={() => tap(side, text)}
      >
        <CardText side={side} text={text} dialect={dialect} />
        {n >= 0 && (
          <span className="lesson-card-pair" aria-hidden="true">
            {n + 1}
          </span>
        )}
        {other !== null && <span className="sr-only">{t('lesson.match.pairedWith', { other })}</span>}
      </Tile>
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

/**
 * How long a pair just tried keeps its colour: a right one flashes green with
 * a sweep of light and a sparkle before it settles, spent; a wrong one
 * flashes red and shakes once, then is as it was.
 */
const PAIR_FLASH_MS = { right: 650, wrong: 550 } as const;

const cardId = (side: 'left' | 'right', text: string): string => `${side}:${text}`;

/**
 * Pairs answered as they are made (`tapLive`): tap a card on either side, then
 * its partner. A right pair flashes green, is felt and heard, and stays made,
 * spent; a wrong one flashes red and shakes, and both cards are free again.
 * Each is said to a screen reader as it happens. There is nothing to check:
 * the last pair made answers the exercise, and the verdict rises at once.
 */
function LiveMatch({
  exercise,
  dialect,
  locked,
  busy,
  formId,
  onReady,
  onAnswer,
  pairs,
}: ExerciseProps & { pairs: ReadonlyMap<string, string> }): React.JSX.Element {
  const t = useT();
  const lefts = exercise.lefts ?? [];
  const rights = exercise.rights ?? [];
  const [state, setState] = useState<LiveMatchState>(emptyLiveMatch);
  const [flash, setFlash] = useState<ReadonlyMap<string, 'right' | 'wrong'>>(() => new Map());
  const [said, setSaid] = useState('');
  // taps can come faster than renders (a keyboard): each reads the pairs as the last one left them
  const live = useRef(state);
  const timers = useRef<number[]>([]);
  const off = locked || busy;

  // nothing for Check to wait for: the last pair made is the answer
  useEffect(() => onReady(false), [onReady]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const light = (pair: MatchPair, how: 'right' | 'wrong'): void => {
    const cards = [cardId('left', pair.left), cardId('right', pair.right)];
    setFlash((now) => new Map([...now, ...cards.map((c) => [c, how] as const)]));
    const id = window.setTimeout(
      () => setFlash((now) => new Map([...now].filter(([c, was]) => !(cards.includes(c) && was === how)))),
      PAIR_FLASH_MS[how],
    );
    timers.current.push(id);
  };

  const tap = (side: 'left' | 'right', text: string): void => {
    if (off) return;
    const clip = side === 'left' ? exercise.audio?.[text] : undefined;
    if (clip && !isLeftMatched(live.current, text)) play(clip);
    const { state: next, outcome, pair } = tapLive(live.current, pairs, side, text);
    live.current = next;
    setState(next);
    if (!pair) return;
    const made = outcome === 'matched';
    const last = made && next.matches.length === lefts.length;
    light(pair, made ? 'right' : 'wrong');
    setSaid(t(made ? 'lesson.match.matched' : 'lesson.match.missed', { left: pair.left, right: pair.right }));
    // the last pair is the answer: its verdict is felt and heard in its own place
    if (!made) {
      haptic('wrong');
      playLessonSound('wrong');
    } else if (!last) {
      haptic('correct');
      playLessonSound('correct');
    }
    if (last) onAnswer({ matches: next.matches });
  };
  useCardKeys(off, lefts, rights, tap);

  const card = (side: 'left' | 'right', text: string): React.JSX.Element => {
    const made = state.matches.find((m) => m[side] === text);
    const lit = flash.get(cardId(side, text));
    const picked = state.picked?.side === side && state.picked.text === text;
    const other = made ? made[side === 'left' ? 'right' : 'left'] : null;
    return (
      <Tile
        key={text}
        state={lit ?? (made ? 'spent' : picked ? 'picked' : 'idle')}
        flash={!!lit}
        className="lesson-card"
        aria-pressed={made ? undefined : picked}
        disabled={off || !!made}
        onClick={() => tap(side, text)}
      >
        <CardText side={side} text={text} dialect={dialect} />
        {/* a mark as well as a colour: a sparkle for a pair found, a cross for one that is not */}
        {lit && (
          <span className={`tile-mark is-${lit}`} aria-hidden="true">
            {lit === 'right' ? <SparkleIcon size={14} /> : <CloseIcon size={14} weight="bold" />}
          </span>
        )}
        {other !== null && <span className="sr-only">{t('lesson.match.pairedWith', { other })}</span>}
      </Tile>
    );
  };

  return (
    <div className="lesson-exercise">
      <Ask focus>{t('lesson.match.ask')}</Ask>
      <ExerciseVoice clips={exerciseClips(exercise)} />
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <form id={formId} className="lesson-match is-live" onSubmit={(e) => e.preventDefault()}>
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
