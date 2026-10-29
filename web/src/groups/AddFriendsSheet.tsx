import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import type { UserSummary } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { ErrorState } from '../components/states';
import { ConversationsSkeleton } from '../components/skeletons';
import { useT } from '../i18n/I18nProvider';

/**
 * Adding friends to an invite-only group, as its owner or an admin: your
 * friends who are not in it yet, each with Add. Adding puts them straight in
 * (the server's rule: friends only, into an invite-only group), and the sheet
 * stays open for the next one. Someone banned from the group has to be
 * unbanned first, and is told so by name.
 */
export function AddFriendsSheet({
  open,
  groupId,
  groupName,
  memberIds,
  onClose,
  onAdded,
}: {
  open: boolean;
  groupId: string;
  groupName: string;
  /** who is in the group already, so they are not offered */
  memberIds: ReadonlySet<string>;
  onClose: () => void;
  /** somebody was added: the group is read again */
  onAdded: () => void;
}): React.JSX.Element | null {
  if (!open) return null;
  return <AddFriends groupId={groupId} groupName={groupName} memberIds={memberIds} onClose={onClose} onAdded={onAdded} />;
}

function AddFriends({
  groupId,
  groupName,
  memberIds,
  onClose,
  onAdded,
}: {
  groupId: string;
  groupName: string;
  memberIds: ReadonlySet<string>;
  onClose: () => void;
  onAdded: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const { data, error, loading, reload } = useApiGet<{ friends: UserSummary[] }>('/friends?limit=500');
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  // a friend added here stays listed, as Added, so the list does not jump under the pointer
  const friends = (data?.friends ?? []).filter((f) => !memberIds.has(f.userId) || added.has(f.userId));

  async function add(f: UserSummary): Promise<void> {
    const name = f.displayName || f.username;
    setAdding(f.userId);
    setProblem(null);
    const res = await client.post(`/groups/${groupId}/invite`, { userId: f.userId });
    setAdding(null);
    if (!res.ok) {
      setProblem(res.error.code === 'MEMBER_BANNED' ? t('groups.addFriends.banned', { name }) : describeError(res.error, t));
      return;
    }
    setAdded((s) => new Set(s).add(f.userId));
    setSaid(t('groups.addFriends.added', { name }));
    onAdded();
  }

  return (
    <Sheet open onClose={onClose} label={t('groups.addFriends')}>
      <p className="report-eyebrow">
        {/* the group's name in its own direction, the line in the page's, clear of the close */}
        <bdi>{groupName}</bdi>
      </p>
      <h2 className="report-heading">{t('groups.addFriends')}</h2>
      <p className="report-intro">{t('groups.addFriends.intro')}</p>
      {problem && (
        <div className="msg msg-error" role="alert">
          {problem}
        </div>
      )}
      <p className="sr-only" role="status">
        {said}
      </p>
      {loading && !data ? (
        <ConversationsSkeleton count={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : friends.length === 0 ? (
        <p className="ginfo-hint">{t('groups.addFriends.none')}</p>
      ) : (
        <ul className="list gadd-list">
          {friends.map((f) => {
            const name = f.displayName || f.username;
            const isIn = added.has(f.userId);
            return (
              <li key={f.userId} className="list-row">
                <span className="list-row-main gadd-who">
                  <Avatar url={f.avatarUrl} />
                  <span className="list-row-text">
                    <span className="list-row-title" dir="auto">
                      {name}
                    </span>
                    <span className="list-row-sub">@{f.username}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className={`gdisc-btn${isIn ? ' is-outline' : ''}`}
                  disabled={isIn || adding !== null}
                  aria-label={isIn ? t('groups.addFriends.addedWho', { name }) : t('groups.addFriends.addWho', { name })}
                  onClick={() => void add(f)}
                >
                  {isIn ? t('groups.addFriends.addedShort') : t('groups.addFriends.add')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
