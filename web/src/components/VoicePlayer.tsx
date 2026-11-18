import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { clockText } from '../lib/clock';
import { onBuffering, onEnded, onError, onPlaying, onTime, play, position, resume, seek, stop } from '../lib/sound';
import { PauseIcon, PlayIcon } from './icons';

/**
 * A voice note's player: play or pause, a seek line and its clock, drawn with the story player's controls. It plays
 * through the app's one player (lib/sound.ts), so it stops any other sound and another sound stops it; pressing play
 * again goes on from where it was. The length is read from the file's header before the first press, and a file that
 * gives none (some recordings) plays without a seek line. `label` names the group for screen readers.
 */
export function VoicePlayer({ src, label }: { src: string; label: string }): React.JSX.Element {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    const quit = [
      onPlaying((now) => setPlaying(now === src)),
      onTime((now, ms) => {
        if (now === src) setElapsed(ms);
      }),
      // Played to its end, it goes back to its start for the next press.
      onEnded((now) => {
        if (now === src) setElapsed(0);
      }),
      onBuffering((now, held) => {
        if (now === src) setWaiting(held);
      }),
      onError((now) => {
        if (now === src) setFailed(true);
      }),
    ];
    return () => {
      quit.forEach((off) => off());
      // A note does not play on once its comment has left the page.
      if (position().src === src) stop();
    };
  }, [src]);

  const toggle = (): void => {
    if (playing) {
      stop();
      return;
    }
    setFailed(false);
    if (!resume(src)) play(src, 1, elapsed);
  };

  const moveTo = (ms: number): void => {
    setElapsed(ms);
    if (position().src === src) seek(ms);
  };

  const length = total !== null && Number.isFinite(total) && total > 0 ? total : null;
  const at = length !== null ? Math.min(elapsed, length) : elapsed;
  return (
    <div className={`voice${playing ? ' is-playing' : ''}`} role="group" aria-label={label}>
      <button
        type="button"
        className="story-player-btn is-main voice-toggle"
        onClick={toggle}
        aria-label={playing ? t('voice.pause') : t('voice.play')}
        aria-busy={waiting && playing ? true : undefined}
      >
        {waiting && playing ? <span className="spinner story-player-spinner" aria-hidden /> : playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>
      {length !== null && (
        <input
          type="range"
          className="story-player-seek"
          min={0}
          max={length}
          step={100}
          value={at}
          aria-label={t('voice.seek')}
          aria-valuetext={t('voice.position', { elapsed: clockText(at), total: clockText(length) })}
          style={{ '--seek': `${(at / length) * 100}%` } as React.CSSProperties}
          onChange={(e) => moveTo(Number(e.target.value))}
        />
      )}
      <span className="story-player-clock" aria-hidden dir="ltr">
        {length !== null ? `${clockText(at)} / ${clockText(length)}` : clockText(at)}
      </span>
      {/* Only the file's header is fetched here, for the length; playing goes through the app's player. */}
      <audio src={src} preload="metadata" hidden onLoadedMetadata={(e) => setTotal(e.currentTarget.duration * 1000)} />
      {failed && (
        <p className="voice-failed" role="alert">
          {t('voice.failed')}
        </p>
      )}
    </div>
  );
}
