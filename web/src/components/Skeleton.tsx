/**
 * Placeholder boxes for loading screens. Screen skeletons (`skeletons.tsx`) use the real components' class names with
 * these boxes inside, so their geometry comes from the same stylesheet and cannot drift. Every box is `aria-hidden`;
 * the region around them announces loading once.
 */

interface BoxProps {
  /** Any CSS width; a percentage keeps a line in proportion as the column changes. */
  w?: string | number;
  /** An explicit height, for things that have one: a picture, a button, a tile. */
  h?: string | number;
  /** A circle for avatars; `size` sets both axes. */
  size?: number;
  circle?: boolean;
  radius?: string | number;
  /** One line of text: inside the real element, it is exactly that element's line height. */
  line?: boolean;
  /** A picture's place: fills the real element it is put in (a banner, a tile), whose own rules give the size. */
  fill?: boolean;
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
  fill,
  radius,
  className = '',
  style,
}: BoxProps): React.JSX.Element {
  const classes = ['skeleton'];
  if (circle) classes.push('skeleton-circle');
  if (line) classes.push('skeleton-line');
  if (fill) classes.push('skeleton-fill');
  if (className) classes.push(className);
  return (
    <span
      aria-hidden="true"
      className={classes.join(' ')}
      style={{
        width: len(size ?? w),
        // A line takes its height from the stylesheet.
        height: size !== undefined ? len(size) : line ? undefined : len(h),
        borderRadius: circle ? '50%' : len(radius),
        ...style,
      }}
    />
  );
}

/**
 * A button's place, as a pill at that button size's height (`.skeleton-btn`, ui.css). Without `w` it takes the width its
 * container's rules give it, as a full-width button does.
 */
export function SkeletonButton({ w, size = 'md', className = '' }: { w?: number | string; size?: 'sm' | 'md' | 'lg'; className?: string }): React.JSX.Element {
  const sized = size === 'md' ? 'skeleton-btn' : `skeleton-btn skeleton-btn-${size}`;
  return <Skeleton w={w} className={className ? `${sized} ${className}` : sized} />;
}

/** A paragraph's lines at its own line height, the last one short so it reads as prose rather than a table. */
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
 * Makes a group of boxes one loading state: `role="status"` with the label and `aria-busy`. It appears a moment late
 * (`.skeleton-region`, ui.css), as the spinner does, so fast answers never flash grey; its space is held from the start.
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
    <div className={className ? `skeleton-region ${className}` : 'skeleton-region'} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
