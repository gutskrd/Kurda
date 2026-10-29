import { useId, useMemo, useState } from 'react';
import { WINDOW_PLACE, WINDOW_POP, WINDOW_VIEW, windowArt } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import './characters.css';

/**
 * Hevalo leaning out of his window, as on the phone (shared `windowArt`):
 * his head and neck out of a round-arched window in a clay wall, his neck
 * going down behind the sill. As the window appears his head pops up from
 * under the sill on a spring and settles (a stylesheet animation); for a
 * reader who asked for less motion he is simply there. Alive as ever: he
 * blinks, glances about, follows the pointer, and cheers or tilts his head at
 * a `reaction`.
 *
 * The window is drawn once for a light page and once for a dark one, and
 * mirrored on a page read from the right, its curtain and flowers changing
 * sides. Decorative: the words beside him say whatever he does.
 */
export function HevaloWindow({
  size,
  reaction = null,
  pop = true,
  className,
}: {
  /** how tall the window is drawn, in pixels; its width follows */
  size: number;
  reaction?: CharacterReaction | null;
  /** his head rises into the window as it appears; false, he is there already */
  pop?: boolean;
  className?: string;
}): React.JSX.Element {
  const id = `hw${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  // asked for less motion as he appears, he is simply there (and the stylesheet keeps him still for one who asks later)
  const [still] = useState(prefersReducedMotion);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const art = useMemo(
    () => ({ light: windowArt({ idPrefix: `${id}l` }), dark: windowArt({ dark: true, idPrefix: `${id}d` }) }),
    [id],
  );
  const { figure, sill, drop } = WINDOW_PLACE;
  const style = {
    width: (size * WINDOW_VIEW.w) / WINDOW_VIEW.h,
    height: size,
    '--window-sill': `${sill * 100}%`,
    '--window-drop': `${drop * size}px`,
    '--window-pop-ms': `${WINDOW_POP.ms}ms`,
    '--window-pop-delay': `${WINDOW_POP.delayMs}ms`,
  } as React.CSSProperties;
  const layer = (part: 'back' | 'front') => (
    <>
      <span className="hevalo-window-art is-light" dangerouslySetInnerHTML={{ __html: art.light[part] }} />
      <span className="hevalo-window-art is-dark" dangerouslySetInnerHTML={{ __html: art.dark[part] }} />
    </>
  );
  return (
    <span
      className={`hevalo-window${pop && !still ? ' is-popping' : ''}${rtl ? ' is-mirrored' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    >
      {layer('back')}
      {/* cut off at the sill and nowhere else: an ear or an antler may reach past the window's top and sides */}
      <span className="hevalo-window-cut">
        <span
          className="hevalo-window-place"
          style={{ left: `${figure.left * 100}%`, top: `${figure.top * 100}%`, width: `${figure.width * 100}%`, height: `${figure.height * 100}%` }}
        >
          <SpeakingCharacter speaker="hevalo" audio={null} crop="head" size={figure.height * size} decorative reaction={reaction} />
        </span>
      </span>
      {layer('front')}
    </span>
  );
}
