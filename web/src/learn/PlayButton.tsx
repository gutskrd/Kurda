import { useEffect, useState } from 'react';
import { SpeakerIcon } from '../components/icons';
import { onPlaying, play } from '../lib/sound';

/**
 * A labelled button ("Play", "0.75×", "Hear it") that plays one recording through the app's one player. The button that
 * started it is lit while it plays; a second tap restarts it, so it is a button, not a toggle. `round` shows the speaker
 * alone in a round button, its label as name and tooltip.
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
