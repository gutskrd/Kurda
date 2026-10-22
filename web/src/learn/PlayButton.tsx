import { useEffect, useState } from 'react';
import { SpeakerIcon } from '../components/icons';
import { onPlaying, play } from '../lib/sound';

/**
 * A labelled button that plays one recording — "Play", "0.75×", "Hear it" —
 * through the app's one player, so a second tap restarts rather than doubles
 * the voice. The button that started the sound is lit while it plays (the
 * normal and the slow button play the same file, so the speed tells them
 * apart); a second tap starts it again rather than stopping it, so it is a
 * plain button, not a toggle.
 *
 * `round` shows the speaker alone in a round button, the label its name and
 * its tooltip: for a recording whose button needs no words beside the one
 * who says it.
 */
export function PlayButton({
  src,
  label,
  rate = 1,
  primary = false,
  disabled = false,
  round = false,
}: {
  src: string;
  label: string;
  rate?: number;
  primary?: boolean;
  disabled?: boolean;
  round?: boolean;
}): React.JSX.Element {
  const [sounding, setSounding] = useState(false);
  useEffect(() => onPlaying((now, speed) => setSounding(now === src && speed === rate)), [src, rate]);
  if (round)
    return (
      <button
        type="button"
        className={`lesson-play lesson-play-round${sounding ? ' is-on' : ''}`}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => play(src, rate)}
      >
        <SpeakerIcon size={22} />
      </button>
    );
  return (
    <button
      type="button"
      className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'} lesson-play${sounding ? ' is-on' : ''}`}
      disabled={disabled}
      onClick={() => play(src, rate)}
    >
      <SpeakerIcon size={17} />
      {label}
    </button>
  );
}
