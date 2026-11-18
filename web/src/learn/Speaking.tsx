import { useEffect, useMemo, useRef, useState } from 'react';
import { recordingProblem, type SelfRating } from '@kurda/shared';
import { Button } from '../components/Button';
import { MicIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { askHeadline } from './asks';
import { Ask, Cue, Prompt, type ExerciseProps } from './Exercises';
import { PlayButton } from './PlayButton';
import { recorderSupported, useRecorder } from './useRecorder';
import { ExerciseVoice, exerciseClips } from './Voice';

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
 * Say it aloud: record after a tap, compare with the native speaker, and rate it "Sounded right / Close / Try again".
 * The server cannot judge recordings, so the learner's rating is the answer, sent by Check as on the phone; "Try again"
 * brings the phrase back later like any miss. The take never leaves the browser. A refused microphone is described
 * plainly with where to change it, never as an instruction and never turning speaking off for good; "Can't speak now"
 * puts speaking off for the rest of the lesson.
 */
export function Speaking({ exercise, dialect, locked, busy, formId, onReady, onAnswer }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const recorder = useRecorder();
  const [taken, setTaken] = useState<Take>({ status: 'none' });
  const [rating, setRating] = useState<SelfRating | null>(null);
  const ready = taken.status === 'ready' && rating !== null;
  useEffect(() => onReady(ready), [ready, onReady]);
  const supported = recorderSupported();
  const take = recorder.take;
  const own = useMemo(() => (take ? URL.createObjectURL(take.blob) : null), [take]);
  useEffect(
    () => () => {
      if (own) URL.revokeObjectURL(own);
    },
    [own],
  );

  // A new take: check it is a take at all, then it is ready to hear and rate.
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
    setRating(null);
    void recorder.start();
  };

  const phase = recorder.phase;

  // Focus follows the recording: each step replaces the pressed button (Record, Stop, "Saving…", the ratings), which would
  // drop focus to the page, so the step's first button takes it. Only focus the flow itself lost is moved.
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
          {exercise.modelAudioUrl && <PlayButton src={exercise.modelAudioUrl} label={t('lesson.speak.model')} round />}
          <Button variant="ghost" size="sm" onClick={record} disabled={locked || busy}>
            {t('lesson.speak.again')}
          </Button>
        </div>
        <p className="lesson-note" id={`rate-${exercise.id}`}>
          {t('lesson.speak.rateAsk')}
        </p>
        <form
          id={formId}
          className="lesson-rate"
          role="group"
          aria-labelledby={`rate-${exercise.id}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!locked && !busy && rating) onAnswer({ selfRating: rating });
          }}
        >
          {RATINGS.map((r) => (
            <Button
              key={r.rating}
              type="button"
              variant="secondary"
              className={rating === r.rating ? 'is-selected' : undefined}
              aria-pressed={rating === r.rating}
              disabled={locked || busy}
              onClick={() => setRating(r.rating)}
            >
              {t(r.label)}
            </Button>
          ))}
        </form>
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
      {/* "Repeat after Hamo" when the item asks that and Hamo says the model. */}
      <Ask focus>{askHeadline(exercise, t, { tiles: false, dialect }) ?? t('lesson.speak.ask')}</Ask>
      {/* The speaker stays during the comparison and speaks again when the model plays. */}
      <ExerciseVoice clips={exerciseClips(exercise)}>
        <Prompt text={exercise.prompt} />
        {exercise.modelAudioUrl && taken.status !== 'ready' && (
          <div className="lesson-listen">
            <PlayButton src={exercise.modelAudioUrl} label={t('lesson.speak.model')} round />
          </div>
        )}
        <Cue text={exercise.cue} />
      </ExerciseVoice>
      <div className="lesson-speak" ref={controls}>
        {body}
      </div>
      {taken.status === 'problem' && (
        <p className="lesson-note" role="alert">
          {t(taken.message)}
        </p>
      )}
    </div>
  );
}
