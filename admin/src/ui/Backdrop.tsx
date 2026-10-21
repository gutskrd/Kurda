import { useEffect, useRef } from 'react';
import { useMediaQuery } from './hooks';

/** The rain on the flag behind every page, a loop a few seconds long. */
export const BACKDROP = {
  webm: '/backdrop/rain.webm',
  mp4: '/backdrop/rain.mp4',
  poster: '/backdrop/rain.jpg',
} as const;

/** Whether the browser was asked to spare data (Save-Data, "Lite mode"). */
function savingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * The moving picture behind the admin: fixed, covering the window, under the
 * scrim in styles.css so it never sits straight behind text. Silent, never
 * focusable, hidden from screen readers.
 *
 * It stays the still frame (the CSS background of `.backdrop`) for a reader
 * who asked for less motion or a browser saving data; the video is only the
 * motion on top of it, so a browser that will not play it loses nothing else.
 */
export function Backdrop(): React.JSX.Element {
  const still = useMediaQuery('(prefers-reduced-motion: reduce)', false) || savingData();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // React sets `muted` as a property only, and a phone allows autoplay on
    // the attribute: set both, then ask to play (refused quietly; the still
    // frame shows instead)
    v.muted = true;
    v.setAttribute('muted', '');
    v.play()?.catch(() => undefined);
  }, [still]);

  return (
    <div className="backdrop" aria-hidden="true">
      {still ? null : (
        <video
          ref={video}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={BACKDROP.poster}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
        >
          <source src={BACKDROP.webm} type="video/webm" />
          <source src={BACKDROP.mp4} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
