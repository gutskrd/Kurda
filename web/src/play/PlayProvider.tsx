import { createContext, useContext } from 'react';
import type { InviteLists } from '@kurda/shared';
import { useInvites } from './usePlay';

interface PlayInvites {
  /** Null until the first read, and for a guest. */
  lists: InviteLists | null;
  refresh: () => void;
}

const PlayCtx = createContext<PlayInvites | null>(null);

/** Without a provider (a test page, a guest's screen), nobody has asked you anything. */
const NONE: PlayInvites = { lists: null, refresh: () => undefined };

/**
 * The invites to you and answers to yours, read once for the whole app so the banner, notifications and every lobby's
 * "Invited" list agree. It sits above the routes (App.tsx) like the rail's provider, so a lesson's shell does not drop
 * it; a shell that wraps itself in one reuses the one above.
 */
export function PlayProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const above = useContext(PlayCtx);
  if (above) return <>{children}</>;
  return <OwnInvites>{children}</OwnInvites>;
}

function OwnInvites({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = useInvites();
  return <PlayCtx.Provider value={value}>{children}</PlayCtx.Provider>;
}

export function usePlayInvites(): PlayInvites {
  return useContext(PlayCtx) ?? NONE;
}
