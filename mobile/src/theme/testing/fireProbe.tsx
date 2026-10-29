import type { FireLevel } from '@kurda/shared';

/**
 * The fire as the props it was given, for a test that asks how big it burns
 * and what it grows from rather than how it is drawn:
 * `vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'))`.
 * Tests render through react-native-web, so this is a plain element.
 */
export function Fire({
  level,
  from,
  still,
  framed,
  size,
}: {
  size: number;
  level?: FireLevel;
  from?: FireLevel | null;
  still?: boolean;
  framed?: boolean;
  accent?: string | null;
}): React.JSX.Element {
  return (
    <span
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
