import { useT } from '../i18n/I18nProvider';
import { HeadphonesIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../components/icons';
import { TEXT_SIZES } from './prefs';
import type { StoryAudio } from './useStoryAudio';

/** Smaller / larger text, remembered on the device by the caller. */
export function TextSizeControl({ step, onChange }: { step: number; onChange: (next: number) => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="story-size" role="group" aria-label={t('stories.reader.textSize')}>
      <button
        type="button"
        className="story-size-btn"
        onClick={() => onChange(step - 1)}
        disabled={step <= 0}
        aria-label={t('stories.reader.smaller')}
      >
        <span aria-hidden className="story-size-a is-small">
          A
        </span>
      </button>
      <button
        type="button"
        className="story-size-btn"
        onClick={() => onChange(step + 1)}
        disabled={step >= TEXT_SIZES.length - 1}
        aria-label={t('stories.reader.larger')}
      >
        <span aria-hidden className="story-size-a">
          A
        </span>
      </button>
    </div>
  );
}

/**
 * The whole story read aloud — shown only when every sentence has a
 * recording, so it never stops halfway through for want of one. Play and
 * pause, a sentence back or on, and a slower speed that keeps the voice.
 */
export function StoryPlayerBar({ audio }: { audio: StoryAudio }): React.JSX.Element {
  const t = useT();
  const onStory = audio.scope?.kind === 'story';
  const playing = audio.playing && onStory;
  return (
    <div className="story-player" role="group" aria-label={t('stories.player.label')}>
      <span className="story-player-icon" aria-hidden>
        <HeadphonesIcon size={18} />
      </span>
      <button
        type="button"
        className="story-player-btn"
        onClick={audio.previous}
        disabled={!onStory}
        aria-label={t('stories.player.previous')}
      >
        <PreviousIcon size={18} />
      </button>
      <button
        type="button"
        className="story-player-btn is-main"
        onClick={playing ? audio.pause : audio.playStory}
        aria-label={playing ? t('stories.player.pause') : t('stories.player.play')}
      >
        {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
      </button>
      <button
        type="button"
        className="story-player-btn"
        onClick={audio.next}
        disabled={!onStory}
        aria-label={t('stories.player.next')}
      >
        <NextIcon size={18} />
      </button>
      <div className="story-player-speed" role="group" aria-label={t('stories.player.speed')}>
        {([1, 0.75] as const).map((r) => (
          <button
            key={r}
            type="button"
            className={`story-player-rate${audio.rate === r ? ' is-on' : ''}`}
            aria-pressed={audio.rate === r}
            onClick={() => audio.setSpeed(r)}
          >
            {r === 1 ? '1×' : '0.75×'}
          </button>
        ))}
      </div>
    </div>
  );
}
