import type { FireLevel } from '@kurda/shared';

/**
 * Renders the fire's props instead of drawing it, for tests that check its size and source:
 * `vi.mock('../components/Fire', () => import('../test/fireProbe'))`.
 */
export function Fire({
  level,
  from,
  still,
  framed,
  size,
  className,
}: {
  size: number;
  level?: FireLevel;
  from?: FireLevel | null;
  still?: boolean;
  framed?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      className={className}
      data-testid="fire"
      data-stage={level?.stage ?? 'none'}
      data-growth={level ? String(level.growth) : undefined}
      data-from={from?.stage}
      data-still={still ? 'true' : undefined}
      data-framed={framed ? 'true' : undefined}
      data-size={String(size)}
      aria-hidden="true"
    />
  );
}
