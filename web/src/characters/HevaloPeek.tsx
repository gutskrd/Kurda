import { useEffect, useId, useMemo, useState } from 'react';
import { PEEK_PLACE, PEEK_POP, PEEK_VIEW, peekArt } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import './characters.css';

/** The share of the rise at which he is through enough to cheer. */
const GLAD_AT = 0.55;

/**
 * Hevalo's head poking through a torn page (shared `peekArt`), laid as on the phone: what lies behind him, the shadow
 * his head casts, him cut off at the tear's foot, what is on our side of him, then the shade under his chin. He rises
 * through the tear on a spring with his shadows as it appears, cheering as he comes through, or is simply there under
 * Reduce Motion or with `pop` off. Resting, he dozes there: eyes shut, no blinks, glances or cheer. The tear is drawn
 * for light and dark; `flip` mirrors the whole picture. Decorative, since the words beside him say everything.
 */
export function HevaloPeek({
  size,
  reaction = null,
  resting = false,
  flip = false,
  pop = true,
  className,
}: {
  /** The picture's height in pixels; its width follows. */
  size: number;
  reaction?: CharacterReaction | null;
  resting?: boolean;
  flip?: boolean;
  /** He rises through the tear as it appears; false, he is already there. */
  pop?: boolean;
  className?: string;
}): React.JSX.Element {
  const id = `hp${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  // Under Reduce Motion at mount he is simply there; the stylesheet keeps him still if it is turned on later.
  const [still] = useState(prefersReducedMotion);
  const rising = pop && !still;
  const art = useMemo(() => ({ light: peekArt({ idPrefix: `${id}l` }), dark: peekArt({ dark: true, idPrefix: `${id}d` }) }), [id]);
  // Through the page, he cheers as the spring settles, unless the page has a reaction of its own for him.
  const [glad, setGlad] = useState<CharacterReaction | null>(null);
  useEffect(() => {
    if (!rising || resting) return;
    const wait = window.setTimeout(() => setGlad('cheer'), PEEK_POP.delayMs + PEEK_POP.ms * GLAD_AT);
    return () => window.clearTimeout(wait);
  }, [rising, resting]);

  const { figure, cut, drop } = PEEK_PLACE;
  const style = {
    width: (size * PEEK_VIEW.w) / PEEK_VIEW.h,
    height: size,
    '--peek-cut': `${cut * 100}%`,
    '--peek-drop': `${drop * size}px`,
    '--peek-pop-ms': `${PEEK_POP.ms}ms`,
    '--peek-pop-delay': `${PEEK_POP.delayMs}ms`,
  } as React.CSSProperties;
  const layer = (part: 'back' | 'cast' | 'front' | 'shadow') => (
    <>
      <span className={`hevalo-peek-art is-light is-${part}`} dangerouslySetInnerHTML={{ __html: art.light[part] }} />
      <span className={`hevalo-peek-art is-dark is-${part}`} dangerouslySetInnerHTML={{ __html: art.dark[part] }} />
    </>
  );
  return (
    <span
      className={`hevalo-peek${rising ? ' is-popping' : ''}${flip ? ' is-mirrored' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
      data-testid="hevalo-peek"
    >
      {layer('back')}
      {layer('cast')}
      {/* Cut off at the tear's foot only; an ear or antler may reach past the picture's top and sides. */}
      <span className="hevalo-peek-cut">
        <span
          className="hevalo-peek-place"
          style={{ left: `${figure.left * 100}%`, top: `${figure.top * 100}%`, width: `${figure.width * 100}%`, height: `${figure.height * 100}%` }}
        >
          <SpeakingCharacter
            speaker="hevalo"
            audio={null}
            crop="head"
            size={figure.height * size}
            decorative
            mirrored={flip}
            reaction={reaction ?? (resting ? null : glad)}
            resting={resting}
          />
        </span>
      </span>
      {layer('front')}
      {layer('shadow')}
    </span>
  );
}
