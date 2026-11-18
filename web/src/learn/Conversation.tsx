import { useCallback, useEffect, useRef, useState } from 'react';
import { CONVERSATION_LIMITS } from '@kurda/shared';
import { ConversationStage } from '../characters/ConversationStage';
import { Button } from '../components/Button';
import { PlayIcon, StopIcon } from '../components/icons';
import { onEnded, onPlaying, play, stop } from '../lib/sound';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useT } from '../i18n/I18nProvider';
import { Ask, Choices, Prompt, verdictOf, type ExerciseProps } from './Exercises';
import { kurdishText } from './map';
import { PlayButton } from './PlayButton';

/** A conversation with no line recorded yet sends no `lineAudio` at all. */
const NO_AUDIO: ReadonlyArray<string | null> = [];

interface PlayThrough {
  /** The line being heard, or null when the conversation is not playing. */
  at: number | null;
  start: () => void;
  halt: () => void;
}

/**
 * Plays the whole conversation, one recorded line after another, through the app's one player (lib/sound.ts); unrecorded
 * lines are skipped. Anything else taking the player, or leaving the exercise, ends the run.
 */
function usePlayThrough(audio: ReadonlyArray<string | null>): PlayThrough {
  const [at, setAt] = useState<number | null>(null);
  // Player events can arrive before React re-renders, so they read this, not the state.
  const live = useRef({ at: null as number | null, audio });
  live.current.audio = audio;

  // From line `from` on: the first one with a recording, or the end.
  const go = useCallback((from: number) => {
    const list = live.current.audio;
    let i = from;
    while (i < list.length && !list[i]) i++;
    const src = list[i];
    live.current.at = src ? i : null;
    setAt(live.current.at);
    if (src) play(src);
  }, []);

  const halt = useCallback(() => {
    if (live.current.at === null) return;
    live.current.at = null;
    setAt(null);
    stop();
  }, []);

  // A line played to its end: the next one.
  useEffect(
    () =>
      onEnded((src) => {
        const now = live.current.at;
        if (now !== null && live.current.audio[now] === src) go(now + 1);
      }),
    [go],
  );

  // Something else took the player: let go without stopping it.
  useEffect(
    () =>
      onPlaying((src) => {
        const now = live.current.at;
        if (src === null || now === null || live.current.audio[now] === src) return;
        live.current.at = null;
        setAt(null);
      }),
    [],
  );

  // Continue, or leaving the lesson, ends the conversation mid-line.
  useEffect(
    () => () => {
      if (live.current.at !== null) stop();
    },
    [],
  );

  const start = useCallback(() => go(0), [go]);
  return { at, start, halt };
}

/**
 * Two or three characters talking, or one with the learner, then a question on what they said, graded as multiple choice
 * (`Choices`). They stand together on a stage, and each line's own character speaks it (`ConversationStage`). Lines are
 * bubbles in order: the first speaker on the start side, others across, each tinted and named so who speaks never rests
 * on colour. The learner's own lines sit on the end side under "You", to read and say, never recorded. Recorded lines
 * have their own button, and "Play conversation" plays them all, marking the current one (`aria-current`) and keeping
 * it in view. Each line's English is there on request.
 */
export function Conversation(props: ExerciseProps): React.JSX.Element {
  const { exercise, dialect, feedback } = props;
  const t = useT();
  const speakers = exercise.speakers ?? [];
  const lines = exercise.lines ?? [];
  const audio = exercise.lineAudio ?? NO_AUDIO;
  const { lang, dir } = kurdishText(dialect);
  const { at, start, halt } = usePlayThrough(audio);
  const [translated, setTranslated] = useState(false);
  const recorded = audio.some(Boolean);
  const meanings = lines.some((line) => !!line.en);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const heard = useRef<HTMLLIElement | null>(null);
  const verdict = verdictOf(feedback);

  // The line being heard stays in view; under reduced motion it jumps.
  useEffect(() => {
    if (at !== null) heard.current?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }, [at, calm]);

  return (
    <div className="lesson-exercise lesson-conversation">
      <Ask focus>{t('lesson.conversation.ask')}</Ask>
      {exercise.title && (
        <h3 className="lesson-conversation-title" lang={lang} dir={dir}>
          {exercise.title}
        </h3>
      )}
      <ConversationStage
        speakers={speakers}
        lines={lines}
        audio={audio}
        voices={exercise.lineVoices ?? undefined}
        at={at}
        reaction={verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null}
      />
      {(recorded || meanings) && (
        <div className="lesson-conversation-tools">
          {recorded && (
            <Button size="sm" className={`lesson-play${at !== null ? ' is-on' : ''}`} onClick={at === null ? start : halt}>
              {at === null ? <PlayIcon size={17} /> : <StopIcon size={17} />}
              {at === null ? t('lesson.conversation.play') : t('lesson.conversation.stop')}
            </Button>
          )}
          {meanings && (
            <Button size="sm" variant="secondary" onClick={() => setTranslated((on) => !on)}>
              {translated ? t('lesson.conversation.hideTranslation') : t('lesson.conversation.showTranslation')}
            </Button>
          )}
        </div>
      )}
      <ol className="lesson-lines" aria-label={t('lesson.conversation.lines')}>
        {lines.map((line, i) => {
          const who = speakers[line.speaker];
          const src = audio[i];
          const now = at === i;
          const yours = who?.learner === true;
          // At most three speakers with their own tints; anything out of range reads as the first.
          const tint = line.speaker > 0 && line.speaker < CONVERSATION_LIMITS.speakersMax ? line.speaker : 0;
          const name = yours ? t('lesson.conversation.you') : who?.name;
          return (
            <li
              key={i}
              ref={now ? heard : undefined}
              className={`lesson-line ${yours ? 'is-you is-end' : `is-part-${tint}${tint > 0 ? ' is-end' : ''}`}${now ? ' is-heard' : ''}`}
              aria-current={now || undefined}
            >
              <div className="lesson-line-bubble">
                {name && (
                  <span className="lesson-line-name">
                    {/* The learner's own part is named in their language, a character in Kurdish. */}
                    <span lang={yours ? undefined : lang} dir={yours ? undefined : dir}>
                      {name}
                    </span>
                    <span className="sr-only">: </span>
                  </span>
                )}
                <span className="lesson-line-text" lang={lang} dir={dir}>
                  {line.text}
                </span>
                {translated && line.en && (
                  <span className="lesson-line-meaning" lang="en" dir="ltr">
                    {line.en}
                  </span>
                )}
              </div>
              {src && <PlayButton round src={src} label={t('lesson.conversation.hearLine', { number: i + 1, name: name ?? '' })} />}
            </li>
          );
        })}
      </ol>
      <Prompt text={exercise.prompt} />
      <Choices {...props} />
    </div>
  );
}
