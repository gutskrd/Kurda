/**
 * A person, everywhere the admin names one: their username, a link to their
 * page (#/users/<id>), and a "Minor" badge when they are under 18 — which
 * changes what a moderator may do, so it must never be a click away. Pages
 * used to show the first eight characters of a UUID, which nobody can act on.
 */
import { Badge } from './basics';

export interface UserRef {
  id: string;
  username?: string | null;
}

export function userHref(id: string): string {
  return `#/users/${encodeURIComponent(id)}`;
}

export function UserLink({
  user,
  minor,
  fallback = 'Deleted account',
}: {
  /** null when the account is gone (its rows are kept, the person is not) */
  user: UserRef | null | undefined;
  /** true under 18; null or undefined when not known */
  minor?: boolean | null;
  fallback?: string;
}): React.JSX.Element {
  if (!user) return <span className="subtle">{fallback}</span>;
  const name = user.username ? `@${user.username}` : `User ${user.id.slice(0, 8)}`;
  return (
    <span className="user-link">
      <a href={userHref(user.id)} title={user.username ? undefined : user.id}>
        {name}
      </a>
      {minor === true && (
        <Badge tone="warn" title="Under 18">
          Minor
        </Badge>
      )}
    </span>
  );
}
