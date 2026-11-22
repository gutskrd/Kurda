import { useCallback, useEffect, useRef, useState } from 'react';
import { CONVERSATION_LIMITS } from '@kurda/shared';
import { ConversationStage } from '../characters/ConversationStage';
import { Button } from '../components/Button';
import { PlayIcon } from '../components/icons';
import { onPlaying, play, position, sounding, stop } from '../lib/sound';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useT } from '../i18n/I18nProvider';
import { Ask, Choices, Prompt, verdictOf, type ExerciseProps } from './Exercises';
import { kurdishText } from './map';
import { PlayButton } from './PlayButton';
import { useAutoplay } from './useAutoplay';

/** A conversation with no line recorded yet sends no `lineAudio` at all. */
const NO_AUDIO: ReadonlyArray<string | null> = [];

/** What the main button does next: the first line, the one after the line heard last, or the first again after the end. */
type Step = 'first' | 'next' | 'again';

interface LineByLine {
  /** The line heard last, by any of its buttons or by itself; null before any. */
  at: number | null;
  step: Step;
  playNext: () => void;
}

/** The first line from `from` on with a recording, or null. */
function nextRecorded(audio: ReadonlyArray<string | null>, from: number): number | null {
  for (let i = from; i < audio.length; i++) if (audio[i]) return i;
  return null;
}

/**
 * The conversation one line at a time through the app's one player (lib/sound.ts): the first recorded line by itself as
 * the exercise appears (`useAutoplay`), then the next each time the learner asks, so nobody is talked at for a whole
 * dialogue in one go. Unrecorded lines are skipped. A line started from its own button moves the place along too.
 */
function useLineByLine(audio: ReadonlyArray<string | null>): LineByLine {
  const [at, setAt] = useState<number | null>(null);
  // Player events can arrive before React re-renders, so they read this, not the state; `asked` tells a line said twice
  // in the conversation apart from its first time.
  const live = useRef({ asked: null as number | null, audio });
  live.current.audio = audio;
  const first = nextRecorded(audio, 0);
  useAutoplay(first === null ? null : audio[first]);

  useEffect(
    () =>
      onPlaying((src) => {
        if (src === null) return;
        const { asked, audio: list } = live.current;
        live.current.asked = null;
        const i = asked !== null && list[asked] === src ? asked : list.indexOf(src);
        if (i >= 0) setAt(i);
      }),
    [],
  );

  // Continue, or leaving the lesson, ends a line mid-way.
  useEffect(
    () => () => {
      const { src } = position();
      if (src && sounding() && live.current.audio.includes(src)) stop();
    },
    [],
  );

  const after = at === null ? first : nextRecorded(audio, at + 1);
  const step: Step = at === null ? 'first' : after === null ? 'again' : 'next';
  const playNext = useCallback(() => {
    const i = after ?? first;
    const src = i === null ? null : live.current.audio[i];
    if (i === null || !src) return;
    live.current.asked = i;
    play(src);
  }, [after, first]);
  return { at, step, playNext };
}

/** The main button's words for each step. */
const STEP_LABEL = { first: 'lesson.conversation.first', next: 'lesson.conversation.next', again: 'lesson.conversation.again' } as const;

/**
 * Two or three characters talking, or one with the learner, then a question on what they said, graded as multiple choice
 * (`Choices`). They stand together on a stage, and each line's own character speaks it (`ConversationStage`). Lines are
 * bubbles in order: the first speaker on the start side, others across, each tinted and named so who speaks never rests
 * on colour. The learner's own lines sit on the end side under "You", to read and say, never recorded. Recorded lines
 * have their own button; the first plays by itself and the main button plays the next (`useLineByLine`), marking the
 * line heard last (`aria-current`) and keeping it in view. Each line's English is there on request.
 */
export function Conversation(props: ExerciseProps): React.JSX.Element {
  const { exercise, dialect, feedback } = props;
  const t = useT();
  const speakers = exercise.speakers ?? [];
  const lines = exercise.lines ?? [];
  const audio = exercise.lineAudio ?? NO_AUDIO;
  const { lang, dir } = kurdishText(dialect);
  const { at, step, playNext } = useLineByLine(audio);
  const [translated, setTranslated] = useState(false);
  const recorded = audio.some(Boolean);
  const meanings = lines.some((line) => !!line.en);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const heard = useRef<HTMLLIElement | null>(null);
  const verdict = verdictOf(feedback);

  // The line heard last stays in view; under reduced motion it jumps.
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
            <Button size="sm" className="lesson-play" onClick={playNext}>
              <PlayIcon size={17} />
              {t(STEP_LABEL[step])}
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
