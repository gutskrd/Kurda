import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { DEFAULT_ITEM_FILTER, isFiltered, itemFilterParams, readItemFilter, type ItemFilter } from '@kurda/shared';

/** What the Shop shows: the shared filter, and the Shop's own two narrowings. */
export interface ShopView extends ItemFilter {
  /** only what my balance reaches — each item against its own currency */
  afford: boolean;
  /** only what costs nothing */
  free: boolean;
}

export const DEFAULT_SHOP_VIEW: ShopView = { ...DEFAULT_ITEM_FILTER, afford: false, free: false };

/** A view read back from the address bar (`?kind=&q=&sort=&afford=1&free=1`); anything unknown stays at its default. */
export function readShopView(params: URLSearchParams): ShopView {
  return {
    ...readItemFilter((key) => params.get(key)),
    afford: params.get('afford') === '1',
    free: params.get('free') === '1',
  };
}

/** A view as the address bar keeps it: only what differs from the default, so a plain Shop has a plain address. */
export function shopViewSearch(view: ShopView): string {
  // the shared helper leaves out what is at its default, so every entry has a value
  const params = new URLSearchParams(Object.entries(itemFilterParams(view)) as Array<[string, string]>);
  if (view.afford) params.set('afford', '1');
  if (view.free) params.set('free', '1');
  return params.toString();
}

/** Whether anything at all is narrowed, so the page knows to offer "Clear filters". */
export const shopViewFiltered = (view: ShopView): boolean => isFiltered(view) || view.afford || view.free;

const canonical = (search: string): string => new URLSearchParams(search).toString();

/**
 * The Shop's view, kept in the address bar — so a narrowed Shop survives a
 * reload, can be linked to, and Back and Forward step through what was chosen.
 *
 * The page reads its own state, not the address: the router moves to a new
 * address inside a transition, and a search box bound to the address would
 * lose letters typed while one was still landing. So the state changes at
 * once and the address follows — pushed for a choice (a tab, an order, a
 * toggle), replaced while typing, so that Back does not spell the word out
 * backwards. An address this page did not write (Back, Forward, a link) is
 * read back into the state.
 */
export function useShopView(): [ShopView, (next: ShopView, how?: { replace?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [view, setView] = useState<ShopView>(() => readShopView(params));
  /** the address last seen, so arriving at it twice is not news */
  const seen = useRef(canonical(location.search));
  /** addresses written here that the router has not landed on yet, oldest first */
  const pending = useRef<string[]>([]);

  useEffect(() => {
    const now = canonical(location.search);
    if (now === seen.current) return;
    seen.current = now;
    const mine = pending.current.indexOf(now);
    if (mine >= 0) {
      // one of ours: it and anything older have landed (or been overtaken)
      pending.current.splice(0, mine + 1);
      return;
    }
    // somebody else's — Back, Forward, a link — so the page follows the address
    pending.current = [];
    setView(readShopView(new URLSearchParams(location.search)));
  }, [location.search]);

  const update = useCallback(
    (next: ShopView, how: { replace?: boolean } = {}) => {
      setView(next);
      const search = shopViewSearch(next);
      const latest = pending.current[pending.current.length - 1] ?? seen.current;
      if (search === latest) return;
      pending.current.push(search);
      setParams(new URLSearchParams(search), { replace: how.replace ?? false });
    },
    [setParams],
  );

  return [view, update];
}
