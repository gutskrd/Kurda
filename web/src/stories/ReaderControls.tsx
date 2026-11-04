import { useMemo, useState } from 'react';
import { CHARACTER_NAMES } from '@kurda/shared';
import { ClipSpeaker, useSpokenClip } from '../characters/ClipSpeaker';
import { spokenClips } from '../characters/clips';
import { useT } from '../i18n/I18nProvider';
import { HeadphonesIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../components/icons';
import { TEXT_SIZES } from './prefs';
import { nextRate, useNarrationClock, type StoryAudio } from './useStoryAudio';

/**
 * Who says the story's lines, at the head of the reader's tools so it stays
 * in view while the text scrolls: the character of the line being read,
 * mouth moving with it, and between lines the last one heard (before any, the
 * first). A story's lines can each have their own. Nothing when none has a
 * character. Named for a screen reader ("Xezo speaking"), since no button
 * says who is reading.
 */
export function StorySpeaker({ audio }: { audio: StoryAudio }): React.JSX.Element | null {
  const clips = useMemo(() => spokenClips(audio.track.map((s) => ({ src: s.url, voice: s.voice, text: s.text }))), [audio.track]);
  return <ClipSpeaker clips={clips} className="speaker-tile story-speaker" />;
}

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

/** "1:05" — minutes and seconds of a point on the timeline, for the bar's clock and the seek line's spoken value. */
export function clockText(ms: number): string {
  const whole = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** The speed chip's word for a rate: "1×", "0.75×", "1.25×" — a number, the same in every language. */
export function rateText(rate: number): string {
  return `${rate}×`;
}

/**
 * The narrator's chip on the bar: the character saying the line being read
 * (mouth moving), and their name beside them. Nothing at all when no line
 * has a character — the bar then starts at its buttons.
 */
function Narrator({ audio }: { audio: StoryAudio }): React.JSX.Element | null {
  const t = useT();
  const clips = useMemo(() => spokenClips(audio.track.map((s) => ({ src: s.url, voice: s.voice, text: s.text }))), [audio.track]);
  const clip = useSpokenClip(clips);
  if (!clip) return null;
  const name = CHARACTER_NAMES[clip.voice.speaker];
  return (
    <span className="story-player-narrator" title={t('stories.player.narrator', { name })}>
      <ClipSpeaker clips={clips} decorative size={34} className="story-player-face" />
      <span className="story-player-narrator-name">{name}</span>
    </span>
  );
}

/**
 * The seek line over the stitched timeline: a range the finger or the arrow
 * keys move, drawn as a thin line with a dot. While a drag is under way the
 * line follows the finger and the reading is moved once, when it lets go —
 * moving it on every pixel would start the clip a hundred times. The arrow
 * keys have no drag, so they move the reading at once.
 */
function SeekLine({ audio, elapsed }: { audio: StoryAudio; elapsed: number }): React.JSX.Element {
  const t = useT();
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? elapsed;
  const commit = (): void => {
    if (drag === null) return;
    audio.seek(drag);
    setDrag(null);
  };
  return (
    <input
      type="range"
      className="story-player-seek"
      min={0}
      max={Math.max(1, audio.totalMs)}
      step={250}
      value={Math.min(shown, audio.totalMs)}
      aria-label={t('stories.player.seek')}
      aria-valuetext={t('stories.player.position', { elapsed: clockText(shown), total: clockText(audio.totalMs) })}
      style={{ '--seek': `${audio.totalMs > 0 ? (Math.min(shown, audio.totalMs) / audio.totalMs) * 100 : 0}%` } as React.CSSProperties}
      onPointerDown={() => setDrag(shown)}
      onPointerUp={commit}
      onPointerCancel={commit}
      onChange={(e) => {
        const ms = Number(e.target.value);
        if (drag !== null) setDrag(ms);
        else audio.seek(ms);
      }}
    />
  );
}

/**
 * The whole story read aloud, in one bar (design notes §4): the narrator,
 * a sentence back, play or pause — a quiet spinner in the button while the
 * network holds a sentence up — a sentence on, the seek line over the
 * stitched timeline with elapsed and total, and a speed chip that cycles
 * 1× → 1.25× → 0.75×. A story not recorded throughout says so under the
 * line ("4 of 9 sentences recorded") and plays what there is; a sentence
 * that will not play says so in one line and leaves the text readable.
 *
 * `docked` is the reader's own bar, held at the foot of the screen; without
 * it the bar sits among the tools (a game's reading phase, where the dock
 * at the foot is the game's).
 */
export function StoryPlayerBar({ audio, docked = false }: { audio: StoryAudio; docked?: boolean }): React.JSX.Element {
  const t = useT();
  const onStory = audio.scope?.kind === 'story';
  const playing = audio.playing && onStory;
  const elapsed = useNarrationClock(audio);
  const seekable = audio.totalMs > 0;
  const partial = audio.recordable > audio.track.length;
  return (
    <div className={`story-player${docked ? ' is-docked' : ''}`} role="group" aria-label={t('stories.player.label')}>
      <div className="story-player-row">
        <Narrator audio={audio} />
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
          className={`story-player-btn is-main${audio.buffering && playing ? ' is-waiting' : ''}`}
          onClick={playing ? audio.pause : audio.playStory}
          aria-label={playing ? t('stories.player.pause') : t('stories.player.play')}
          aria-busy={audio.buffering && playing ? true : undefined}
        >
          {audio.buffering && playing ? <span className="spinner story-player-spinner" aria-hidden /> : playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
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
        {seekable && (
          <span className="story-player-line">
            <SeekLine audio={audio} elapsed={onStory ? elapsed : 0} />
            <span className="story-player-clock" aria-hidden dir="ltr">
              {clockText(onStory ? elapsed : 0)} / {clockText(audio.totalMs)}
            </span>
          </span>
        )}
        <button
          type="button"
          className="story-player-rate"
          onClick={() => audio.setSpeed(nextRate(audio.rate))}
          aria-label={t('stories.player.rate', { rate: rateText(audio.rate) })}
        >
          {rateText(audio.rate)}
        </button>
      </div>
      {(partial || audio.failed) && (
        <div className="story-player-notes">
          {partial && <span className="story-player-note">{t('stories.player.recorded', { n: audio.track.length, total: audio.recordable })}</span>}
          {audio.failed && (
            <span className="story-player-note is-error" role="alert">
              {t('stories.player.failed')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
