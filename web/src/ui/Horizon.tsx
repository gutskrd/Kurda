import { useId, useMemo } from 'react';
import { horizonSvg } from '@kurda/shared';

/**
 * The horizon behind somebody who wears no background: their own sky and
 * mountains (shared `art/horizon.ts`), laid across the banner's width and
 * shown through its middle. It is decoration, and is never read out.
 */
export function Horizon({ seed }: { seed: string }): React.JSX.Element {
  const id = `hz${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const art = useMemo(() => ({ __html: horizonSvg({ seed, size: 480, idPrefix: id }) }), [seed, id]);
  return <span className="pc-horizon" aria-hidden="true" dangerouslySetInnerHTML={art} />;
}
