import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSocialRail, type Arrival, type SocialRailData } from './useSocialRail';
import { readRenamed } from '../lib/renamedKey';

interface RailContext {
  data: SocialRailData;
  loading: boolean;
  /** The first answer never came, so the bell offers a retry. */
  failed: boolean;
  arrivals: Arrival[];
  dismiss: (key: string) => void;
  refresh: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Wide screens only: the rail is a strip of icons rather than a full column. */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** Everything in the social column waiting on you: invites, requests and group messages; notifications have the bell. */
  total: number;
}

/**
 * The value outside a provider, as on signed-out pages. A frozen module constant, so callers need no null check and
 * the nav does not re-render on each pass.
 */
const ABSENT: RailContext = {
  data: {
    you: null,
    friends: [],
    requests: [],
    challenges: [],
    groups: [],
    notifications: [],
    unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
  },
  loading: false,
  failed: false,
  arrivals: [],
  dismiss: () => undefined,
  refresh: () => undefined,
  open: false,
  setOpen: () => undefined,
  collapsed: false,
  setCollapsed: () => undefined,
  total: 0,
};

const COLLAPSED_KEY = 'hevalo_rail_collapsed';
/* The key's name from before the app was renamed; see `readRenamed`. */
const LEGACY_COLLAPSED_KEY = 'mykurda_rail_collapsed';

function readCollapsed(): boolean {
  try {
    return readRenamed(localStorage, COLLAPSED_KEY, LEGACY_COLLAPSED_KEY) === '1';
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
 * Holds the rail's data and open state for the nav toggle and the panel, which cannot share state by nesting. One
 * provider sits above the routes (App.tsx), so switching shells keeps the data; a shell still wraps itself in one so
 * it works alone, and that inner one stands aside when a provider is already above it.
 */
export function RailProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const above = useContext(Ctx);
  if (above) return <>{children}</>;
  return <OwnRail>{children}</OwnRail>;
}

function OwnRail({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { data, loading, failed, arrivals, dismiss, refresh } = useSocialRail();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Column or strip is a per-browser preference, kept across page loads.
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // A browser with site data blocked still gets a working rail.
    }
  }, [collapsed]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Notifications have their own bell, so they are not counted here too.
  const total = data.unread.challenges + data.unread.requests + data.unread.groups;

  const value = useMemo(
    () => ({ data, loading, failed, arrivals, dismiss, refresh, open, setOpen, collapsed, setCollapsed, total }),
    [data, loading, failed, arrivals, dismiss, refresh, open, collapsed, total],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
