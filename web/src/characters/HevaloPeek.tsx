import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PEEK_PLACE, PEEK_POP, PEEK_VIEW, peekArt } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import { usePeekMotion } from './usePeekMotion';
import './characters.css';

/** The share of his coming through at which he is through enough to cheer. */
const GLAD_AT = 0.55;

/**
 * Hevalo's head poking through a torn page (shared `peekArt`), laid as on the phone: his shadows on the page, what
 * lies behind him, him cut off at the tear's foot, what is on our side of him, then the shade under his chin. As it
 * appears the tear bursts open and he comes out of the dark toward us on a spring, his shadow sliding down the page,
 * cheering as he comes through; under Reduce Motion or with `pop` off he is simply there. On a phone he leans with its
 * tilt and turns his head as it swings round (usePeekMotion). Resting, he dozes there: eyes shut, no blinks, glances or cheer. The tear is drawn for light and
 * dark; `flip` mirrors the whole picture. Decorative, since the words beside him say everything.
 */
export function HevaloPeek({
  size,
  reaction = null,
  resting = false,
  flip = false,
  pop = true,
  still = false,
  className,
}: {
  /** The picture's height in pixels; its width follows. */
  size: number;
  reaction?: CharacterReaction | null;
  resting?: boolean;
  flip?: boolean;
  /** He rises through the tear as it appears; false, he is already there. */
  pop?: boolean;
  /** Drawn without blinks, glances or breath, for a picture that only decorates (an empty page), as on the phone. */
  still?: boolean;
  className?: string;
}): React.JSX.Element {
  const id = `hp${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  // Under Reduce Motion at mount he is simply there; the stylesheet keeps him still if it is turned on later.
  const [calm] = useState(prefersReducedMotion);
  const rising = pop && !calm && !still;
  const root = useRef<HTMLSpanElement>(null);
  usePeekMotion(root, true, flip);
  const art = useMemo(() => ({ light: peekArt({ idPrefix: `${id}l` }), dark: peekArt({ dark: true, idPrefix: `${id}d` }) }), [id]);
  // Through the page, he cheers as the spring settles, unless the page has a reaction of its own for him.
  const [glad, setGlad] = useState<CharacterReaction | null>(null);
  useEffect(() => {
    if (!rising || resting) return;
    const wait = window.setTimeout(() => setGlad('cheer'), PEEK_POP.delayMs + PEEK_POP.ms * GLAD_AT);
    return () => window.clearTimeout(wait);
  }, [rising, resting]);

  const { figure, cut, fall } = PEEK_PLACE;
  const at = ({ x, y }: { x: number; y: number }): string => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
  const style = {
    width: (size * PEEK_VIEW.w) / PEEK_VIEW.h,
    height: size,
    '--peek-cut': `${cut * 100}%`,
    '--peek-fall': `${(fall * size * 0.85).toFixed(1)}px`,
    '--peek-tear-at': at(PEEK_PLACE.tear),
    '--peek-cast-at': at(PEEK_PLACE.castPivot),
    '--peek-ears-at': at(PEEK_PLACE.earsPivot),
    '--peek-tear-from': PEEK_POP.tearFrom,
    '--peek-from': PEEK_POP.from,
    '--peek-tear-ms': `${PEEK_POP.tearMs}ms`,
    '--peek-pop-ms': `${PEEK_POP.ms}ms`,
    '--peek-pop-delay': `${PEEK_POP.delayMs}ms`,
  } as React.CSSProperties;
  const layer = (part: 'cast' | 'castEars' | 'back' | 'front' | 'shadow') => (
    <>
      <span className={`hevalo-peek-art is-light is-${kebab(part)}`} dangerouslySetInnerHTML={{ __html: art.light[part] }} />
      <span className={`hevalo-peek-art is-dark is-${kebab(part)}`} dangerouslySetInnerHTML={{ __html: art.dark[part] }} />
    </>
  );
  return (
    <span
      className={`hevalo-peek${rising ? ' is-popping' : ''}${flip ? ' is-mirrored' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      ref={root}
      aria-hidden="true"
      data-testid="hevalo-peek"
    >
      {layer('cast')}
      {layer('castEars')}
      {layer('back')}
      {/* Cut off at the tear's foot only; an ear or antler may reach past the picture's top and sides. */}
      <span className="hevalo-peek-cut">
        <span
          className="hevalo-peek-place"
          style={{
            left: `${figure.left * 100}%`,
            top: `${figure.top * 100}%`,
            width: `${figure.width * 100}%`,
            height: `${figure.height * 100}%`,
            transformOrigin: at(PEEK_PLACE.pivot),
          }}
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
            still={still}
            turnable
          />
        </span>
      </span>
      {layer('front')}
      {layer('shadow')}
    </span>
  );
}

/** A layer's name as its class: `castEars` is `cast-ears`. */
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
