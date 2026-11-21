import { useId, useMemo } from 'react';
import { CHASE, CHASE_APPLE, CHASE_VIEW, chaseApple, chaseFrame, chaseGround, chaseWing } from '@kurda/shared';

/**
 * Hevalo galloping after a winged apple (shared chase.ts), for a page that is on its way. One drawing, built once: the
 * stride's drawings, each shown in turn by the stylesheet, and the apple, which bobs, drifts and beats its wings there
 * too, so nothing is redrawn while it runs. Under Reduce Motion he stands mid-stride with the apple still. Decorative:
 * the words beside it say what is loading.
 */
export function ChaseLoader(): React.JSX.Element {
  const own = `chase${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const markup = useMemo(() => {
    const frames = Array.from(
      { length: CHASE.frames },
      (_, i) => `<g class="chase-frame" style="animation-delay:${((-i * CHASE.strideMs) / CHASE.frames).toFixed(1)}ms">${chaseFrame(i, `${own}-`)}</g>`,
    ).join('');
    const wing = (side: 'near' | 'far'): string => {
      const root = side === 'near' ? CHASE_APPLE.nearWing : CHASE_APPLE.farWing;
      return `<g class="chase-wing is-${side}" style="transform-origin:${root.x}px ${root.y}px">${chaseWing(side)}</g>`;
    };
    return {
      __html:
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CHASE_VIEW.x} ${CHASE_VIEW.y} ${CHASE_VIEW.w} ${CHASE_VIEW.h}" aria-hidden="true" focusable="false">` +
        chaseGround('currentColor') +
        `<g class="chase-stride">${frames}</g>` +
        `<g class="chase-drift"><g class="chase-apple">${wing('far')}${chaseApple(`${own}-`)}${wing('near')}</g></g>` +
        '</svg>',
    };
  }, [own]);
  return <div className="chase" dangerouslySetInnerHTML={markup} />;
}
