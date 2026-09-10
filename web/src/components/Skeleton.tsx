/**
 * The shape of what is coming, while it is coming.
 *
 * A spinner says "something is happening". A skeleton says "*this* is
 * happening, and it will be here" — which is only true if the skeleton is the
 * same shape as the thing. A placeholder that guesses wrong is worse than a
 * spinner: the reader settles on a layout, then everything moves.
 *
 * So the screen skeletons in `skeletons.tsx` are built out of the real
 * components' own class names, with these boxes standing in for the words and
 * the pictures. The geometry then comes from the same stylesheet the real
 * screen uses, and cannot drift from it: change `.fcard-head`'s padding and
 * both move together.
 *
 * Everything here is `aria-hidden` and announced once by the region around it,
 * because a screen reader should hear "loading", not eleven empty boxes.
 */

interface BoxProps {
  /** any CSS width — a percentage keeps a line honest as the column changes */
  w?: string | number;
  /** an explicit height, for things that have one: a picture, a button, a tile */
  h?: string | number;
  /** a circle, for avatars: `size` sets both axes */
  size?: number;
  circle?: boolean;
  radius?: string | number;
  /**
   * Stand in for one line of text rather than a fixed box.
   *
   * Put inside the real element — `.fcard-name`, `.rank-score`, a `<p>` — and
   * the row comes out exactly as tall as it will be once the words arrive,
   * because the height is one line box of that element's own line-height. This
   * is the difference between a skeleton that holds the layout still and one
   * that guesses at it.
   */
  line?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const len = (v: string | number | undefined): string | undefined =>
  typeof v === 'number' ? `${v}px` : v;

/** One placeholder block. */
export function Skeleton({
  w,
  h,
  size,
  circle,
  line,
  radius,
  className = '',
  style,
}: BoxProps): React.JSX.Element {
  const classes = ['skeleton'];
  if (circle) classes.push('skeleton-circle');
  if (line) classes.push('skeleton-line');
  if (className) classes.push(className);
  return (
    <span
      aria-hidden="true"
      className={classes.join(' ')}
      style={{
        width: len(size ?? w),
        // a line takes its height from the stylesheet; anything else says so
        height: size !== undefined ? len(size) : line ? undefined : len(h),
        borderRadius: circle ? '50%' : len(radius),
        ...style,
      }}
    />
  );
}

/**
 * A paragraph's worth of lines, at the paragraph's own line height.
 *
 * The last line is short, because the last line of a paragraph almost always
 * is. Rows of identical full-width bars read as a table, not as prose.
 */
export function SkeletonText({
  lines = 3,
  lastWidth = '62%',
}: {
  lines?: number;
  lastWidth?: string;
}): React.JSX.Element {
  return (
    <span className="skeleton-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} line w={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </span>
  );
}

/**
 * The wrapper that makes a group of boxes one loading state.
 *
 * `role="status"` with the label is what a screen reader gets; `aria-busy`
 * is what tells assistive tech the region is not finished. The boxes inside
 * are all `aria-hidden`, so this is the only thing announced.
 */
export function SkeletonRegion({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
