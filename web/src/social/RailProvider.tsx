import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSocialRail, type Arrival, type SocialRailData } from './useSocialRail';

interface RailContext {
  data: SocialRailData;
  loading: boolean;
  arrivals: Arrival[];
  dismiss: (key: string) => void;
  refresh: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** wide screens only: the rail is a strip of icons rather than a full column */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** everything waiting: invites, requests, unread notifications and groups */
  total: number;
}

/**
 * Outside a provider the rail simply is not there.
 *
 * The top nav is shared with signed-out pages, so its toggle asks for this on
 * every render; a frozen empty value lets it render nothing without every
 * caller having to null-check, and being a module constant means it does not
 * churn identity and re-render the nav on each pass.
 */
const ABSENT: RailContext = {
  data: {
    friends: [],
    requests: [],
    challenges: [],
    groups: [],
    notifications: [],
    unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
  },
  loading: false,
  arrivals: [],
  dismiss: () => undefined,
  refresh: () => undefined,
  open: false,
  setOpen: () => undefined,
  collapsed: false,
  setCollapsed: () => undefined,
  total: 0,
};

const COLLAPSED_KEY = 'mykurda_rail_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const Ctx = createContext<RailContext | null>(null);

/** Whether a provider is above us — the toggle renders nothing when it isn't. */
export function useRailPresent(): boolean {
  return useContext(Ctx) !== null;
}

export function useRail(): RailContext {
  return useContext(Ctx) ?? ABSENT;
}

/**
 * Holds the rail's data and its open state.
 *
 * The toggle lives in the top nav and the panel lives after the page, so they
 * cannot share state by nesting — and polling in both would mean two requests
 * and two answers that could disagree.
 */
export function RailProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { data, loading, arrivals, dismiss, refresh } = useSocialRail();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // whether you want the column or the strip is a per-browser preference, and
  // having to re-collapse it on every page load would be worse than not having
  // the choice at all
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // a browser with site data blocked still gets a working rail
    }
  }, [collapsed]);

  // Escape closes it, the way every drawer should
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const total =
    data.unread.challenges + data.unread.requests + data.unread.notifications + data.unread.groups;

  const value = useMemo(
    () => ({ data, loading, arrivals, dismiss, refresh, open, setOpen, collapsed, setCollapsed, total }),
    [data, loading, arrivals, dismiss, refresh, open, collapsed, total],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
