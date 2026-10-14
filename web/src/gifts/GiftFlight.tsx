import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GiftCatalogItem } from '@kurda/shared';
import { GiftBox, GiftItemArt } from './GiftArt';
import { prefersReducedMotion, sendMs } from './motion';

/**
 * The send: the item you chose sits in the middle of the screen, a kilim box
 * closes over it, the lid drops, the bow pops — and the present flies down
 * into the chat, where the bubble lands as it arrives. With reduced
 * motion it fades in and out. A tap ends it early; it never blocks the page
 * for longer than it plays.
 *
 * `target` is where it flies to: the bottom of the thread, measured by the
 * caller. Without one it drops straight down.
 */
export function GiftFlight({
  item,
  target,
  onDone,
}: {
  item: GiftCatalogItem;
  target: DOMRect | null;
  onDone: () => void;
}): React.JSX.Element {
  const done = useRef(onDone);
  done.current = onDone;
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), sendMs(reduced));
    return () => window.clearTimeout(timer);
  }, [reduced]);

  // from the middle of the viewport to the end of the thread's last line
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const toX = target ? target.left + target.width * 0.72 - vw / 2 : 0;
  const toY = target ? target.bottom - 56 - vh / 2 : vh * 0.35;
  const style = { '--fly-x': `${Math.round(toX)}px`, '--fly-y': `${Math.round(toY)}px` } as CSSProperties;

  return createPortal(
    <div className={`gift-flight${reduced ? ' is-reduced' : ''}`} style={style} onClick={() => done.current()} aria-hidden="true">
      <div className="gift-flight-item">
        <span className="gift-flight-art">
          <GiftItemArt assetUrl={item.assetUrl} category={item.category} size={104} />
        </span>
        <GiftBox tier={item.tier} size={128} className="gift-flight-box" />
      </div>
    </div>,
    document.body,
  );
}
