import type { Ref } from 'react';

/**
 * The lens a switch's chosen ground lifts into as it moves (lib/motion.ts useSlidingCapsule), over the options. It is
 * filled with a copy of the options when a move starts and emptied when it ends, on the switch's own ground with the
 * chosen ground's tint (lib/selectorLens.ts `LensInside`). It is only drawn: hidden from screen readers and out of
 * reach.
 */
export function SwitchLens({ ref }: { ref: Ref<HTMLSpanElement> }): React.JSX.Element {
  return (
    <span ref={ref} className="seg-lens" aria-hidden="true" inert>
      <span className="seg-lens-glass" data-lens-glass="">
        <span className="seg-lens-unspread" data-lens-unspread="">
          <span className="seg-lens-tint" data-lens-tint="" />
          <span className="seg-lens-copy" data-lens-copy="" />
        </span>
      </span>
      <span className="seg-lens-rim" data-lens-rim="" />
    </span>
  );
}
