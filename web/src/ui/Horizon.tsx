import { useId, useMemo } from 'react';
import { horizonSvg } from '@kurda/shared';

/** The decorative sky and mountains seeded per person (shared `art/horizon.ts`) behind a profile with no background. */
export function Horizon({ seed }: { seed: string }): React.JSX.Element {
  const id = `hz${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const art = useMemo(() => ({ __html: horizonSvg({ seed, size: 480, idPrefix: id }) }), [seed, id]);
  return <span className="pc-horizon" aria-hidden="true" dangerouslySetInnerHTML={art} />;
}
