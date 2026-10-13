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
 */
export function PlayProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = useInvites();
  return <PlayCtx.Provider value={value}>{children}</PlayCtx.Provider>;
}

export function usePlayInvites(): PlayInvites {
  return useContext(PlayCtx) ?? NONE;
}
