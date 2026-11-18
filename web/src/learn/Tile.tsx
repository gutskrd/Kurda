import { forwardRef } from 'react';

/** A tile's state: waiting, picked, just right or wrong, spent (a pair already made), or dimmed after grading. */
export type TileState = 'idle' | 'picked' | 'right' | 'wrong' | 'spent' | 'dim';

/**
 * The lesson's pressable tile (option, card, word): rounded on a darker lip it sinks onto when pressed (learn.css
 * `.tile`). Colour shows its state, and each use also says it in words or marks, never colour alone.
 */
export const Tile = forwardRef<HTMLButtonElement, { state?: TileState; flash?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>(function Tile(
  { state = 'idle', flash = false, className, children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type="button" className={`tile is-${state}${flash ? ' is-flash' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </button>
  );
});
