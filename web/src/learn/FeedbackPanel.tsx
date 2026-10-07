import { useEffect, useRef } from 'react';
import { feedbackKind, letterDiff, type DiffSegment, type ExerciseType, type Feedback, type FeedbackKind } from '@kurda/shared';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
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

/** Answers that are Kurdish typed by the learner, set letter by letter against the right one. */
const TYPED: ReadonlySet<ExerciseType | undefined> = new Set<ExerciseType | undefined>(['translate', 'writing', 'listening']);
/** Answers whose right answer is Kurdish (a multiple-choice option or a pair may be in any language). */
const KURDISH_ANSWER: ReadonlySet<ExerciseType | undefined> = new Set<ExerciseType | undefined>(['translate', 'writing', 'listening', 'speaking']);

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

/**
 * After an answer: the verdict in words and a mark (never colour alone), the
 * learner's typed answer above the right one with the letters that differ
 * marked, the native recording to hear now that it gives nothing away, and
 * Continue. The focus comes here so a keyboard can go on with Enter, and the
 * exercise that follows takes it back.
 */
export function FeedbackPanel({
  feedback,
  dialect,
  onContinue,
}: {
  feedback: Feedback;
  dialect: string | null | undefined;
  onContinue: () => void;
}): React.JSX.Element {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const kind = feedbackKind(feedback);
  const tone = !feedback.accepted ? 'notyet' : feedback.verdict === 'correct' ? 'right' : 'almost';
  const { lang, dir } = kurdishText(dialect);
  const typed = TYPED.has(feedback.exerciseType) && feedback.given !== undefined && !!feedback.correction;
  const diff = typed ? letterDiff(feedback.given!, feedback.correction!) : null;
  const kurdish = KURDISH_ANSWER.has(feedback.exerciseType);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  // Enter goes on from anywhere but another control: from the panel, or from
  // the page after a click elsewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue]);

  return (
    <div className={`lesson-feedback is-${tone}`} ref={panel} tabIndex={-1} role="region" aria-label={t('lesson.fb.label')}>
      <p className="lesson-verdict">
        <span className="lesson-verdict-mark" aria-hidden="true">
          {tone === 'notyet' ? <CloseIcon size={18} /> : <CheckIcon size={18} />}
        </span>
        {t(VERDICT[kind])}
      </p>

      {diff ? (
        <dl className="lesson-compare">
          <dt>{t('lesson.fb.yours')}</dt>
          <dd lang={lang} dir={dir}>
            <Marked segments={diff.given} />
          </dd>
          <dt>{t('lesson.fb.right')}</dt>
          <dd lang={lang} dir={dir}>
            <Marked segments={diff.expected} />
          </dd>
        </dl>
      ) : (
        feedback.correction && (
          <p className="lesson-correction">
            {t('lesson.fb.answer')}{' '}
            <strong lang={kurdish ? lang : undefined} dir={kurdish ? dir : 'auto'}>
              {feedback.correction}
            </strong>
          </p>
        )
      )}

      {feedback.comesBack && <p className="lesson-note">{t('lesson.fb.comesBack')}</p>}
      {feedback.reask && <p className="lesson-note">{t('lesson.fb.reaskNote')}</p>}

      <div className="lesson-feedback-actions">
        {feedback.modelAudioUrl && <PlayButton src={feedback.modelAudioUrl} label={t('lesson.fb.hear')} />}
        <Button onClick={onContinue}>{t('lesson.continue')}</Button>
      </div>
    </div>
  );
}
