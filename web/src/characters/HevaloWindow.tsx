import { useId, useMemo, useState } from 'react';
import { WINDOW_PLACE, WINDOW_POP, WINDOW_VIEW, windowArt } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import './characters.css';

/**
 * Hevalo putting his head and neck in over a window sill, as on the phone (shared `windowArt`). As the window appears
 * he rises over the sill on a spring with his shadow (stylesheet animations), or is simply there under Reduce Motion.
 * He blinks, glances, follows the pointer and reacts to `reaction`. The window is drawn for light and dark and
 * mirrored on a right-to-left page. Decorative, since the words beside him say everything.
 */
export function HevaloWindow({
  size,
  reaction = null,
  pop = true,
  className,
}: {
  /** The window's height in pixels; its width follows. */
  size: number;
  reaction?: CharacterReaction | null;
  /** He comes in as the window appears; false means he is already there. */
  pop?: boolean;
  className?: string;
}): React.JSX.Element {
  const id = `hw${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  // Under Reduce Motion at mount he is simply there; the stylesheet keeps him still if it is turned on later.
  const [still] = useState(prefersReducedMotion);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const art = useMemo(
    () => ({ light: windowArt({ idPrefix: `${id}l` }), dark: windowArt({ dark: true, idPrefix: `${id}d` }) }),
    [id],
  );
  const { figure, sill, drop, far, through } = WINDOW_PLACE;
  const style = {
    width: (size * WINDOW_VIEW.w) / WINDOW_VIEW.h,
    height: size,
    '--window-sill': `${sill * 100}%`,
    '--window-drop': `${drop * size}px`,
    '--window-far': far,
    '--window-pop-ms': `${WINDOW_POP.ms}ms`,
    '--window-pop-delay': `${WINDOW_POP.delayMs}ms`,
  } as React.CSSProperties;
  const layer = (part: 'back' | 'front' | 'shadow') => (
    <>
      <span className={`hevalo-window-art is-light is-${part}`} dangerouslySetInnerHTML={{ __html: art.light[part] }} />
      <span className={`hevalo-window-art is-dark is-${part}`} dangerouslySetInnerHTML={{ __html: art.dark[part] }} />
    </>
  );
  return (
    <span
      className={`hevalo-window${pop && !still ? ' is-popping' : ''}${rtl ? ' is-mirrored' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    >
      {layer('back')}
      {/* Cut off at the sill only; an ear or antler may reach past the window's top and sides. */}
      <span className="hevalo-window-cut">
        <span
          className="hevalo-window-place"
          style={{
            left: `${figure.left * 100}%`,
            top: `${figure.top * 100}%`,
            width: `${figure.width * 100}%`,
            height: `${figure.height * 100}%`,
            transformOrigin: `${through.x * 100}% ${through.y * 100}%`,
          }}
        >
          <SpeakingCharacter speaker="hevalo" audio={null} crop="head" size={figure.height * size} decorative reaction={reaction} />
        </span>
      </span>
      {layer('front')}
      {layer('shadow')}
    </span>
  );
}
