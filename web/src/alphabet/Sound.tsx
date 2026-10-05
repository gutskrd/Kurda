import { useEffect, useState } from 'react';
import { SpeakerIcon } from '../components/icons';
import { onPlaying, play } from './audio';

/**
 * A play button for one sound. Renders nothing when there is no clip, so a
 * sound that was not made never shows a button that does nothing.
 */
export function Sound({ src, label, size = 'md' }: { src: string | null; label: string; size?: 'sm' | 'md' | 'lg' }): React.JSX.Element | null {
  const [on, setOn] = useState(false);
  useEffect(() => onPlaying((now) => setOn(now === src)), [src]);
  if (!src) return null;
  return (
    <button
      type="button"
      className={`ab-sound ab-sound--${size}${on ? ' is-on' : ''}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        play(src);
      }}
    >
      <SpeakerIcon size={size === 'lg' ? 22 : size === 'sm' ? 15 : 18} />
    </button>
  );
}
