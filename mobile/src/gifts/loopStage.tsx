import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ViewToken, ViewabilityConfigCallbackPairs } from 'react-native';
import { giftLoopStage, type GiftLoopTurn } from '@kurda/shared';

/**
 * Which gift loops on the phone play: only those on screen, as their list reports its rows in view, and of those only
 * the few most in view (shared GIFT_LOOP_LIMIT), so a long chat of opened gifts never moves more than a few at once.
 * A gift outside any list (the unwrap, the picker's confirm, a collection detail) is on screen while it is shown, and
 * comes first.
 */
const stage = giftLoopStage();

/** How a gift outside any list stands against those in one: ahead of a row seen whole. */
const ALONE = 3;

/** The rows of one list in view: those seen at least in part, and those seen whole, newer rows first among equals. */
export class GiftLoopViewport {
  private part = new Map<string, number>();
  private whole = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  /** For the list's `viewabilityConfigCallbackPairs`; made once, as the list requires. */
  readonly pairs: ViewabilityConfigCallbackPairs = [
    { viewabilityConfig: { itemVisiblePercentThreshold: 30 }, onViewableItemsChanged: ({ viewableItems }) => this.seen('part', viewableItems) },
    { viewabilityConfig: { itemVisiblePercentThreshold: 95 }, onViewableItemsChanged: ({ viewableItems }) => this.seen('whole', viewableItems) },
  ];

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A row's standing: 0 off screen, above 1 in part, above 2 whole; nearer the list's start ranks a little higher. */
  scoreOf(key: string): number {
    const index = this.part.get(key);
    if (index === undefined) return 0;
    return (this.whole.has(key) ? 2 : 1) + 1 / (2 + index);
  }

  changes(): number {
    return this.version;
  }

  private seen(kind: 'part' | 'whole', items: ViewToken[]): void {
    const keys = items.filter((t) => t.isViewable && typeof t.key === 'string');
    if (kind === 'part') this.part = new Map(keys.map((t) => [t.key, t.index ?? 0]));
    else this.whole = new Set(keys.map((t) => t.key));
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

const ViewportContext = createContext<GiftLoopViewport | null>(null);
const RowContext = createContext<string | null>(null);

/** A list's viewport, made once for the life of the screen. */
export function useGiftLoopViewport(): GiftLoopViewport {
  return useState(() => new GiftLoopViewport())[0];
}

export function GiftLoopViewportProvider({ viewport, children }: { viewport: GiftLoopViewport; children: ReactNode }): React.JSX.Element {
  return <ViewportContext.Provider value={viewport}>{children}</ViewportContext.Provider>;
}

/** Marks a list row by the key its list gives it, so a gift inside it knows whether the row is in view. */
export function GiftLoopRow({ id, children }: { id: string; children: ReactNode }): React.JSX.Element {
  return <RowContext.Provider value={id}>{children}</RowContext.Provider>;
}

const never = (): (() => void) => () => {};

/** How much this gift is in view: 0 off screen; a gift outside any list is always in view. */
export function useGiftLoopPlace(): number {
  const viewport = useContext(ViewportContext);
  const row = useContext(RowContext);
  useSyncExternalStore(viewport?.subscribe ?? never, () => viewport?.changes() ?? 0);
  return viewport && row !== null ? viewport.scoreOf(row) : ALONE;
}

/** Whether a gift that `wants` to play gets a turn on the stage, standing by `score`. */
export function useGiftLoopTurn(wants: boolean, score: number): boolean {
  const [turn, setTurn] = useState(false);
  const held = useRef<GiftLoopTurn | null>(null);
  const latest = useRef(score);
  latest.current = score;
  useEffect(() => {
    if (!wants) return;
    const t = stage.join(latest.current, setTurn);
    held.current = t;
    return () => {
      t.leave();
      held.current = null;
      setTurn(false);
    };
  }, [wants]);
  useEffect(() => held.current?.update(score), [score]);
  return wants && turn;
}
