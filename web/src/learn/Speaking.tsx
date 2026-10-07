import { useEffect, useMemo, useRef, useState } from 'react';
import { recordingProblem, type SelfRating } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { MicIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Ask, Prompt, type ExerciseProps } from './Exercises';
import { PlayButton } from './PlayButton';
import { recorderSupported, uploadType, useRecorder } from './useRecorder';

const RATINGS: Array<{ rating: SelfRating; label: MessageKey }> = [
  { rating: 'good', label: 'lesson.speak.rateGood' },
  { rating: 'close', label: 'lesson.speak.rateClose' },
  { rating: 'retry', label: 'lesson.speak.rateRetry' },
];

type Upload =
  | { status: 'none' }
  | { status: 'uploading' }
  | { status: 'ready'; key: string }
  | { status: 'problem'; message: MessageKey };

/**
 * Say it aloud (KUR-036): record after a tap, hear yourself beside the native
 * speaker, and say how close it was — "Sounded right / Close / Try again".
 *
 * Nothing on the server can judge a recording, and saying "correct" to every
 * one taught nothing, so the learner's ear is the judge: the rating goes in
 * with the recording, and comparing one's own attempt with the model is the
 * practice. "Try again" brings the phrase back later in the lesson, like any
 * miss. A refused microphone is said plainly, with how to allow it, and never
 * switches speaking off for good; "Can't speak now" puts this one off.
 */
export function Speaking({ exercise, locked, busy, onAnswer, onSkip }: ExerciseProps): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const recorder = useRecorder();
  const [upload, setUpload] = useState<Upload>({ status: 'none' });
  const supported = recorderSupported();
  const take = recorder.take;
  const own = useMemo(() => (take ? URL.createObjectURL(take.blob) : null), [take]);
  useEffect(
    () => () => {
      if (own) URL.revokeObjectURL(own);
    },
    [own],
  );

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // a new take: check it is a take at all, then send it
  const sent = useRef<Blob | null>(null);
  useEffect(() => {
    if (!take || sent.current === take.blob) return;
    sent.current = take.blob;
    const problem = recordingProblem({ durationMs: take.durationMs, byteSize: take.blob.size });
    if (problem) {
      setUpload({ status: 'problem', message: problem === 'tooShort' ? 'lesson.speak.tooShort' : 'lesson.speak.silent' });
      return;
    }
    setUpload({ status: 'uploading' });
    const body = new Blob([take.blob], { type: uploadType(take.blob.type) });
    void client.uploadBytes<{ key: string }>('/media/uploads', body).then((res) => {
      if (!mounted.current || sent.current !== take.blob) return;
      setUpload(res.ok ? { status: 'ready', key: res.data.key } : { status: 'problem', message: 'lesson.speak.uploadFailed' });
    });
  }, [take, client]);

  const record = (): void => {
    setUpload({ status: 'none' });
    void recorder.start();
  };

  const phase = recorder.phase;
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
  } else if (upload.status === 'uploading') {
    body = (
      <p className="lesson-note" role="status">
        {t('lesson.speak.saving')}
      </p>
    );
  } else if (upload.status === 'ready') {
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
              onClick={() => onAnswer({ audioKey: upload.key, selfRating: rating })}
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
    <div className="lesson-exercise">
      <Ask focus>{t('lesson.speak.ask')}</Ask>
      <Prompt text={exercise.prompt} />
      {exercise.modelAudioUrl && upload.status !== 'ready' && (
        <div className="lesson-listen">
          <PlayButton src={exercise.modelAudioUrl} label={t('lesson.speak.model')} />
        </div>
      )}
      <div className="lesson-speak">{body}</div>
      {upload.status === 'problem' && (
        <p className="lesson-note" role="alert">
          {t(upload.message)}
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
