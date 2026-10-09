import { useEffect, useMemo, useRef, useState } from 'react';
import { recordingProblem, type SelfRating } from '@kurda/shared';
import { Button } from '../components/Button';
import { MicIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Ask, Prompt, type ExerciseProps } from './Exercises';
import { PlayButton } from './PlayButton';
import { recorderSupported, useRecorder } from './useRecorder';

const RATINGS: Array<{ rating: SelfRating; label: MessageKey }> = [
  { rating: 'good', label: 'lesson.speak.rateGood' },
  { rating: 'close', label: 'lesson.speak.rateClose' },
  { rating: 'retry', label: 'lesson.speak.rateRetry' },
];

type Take =
  | { status: 'none' }
  | { status: 'ready' }
  | { status: 'problem'; message: MessageKey };

/**
 * Say it aloud (KUR-036): record after a tap, hear yourself beside the native
 * speaker, and say how close it was — "Sounded right / Close / Try again".
 *
 * Nothing on the server can judge a recording, and saying "correct" to every
 * one taught nothing, so the learner's ear is the judge: the rating is the
 * answer, and comparing one's own attempt with the model is the practice. The
 * take never leaves the browser — nothing on the server would listen to it,
 * and a stored copy of every learner's voice was data kept for no use. "Try again" brings the phrase back later in the lesson, like any
 * miss. A refused microphone is said plainly, with how to allow it, and never
 * switches speaking off for good; "Can't speak now" puts this one off.
 */
export function Speaking({ exercise, locked, busy, onAnswer, onSkip }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const recorder = useRecorder();
  const [taken, setTaken] = useState<Take>({ status: 'none' });
  const supported = recorderSupported();
  const take = recorder.take;
  const own = useMemo(() => (take ? URL.createObjectURL(take.blob) : null), [take]);
  useEffect(
    () => () => {
      if (own) URL.revokeObjectURL(own);
    },
    [own],
  );

  // a new take: check it is a take at all, then it is ready to hear and rate
  const seen = useRef<Blob | null>(null);
  useEffect(() => {
    if (!take || seen.current === take.blob) return;
    seen.current = take.blob;
    const problem = recordingProblem({ durationMs: take.durationMs, byteSize: take.blob.size });
    setTaken(
      problem
        ? { status: 'problem', message: problem === 'tooShort' ? 'lesson.speak.tooShort' : 'lesson.speak.silent' }
        : { status: 'ready' },
    );
  }, [take]);

  const record = (): void => {
    setTaken({ status: 'none' });
    void recorder.start();
  };

  const phase = recorder.phase;

  // Keyboard focus follows the recording. Each step replaces the button just
  // pressed — Record gives way to Stop, Stop to "Saving…" and then the ratings
  // — and a focused button that goes away leaves the focus on the page itself,
  // so a keyboard or screen-reader user would have to find their way back from
  // the top. The step's first button takes it instead: Stop while recording,
  // "Hear yourself" once the take is saved, Record (or the microphone again)
  // after a problem. Only focus the flow itself lost is moved: never away from
  // wherever the learner has gone meanwhile.
  const root = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const step = !supported
    ? null
    : phase === 'recording'
      ? 'stop'
      : phase === 'denied' || phase === 'noMic' || phase === 'failed'
        ? 'microphone'
        : phase === 'asking'
          ? null
          : taken.status === 'ready'
            ? 'listen'
            : taken.status === 'problem'
              ? 'record'
              : null;
  useEffect(() => {
    if (!step) return;
    const active = document.activeElement;
    if (active && active !== document.body && !root.current?.contains(active)) return;
    controls.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [step]);
  let body: React.ReactNode;
  if (!supported) {
    body = <p className="lesson-note">{t('lesson.speak.unsupported')}</p>;
  } else if (phase === 'denied' || phase === 'noMic' || phase === 'failed') {
    body = (
      <>
        <p className="lesson-note" role="alert">
          {phase === 'denied' ? t('lesson.speak.denied') : phase === 'noMic' ? t('lesson.speak.noMic') : t('lesson.speak.failed')}
        </p>
        <Button variant="secondary" size="sm" onClick={record} disabled={locked}>
          {t('lesson.speak.tryMic')}
        </Button>
      </>
    );
  } else if (phase === 'asking') {
    body = (
      <p className="lesson-note" role="status">
        {t('lesson.speak.asking')}
      </p>
    );
  } else if (phase === 'recording') {
    body = (
      <>
        <p className="lesson-recording" role="status">
          <span className="lesson-recording-dot" aria-hidden="true" />
          {t('lesson.speak.recording')}
        </p>
        <Button onClick={recorder.stop}>{t('lesson.speak.stop')}</Button>
      </>
    );
  } else if (taken.status === 'ready') {
    body = (
      <>
        <div className="lesson-listen">
          {own && <PlayButton src={own} label={t('lesson.speak.own')} />}
          {exercise.modelAudioUrl && <PlayButton src={exercise.modelAudioUrl} label={t('lesson.speak.model')} />}
          <Button variant="ghost" size="sm" onClick={record} disabled={locked || busy}>
            {t('lesson.speak.again')}
          </Button>
        </div>
        <p className="lesson-note" id={`rate-${exercise.id}`}>
          {t('lesson.speak.rateAsk')}
        </p>
        <div className="lesson-rate" role="group" aria-labelledby={`rate-${exercise.id}`}>
          {RATINGS.map(({ rating, label }) => (
            <Button
              key={rating}
              variant="secondary"
              disabled={locked || busy}
              onClick={() => onAnswer({ selfRating: rating })}
            >
              {t(label)}
            </Button>
          ))}
        </div>
      </>
    );
  } else {
    body = (
      <Button onClick={record} disabled={locked}>
        <MicIcon size={18} />
        {t('lesson.speak.record')}
      </Button>
    );
  }

  return (
    <div className="lesson-exercise" ref={root}>
      <Ask focus>{t('lesson.speak.ask')}</Ask>
      <Prompt text={exercise.prompt} />
      {exercise.modelAudioUrl && taken.status !== 'ready' && (
        <div className="lesson-listen">
          <PlayButton src={exercise.modelAudioUrl} label={t('lesson.speak.model')} />
        </div>
      )}
      <div className="lesson-speak" ref={controls}>
        {body}
      </div>
      {taken.status === 'problem' && (
        <p className="lesson-note" role="alert">
          {t(taken.message)}
        </p>
      )}
      {!locked && (
        <button type="button" className="link-btn lesson-skip" onClick={onSkip} disabled={busy}>
          {t('lesson.speak.skip')}
        </button>
      )}
    </div>
  );
}
