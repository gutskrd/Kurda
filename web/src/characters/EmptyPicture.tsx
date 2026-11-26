import { HevaloPeek } from './HevaloPeek';

/** How tall Hevalo is drawn over an empty or failed page, as on the phone (mobile/src/theme/EmptyState.tsx). */
export const EMPTY_ART_HEIGHT = 132;

/**
 * Hevalo peeking through the page over a state with nothing to show (components/states.tsx): still, since he only
 * decorates. Where the page could not load he tilts his head once, thinking, which reads as puzzled only in motion, so
 * he is not held still there. Its own module, so the drawing loads only where one is shown.
 */
export default function EmptyPicture({ puzzled = false }: { puzzled?: boolean }): React.JSX.Element {
  return <HevaloPeek size={EMPTY_ART_HEIGHT} pop={false} still={!puzzled} reaction={puzzled ? 'hmm' : null} className="state-art" />;
}
