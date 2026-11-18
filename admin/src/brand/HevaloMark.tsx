import { useEffect, useRef } from 'react';
import { followPointer } from './eyes';

const SOURCES = [96, 192, 288].map((size) => `/brand/hevalo-${size}.webp ${size}w`).join(', ');

/**
 * Hevalo's icon with eyes that follow the pointer (eyes.ts): the picture has no pupils, so they are drawn over it.
 * `size` is its width in pixels. Hidden from assistive technology, as the name beside it says it.
 */
export function HevaloMark({ size, className }: { size: number; className?: string }): React.JSX.Element {
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  useEffect(() => (left.current && right.current ? followPointer(left.current, right.current) : undefined), []);
  return (
    <span className={className ? `hevalo-mark ${className}` : 'hevalo-mark'} style={{ width: size, height: size }} aria-hidden="true">
      <img src="/brand/hevalo-192.webp" srcSet={SOURCES} sizes={`${size}px`} width={size} height={size} alt="" draggable={false} decoding="async" />
      <span className="hevalo-eye is-left">
        <span ref={left} className="hevalo-pupil" />
      </span>
      <span className="hevalo-eye is-right">
        <span ref={right} className="hevalo-pupil" />
      </span>
    </span>
  );
}
