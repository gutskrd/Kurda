import { useEffect, useRef } from 'react';
import {
  RUN_SHOWN_FROM,
  VERDICT_TIMING,
  feedbackKind,
  letterDiff,
  typedHint,
  type DiffSegment,
  type ExerciseType,
  type Feedback,
  type FeedbackKind,
  type TypedHint,
} from '@kurda/shared';
import { ClipSpeaker } from '../characters/ClipSpeaker';
import type { SpokenClip } from '../characters/clips';
import { SpeakingCharacter, type CharacterReaction } from '../characters/SpeakingCharacter';
import { Button } from '../components/Button';
import { BookIcon, CheckIcon, CloseIcon, FlameIcon } from '../components/icons';
import { play } from '../lib/sound';
import { autoplayOn } from '../lib/sounds';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { BarRow } from './ActionBar';
import { kurdishText } from './map';
import { PlayButton } from './PlayButton';

/** What the verdict says. Each must be true of the answer it is shown for (`feedbackKind`). */
export const VERDICT: Record<FeedbackKind, MessageKey> = {
  correct: 'lesson.fb.correct',
  almost: 'lesson.fb.almost',
  almostStrict: 'lesson.fb.almostStrict',
  notYet: 'lesson.fb.notYet',
  spokenGood: 'lesson.fb.spokenGood',
  spokenClose: 'lesson.fb.spokenClose',
  spokenRetry: 'lesson.fb.spokenRetry',
};

/** What a typed miss was, in a line (`typedHint`). */
const HINT: Record<TypedHint['kind'], MessageKey> = {
  marks: 'lesson.hint.marks',
  lookalike: 'lesson.hint.lookalike',
  order: 'lesson.hint.order',
  missing: 'lesson.hint.missing',
  extra: 'lesson.hint.extra',
};

/** Answers that are Kurdish typed by the learner, set letter by letter against the right one. */
const TYPED: ReadonlySet<ExerciseType | undefined> = new Set<ExerciseType | undefined>(['translate', 'writing', 'listening']);
/** Answers whose right answer is Kurdish (a multiple-choice option, the answer to a conversation's question or a pair may be in any language). */
const KURDISH_ANSWER: ReadonlySet<ExerciseType | undefined> = new Set<ExerciseType | undefined>(['translate', 'writing', 'listening', 'speaking']);

/** How tall the character beside the verdict is: head to waist, standing on the sheet's floor. */
const FEEDBACK_FACE = 88;

/**
 * Kurdish set inside an interface sentence in any language: isolated, so a
 * Soranî letter in an English line, or a Kurmancî one in an Arabic line,
 * keeps its own direction and does not reorder the words around it.
 */
const isolate = (text: string): string => `⁨${text}⁩`;

function Marked({ segments }: { segments: DiffSegment[] }): React.JSX.Element {
  return (
    <>
      {segments.map((s, i) => (s.differs ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

/** One sentence for a screen reader: the verdict, and the right answer when there is one to give. */
export function announce(feedback: Feedback, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  const verdict = t(VERDICT[feedbackKind(feedback)]);
  const answer = feedback.correction && !(feedback.accepted && feedback.verdict === 'correct') ? ` ${t('lesson.fb.answerIs', { answer: feedback.correction })}` : '';
  return `${verdict}${answer}`;
}

/** The line under a typed miss saying what kind of slip it was, or null. */
function hintLine(hint: TypedHint | null, rtl: boolean, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string | null {
  if (!hint) return null;
  if (hint.kind === 'order') return t(HINT.order);
  if (hint.kind === 'missing' || hint.kind === 'extra') return t(HINT[hint.kind], { word: isolate(hint.word) });
  // "s → ş": the letter written, then the one meant, in the reading order of the Kurdish
  const pairs = hint.pairs.map(([given, meant]) => (rtl ? `${given} ← ${meant}` : `${given} → ${meant}`)).join(', ');
  return t(HINT[hint.kind], { pairs: isolate(pairs) });
}

/** A run of right answers, shown from three; it pops when it reaches a milestone. */
export interface RunMark {
  count: number;
  milestone: boolean;
}

/**
 * The verdict sheet (ActionBar.tsx), after an answer: the verdict in words and
 * a mark (never colour alone), the learner's typed answer above the right one
 * with the letters that differ marked and, when the slip was one thing, what
 * it was ("only the marks differ: s → ş"); the native recording, which plays
 * by itself a moment after the verdict (Settings → Sounds) and can be heard
 * again; and Continue, in the place Check was, which takes the focus so a
 * keyboard goes on with Enter.
 *
 * A right answer may be praised in the course's own Kurdish ("Aferîn!") with
 * the meaning beside it, and a run is counted from three ("3 in a row") and
 * named at a milestone. Beside the verdict stands whoever says the model when
 * the exercise above does not show them already — or Hevalo, on the first
 * answer of a lesson, on every miss (curious, never sad) and at a milestone,
 * and not on every right answer, so his cheer keeps its worth.
 */
export function FeedbackPanel({
  feedback,
  dialect,
  speaker = null,
  hevalo = null,
  praise = null,
  run = null,
  onWhy = null,
  onContinue,
}: {
  feedback: Feedback;
  dialect: string | null | undefined;
  /** who says the model, when nobody above does (`feedbackClip`) */
  speaker?: SpokenClip | null;
  /** Hevalo's reaction, when he stands in beside this verdict */
  hevalo?: CharacterReaction | null;
  /** the Kurdish word a right answer is praised with */
  praise?: string | null;
  /** right answers in a row, once there are enough to show */
  run?: RunMark | null;
  /** open the skill's Tips, when it has them */
  onWhy?: (() => void) | null;
  onContinue: () => void;
}): React.JSX.Element {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const kind = feedbackKind(feedback);
  const tone = !feedback.accepted ? 'notyet' : feedback.verdict === 'correct' ? 'right' : 'almost';
  const { lang, dir } = kurdishText(dialect);
  const typed = TYPED.has(feedback.exerciseType) && feedback.given !== undefined && !!feedback.correction;
  const diff = typed ? letterDiff(feedback.given!, feedback.correction!) : null;
  const hint = typed ? hintLine(typedHint(feedback.given!, feedback.correction!, dialect), dir === 'rtl', t) : null;
  const kurdish = KURDISH_ANSWER.has(feedback.exerciseType);
  const shownRun = run && run.count >= RUN_SHOWN_FROM ? run : null;
  const model = feedback.modelAudioUrl;

  // the focus goes to Continue, where Check was: Enter, Enter is the lesson
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('.lesson-bar-go')?.focus({ preventScroll: true });
  }, []);

  // the Kurdish, heard straight after the verdict (once the chime has had its
  // moment) through the app's one player, so the character beside it says it;
  // not for a spoken answer, whose model was just compared, and gone on Continue
  useEffect(() => {
    if (!model || feedback.exerciseType === 'speaking' || !autoplayOn()) return;
    const id = window.setTimeout(() => play(model), VERDICT_TIMING.modelAtMs);
    return () => window.clearTimeout(id);
  }, [model, feedback.exerciseType]);

  // Enter goes on from anywhere but another control: from the sheet, or from
  // the page after a click elsewhere — but not from a dialog (the Tips) open
  // over the lesson
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [contenteditable], [role="dialog"]')) return;
      e.preventDefault();
      onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue]);

  const face = speaker ? (
    // cheering a right answer and thinking a wrong one over; a click says it again
    <ClipSpeaker clips={[speaker]} crop="half" size={FEEDBACK_FACE} decorative replay reaction={feedback.accepted ? 'cheer' : 'hmm'} />
  ) : hevalo ? (
    <SpeakingCharacter speaker="hevalo" audio={null} crop="half" size={FEEDBACK_FACE} decorative reaction={hevalo} />
  ) : null;

  let headline: React.ReactNode = t(VERDICT[kind]);
  if (run?.milestone) headline = t('lesson.run.milestone', { count: run.count });
  else if (kind === 'correct' && praise) {
    headline = (
      <>
        <span lang={lang} dir={dir}>
          {praise}
        </span>
        <span className="lesson-praise-gloss">{t('lesson.fb.praiseGloss')}</span>
      </>
    );
  }

  return (
    <div className={`lesson-feedback is-${tone}`} ref={root} role="region" aria-label={t('lesson.fb.label')}>
      <div className={`lesson-sheet${face ? ' has-face' : ''}`}>
        {face && <div className="lesson-feedback-face">{face}</div>}
        <div className="lesson-sheet-text">
          <p className="lesson-verdict">
            <span className="lesson-verdict-mark" aria-hidden="true">
              {tone === 'notyet' ? <CloseIcon size={22} weight="bold" /> : <CheckIcon size={22} />}
            </span>
            <span className="lesson-verdict-words">{headline}</span>
            {shownRun && (
              <span className={`lesson-run${shownRun.milestone ? ' is-milestone' : ''}`}>
                <FlameIcon size={14} weight="fill" />
                {t('lesson.inARow', { count: shownRun.count })}
              </span>
            )}
          </p>

          {diff ? (
            <dl className="lesson-compare">
              {/* read the way they are written: a Soranî course's English answer runs left to right */}
              <dt>{t('lesson.fb.yours')}</dt>
              <dd lang={lang} dir="auto">
                <Marked segments={diff.given} />
              </dd>
              <dt>{t('lesson.fb.right')}</dt>
              <dd lang={lang} dir="auto">
                <Marked segments={diff.expected} />
              </dd>
            </dl>
          ) : (
            feedback.correction && (
              <p className="lesson-correction">
                <span className="lesson-correction-label">{t('lesson.fb.answer')}</span>{' '}
                <strong lang={kurdish ? lang : undefined} dir="auto">
                  {feedback.correction}
                </strong>
              </p>
            )
          )}
          {hint && <p className="lesson-hint-line">{hint}</p>}

          {feedback.comesBack && <p className="lesson-note">{t('lesson.fb.comesBack')}</p>}
          {feedback.reask && <p className="lesson-note">{t('lesson.fb.reaskNote')}</p>}
        </div>
      </div>

      <BarRow
        start={
          <>
            {model && <PlayButton src={model} label={t('lesson.fb.hear')} />}
            {onWhy && !feedback.accepted && (
              <Button variant="ghost" size="sm" onClick={onWhy}>
                <BookIcon size={18} />
                {t('lesson.fb.why')}
              </Button>
            )}
          </>
        }
      >
        <Button size="lg" className="lesson-bar-go" onClick={onContinue}>
          {t('lesson.continue')}
        </Button>
      </BarRow>
    </div>
  );
}
