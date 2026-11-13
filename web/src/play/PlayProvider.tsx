import { createContext, useContext } from 'react';
import type { InviteLists } from '@kurda/shared';
import { useInvites } from './usePlay';

interface PlayInvites {
  /** null until the first read, and for a guest */
  lists: InviteLists | null;
  refresh: () => void;
}

const PlayCtx = createContext<PlayInvites | null>(null);

/** With no provider (a page in a test, a guest's screen): nobody has asked you anything. */
const NONE: PlayInvites = { lists: null, refresh: () => undefined };

/**
 * The invites to you and your friends' answers to yours, read once for the
 * whole app: the banner, the notifications and every lobby's "Invited" list
 * show the same answer, and one request keeps them all current.
 *
 * One for the whole app, above the routes (App.tsx), beside the rail's
 * (social/RailProvider.tsx) and for the same reason: a provider in each shell
 * forgot every invite each time a lesson's shell gave way to the app's. A
 * shell that wraps itself in one, to work drawn alone, gets the one above.
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
