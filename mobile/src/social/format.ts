/** Pure social view helpers (KUR-082) — no React Native. */

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';
export type Visibility = 'everyone' | 'friends' | 'nobody';

/** The primary friend-action label for a relationship, or null when there's none. */
export function friendActionLabel(status: FriendStatus): string | null {
  switch (status) {
    case 'none':
      return 'Add friend';
    case 'pending_out':
      return 'Requested';
    case 'pending_in':
      return 'Accept request';
    case 'friends':
      return 'Friends ✓';
    case 'blocked':
      return 'Blocked';
    case 'self':
      return null;
  }
}

/** Is the friend action button actionable (vs. an informational state)? */
export function isActionable(status: FriendStatus): boolean {
  return status === 'none' || status === 'pending_in';
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  everyone: 'Everyone',
  friends: 'Friends only',
  nobody: 'Nobody',
};
