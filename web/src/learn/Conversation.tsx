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
  /** the line being heard, or null when the conversation is not playing */
  at: number | null;
  start: () => void;
  halt: () => void;
}

/**
 * The whole conversation heard through, one recorded line after another,
 * through the app's one player (lib/sound.ts), so it never talks over anything
 * else. A line with no recording is passed over, never guessed at. Anything
 * else taking the player — a line's own button, an option's — ends the run,
 * and so does leaving the exercise.
 */
function usePlayThrough(audio: ReadonlyArray<string | null>): PlayThrough {
  const [at, setAt] = useState<number | null>(null);
  // the player's events can arrive before React renders again: they read this, not the state
  const live = useRef({ at: null as number | null, audio });
  live.current.audio = audio;

  // from line `from` on: the first one with a recording, or the end
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

  // a line plays to its end: the next one
  useEffect(
    () =>
      onEnded((src) => {
        const now = live.current.at;
        if (now !== null && live.current.audio[now] === src) go(now + 1);
      }),
    [go],
  );

  // something else took the player: let go, without stopping what it plays
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

  // Continue, or leaving the lesson, ends the conversation mid-line
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
 * Two or three of the characters talking, then a question about what they
 * said, asked and graded as a multiple-choice item is (`Choices`).
 *
 * They stand together on a stage above, looking at each other, and whoever
 * says the line playing now says it, mouth moving with it: always that line's
 * own character (`ConversationStage`, which follows the one player from line
 * to line). The lines are speech bubbles in order: the first speaker's on the
 * start side, everyone else's across from them, each speaker in a tint of
 * their own and named over every line, so who says what never rests on
 * colour. A line with a recording has its own small button, and "Play
 * conversation" hears every recorded line through, marking the one being
 * heard (`aria-current`) and keeping it in view. The English of each line is
 * there for a learner who asks for it.
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

  // the line being heard stays in view; under reduced motion it jumps rather than glides
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
          // three speakers at most, each with a tint of their own; anything out of range reads as the first
          const tint = line.speaker > 0 && line.speaker < CONVERSATION_LIMITS.speakersMax ? line.speaker : 0;
          return (
            <li
              key={i}
              ref={now ? heard : undefined}
              className={`lesson-line is-part-${tint}${tint > 0 ? ' is-end' : ''}${now ? ' is-heard' : ''}`}
              aria-current={now || undefined}
            >
              <div className="lesson-line-bubble">
                {who && (
                  <span className="lesson-line-name">
                    <span lang={lang} dir={dir}>
                      {who.name}
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
              {src && <PlayButton round src={src} label={t('lesson.conversation.hearLine', { number: i + 1, name: who?.name ?? '' })} />}
            </li>
          );
        })}
      </ol>
      <Prompt text={exercise.prompt} />
      <Choices {...props} />
    </div>
  );
}
