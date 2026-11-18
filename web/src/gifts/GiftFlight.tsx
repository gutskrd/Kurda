import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GiftCatalogItem } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { GiftBox, GiftItemArt } from './GiftArt';
import { sendMs } from './motion';

/**
 * The send: a kilim box closes over the chosen item in the middle of the screen, the bow pops, and the present flies
 * into the chat as its bubble lands; under Reduce Motion it fades. A tap ends it early. `target` is the bottom of the
 * thread as measured by the caller; without one it drops straight down.
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

  // From the middle of the viewport to the end of the thread's last line.
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
