import { forwardRef } from 'react';

/**
 * How a tile stands: waiting, picked, just found right or wrong, spent (a
 * pair already made: flat, quiet, no longer pressed), or dimmed once an
 * answer is graded and it was not part of it.
 */
export type TileState = 'idle' | 'picked' | 'right' | 'wrong' | 'spent' | 'dim';

/**
 * The lesson's one pressable tile — an option, a card to pair, a word to lay
 * on the line: rounded, edged, standing on a darker lip that it sinks onto
 * under the finger (learn.css `.tile`). Its colour says its state, and the
 * place it is used in says it in words too (a mark, a number, a label), so
 * colour is never the only sign.
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
