import { useEffect, useRef } from 'react';
import {
  RUN_SHOWN_FROM,
  VERDICT_TIMING,
  answerDiff,
  feedbackKind,
  runFireLevel,
  typedHint,
  type DiffSegment,
  type ExerciseType,
  type Feedback,
  type FeedbackKind,
  type TypedHint,
} from '@kurda/shared';
import { ClipSpeaker } from '../characters/ClipSpeaker';
import type { SpokenClip } from '../characters/clips';
import { HevaloWindow } from '../characters/HevaloWindow';
import type { CharacterReaction } from '../characters/SpeakingCharacter';
import { Button } from '../components/Button';
import { Fire } from '../components/Fire';
import { BookIcon, CheckIcon, CloseIcon } from '../components/icons';
import { play } from '../lib/sound';
import { autoplayOn } from '../lib/sounds';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { BarRow } from './ActionBar';
import { kurdishText } from './map';
import { PlayButton } from './PlayButton';

/** What the verdict says; each must be true of the answer it is shown for (`feedbackKind`). */
const VERDICT: Record<FeedbackKind, MessageKey> = {
  correct: 'lesson.fb.correct',
  almost: 'lesson.fb.almost',
  almostStrict: 'lesson.fb.almostStrict',
  notYet: 'lesson.fb.notYet',
  spokenGood: 'lesson.fb.spokenGood',
  spokenClose: 'lesson.fb.spokenClose',
  spokenRetry: 'lesson.fb.spokenRetry',
};

/** What a typed miss was, in one line (`typedHint`). */
const HINT: Record<TypedHint['kind'], MessageKey> = {
  marks: 'lesson.hint.marks',
  lookalike: 'lesson.hint.lookalike',
  order: 'lesson.hint.order',
  missing: 'lesson.hint.missing',
  extra: 'lesson.hint.extra',
};

/** Answers the learner types or builds, compared word by word with the right one (`answerDiff`). */
const TYPED: ReadonlySet<ExerciseType | undefined> = new Set<ExerciseType | undefined>(['translate', 'writing', 'listening']);
/** Exercise types whose right answer is Kurdish; other types' answers may be in any language. */
export const KURDISH_ANSWER: ReadonlySet<ExerciseType | undefined> = new Set<ExerciseType | undefined>(['translate', 'writing', 'listening', 'speaking']);

/** The height of the character beside the verdict (head to waist), and of Hevalo's window. */
const FEEDBACK_FACE = 88;
const STAND_IN = 96;

/** Isolates Kurdish inside an interface sentence, so it keeps its own direction without reordering the words around it. */
const isolate = (text: string): string => `⁨${text}⁩`;

function Marked({ segments }: { segments: DiffSegment[] }): React.JSX.Element {
  return (
    <>
      {segments.map((s, i) => (s.differs ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

/** One sentence for a screen reader: the verdict, and the right answer when there is one. */
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
  // "s → ş": the letter written, then the one meant, in the Kurdish reading order.
  const pairs = hint.pairs.map(([given, meant]) => (rtl ? `${given} ← ${meant}` : `${given} → ${meant}`)).join(', ');
  return t(HINT[hint.kind], { pairs: isolate(pairs) });
}

/** A run of right answers, shown from three; it pops at a milestone. */
export interface RunMark {
  count: number;
  milestone: boolean;
}

/**
 * The verdict sheet (ActionBar.tsx): the verdict in words and a mark, never colour alone; a typed answer above the
 * right one with what differs marked (a word left out, or the letters of a near miss) and, for a single kind of slip,
 * what it was ("only the marks differ: s → ş"); the recording, which plays by itself after the verdict (Settings → Sounds); and Continue where Check was, focused
 * so Enter goes on. A right answer may be praised in Kurdish, and runs count from three. Beside it stands the model's
 * speaker, or Hevalo on a lesson's first answer, every miss and milestones, so his cheer keeps its worth.
 */
export function FeedbackPanel({
  feedback,
  answerInPlace = false,
  kurdishAnswer = false,
  dialect,
  speaker = null,
  hevalo = null,
  praise = null,
  run = null,
  onWhy = null,
  onContinue,
}: {
  feedback: Feedback;
  /** The right answer is marked where it was chosen from (an option, a picture, a word), so the sheet does not repeat it. */
  answerInPlace?: boolean;
  /** The right answer is Kurdish whatever the item's type (a reply chosen in Kurdish, a missing word). */
  kurdishAnswer?: boolean;
  dialect: string | null | undefined;
  /** Who says the model, when nobody above does (`feedbackClip`). */
  speaker?: SpokenClip | null;
  /** Hevalo's reaction, when he stands in beside this verdict. */
  hevalo?: CharacterReaction | null;
  /** The Kurdish word a right answer is praised with. */
  praise?: string | null;
  /** Right answers in a row, once there are enough to show. */
  run?: RunMark | null;
  /** Opens the skill's Tips, when it has them. */
  onWhy?: (() => void) | null;
  onContinue: () => void;
}): React.JSX.Element {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const kind = feedbackKind(feedback);
  const tone = !feedback.accepted ? 'notyet' : feedback.verdict === 'correct' ? 'right' : 'almost';
  const { lang, dir } = kurdishText(dialect);
  const typed = TYPED.has(feedback.exerciseType) && feedback.given !== undefined && !!feedback.correction;
  const diff = typed ? answerDiff(feedback.given!, feedback.correction!) : null;
  const hint = typed ? hintLine(typedHint(feedback.given!, feedback.correction!, dialect), dir === 'rtl', t) : null;
  const kurdish = kurdishAnswer || KURDISH_ANSWER.has(feedback.exerciseType);
  const shownRun = run && run.count >= RUN_SHOWN_FROM ? run : null;
  const model = feedback.modelAudioUrl;

  // Focus goes to Continue, where Check was: Enter, Enter is the lesson.
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('.lesson-bar-go')?.focus({ preventScroll: true });
  }, []);

  // The Kurdish plays after the verdict's chime through the app's one player, so the character beside it says it; not
  // for a spoken answer, whose model was just compared, and stopped on Continue.
  useEffect(() => {
    if (!model || feedback.exerciseType === 'speaking' || !autoplayOn()) return;
    const id = window.setTimeout(() => play(model), VERDICT_TIMING.modelAtMs);
    return () => window.clearTimeout(id);
  }, [model, feedback.exerciseType]);

  // Enter goes on from anywhere but another control, and not from a dialog (the Tips) over the lesson.
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
    // Cheering a right answer, thinking a wrong one over; a click replays it.
    <ClipSpeaker clips={[speaker]} crop="half" size={FEEDBACK_FACE} decorative replay reaction={feedback.accepted ? 'cheer' : 'hmm'} />
  ) : hevalo ? (
    <HevaloWindow size={STAND_IN} reaction={hevalo} />
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
                <Fire size={16} level={runFireLevel(shownRun.count)} />
                {t('lesson.inARow', { count: shownRun.count })}
              </span>
            )}
          </p>

          {diff ? (
            <dl className="lesson-compare">
              {/* Read as written: a Soranî course's English answer runs left to right. */}
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
            feedback.correction &&
            !answerInPlace && (
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
