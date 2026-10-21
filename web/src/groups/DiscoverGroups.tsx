import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { foldForSearch } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { DiscoverGroup } from '../lib/types';
import { Button } from '../components/Button';
import { ErrorState } from '../components/states';
import { SearchField } from '../components/SearchField';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { useT } from '../i18n/I18nProvider';
import { GroupAvatar } from './GroupAvatar';
import { announceGroupsChanged } from './groupsChanged';

/** Every word typed has to be somewhere in the name or the description, accents and case aside. */
export function groupMatches(group: Pick<DiscoverGroup, 'name' | 'description'>, query: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldForSearch(`${group.name} ${group.description ?? ''}`);
  return words.every((w) => hay.includes(w));
}

/**
 * Groups to find and join: a list, each with its picture, its name, what it
 * is about and how many are in it, and one button at the end of the row —
 * Join, or Open for a group you are already in.
 *
 * The server lists open groups only (an invite-only group is joined by being
 * invited), says which of them you are in (`joined`, else the ids you pass),
 * and the search narrows what it sent without asking again.
 */
export function DiscoverGroups({
  mineIds,
  onOpen,
  onJoined,
  onNew,
}: {
  /** the groups you are in, for a server that does not say `joined` itself */
  mineIds: Set<string>;
  /** a joined group was opened: whatever holds this list closes */
  onOpen: () => void;
  /** you joined one: the list of your groups reloads, and the group opens */
  onJoined: (group: DiscoverGroup) => void;
  /** start a group of your own, from the empty list */
  onNew: () => void;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [groups, setGroups] = useState<DiscoverGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<{ groups: DiscoverGroup[] }>('/groups');
    if (res.ok) setGroups(res.data.groups ?? []);
    else setError(describeError(res.error, t));
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join(group: DiscoverGroup): Promise<void> {
    setJoining(group.id);
    setError(null);
    const res = await client.post(`/groups/${group.id}/join`);
    setJoining(null);
    if (res.ok) {
      setGroups((list) => (list ?? []).map((g) => (g.id === group.id ? { ...g, joined: true, memberCount: g.memberCount + 1 } : g)));
      announceGroupsChanged();
      onJoined(group);
    } else setError(describeError(res.error, t));
  }

  if (error && groups === null) return <ErrorState message={error} onRetry={() => void load()} />;

  const shown = (groups ?? []).filter((g) => groupMatches(g, query));
  const isIn = (g: DiscoverGroup): boolean => g.joined ?? mineIds.has(g.id);

  return (
    <div className="gdisc">
      <h2 className="gdisc-title">{t('groups.discover')}</h2>
      {groups !== null && groups.length > 0 && (
        <SearchField
          icon
          className="gdisc-search"
          value={query}
          onValueChange={setQuery}
          placeholder={t('groups.search')}
          aria-label={t('groups.search')}
          autoComplete="off"
        />
      )}
      {error && <div className="msg msg-error" role="alert">{error}</div>}

      {groups === null ? (
        <DiscoverSkeleton />
      ) : groups.length === 0 ? (
        <div className="gdisc-empty">
          <p>{t('groups.nothingToDiscover')}</p>
          <Button size="sm" onClick={onNew}>
            {t('groups.new')}
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="gdisc-none">{t('groups.noMatch', { query: query.trim() })}</p>
      ) : (
        <ul className="gdisc-list">
          {shown.map((g) => {
            const joined = isIn(g);
            return (
              <li className="gdisc-row" key={g.id}>
                <GroupAvatar id={g.id} name={g.name} photoUrl={g.photoUrl} size={52} />
                <span className="gdisc-text">
                  {/* what people named their group runs in its own direction */}
                  <span className="gdisc-name" dir="auto">
                    {g.name}
                  </span>
                  {g.description && (
                    <span className="gdisc-about" dir="auto">
                      {g.description}
                    </span>
                  )}
                  <span className="gdisc-meta">
                    {t('groups.memberCount', { count: g.memberCount })}
                    {g.privacy === 'invite' ? ` · ${t('groups.inviteGroup')}` : ''}
                  </span>
                </span>
                {joined ? (
                  <Link
                    to={`/app/messages?group=${g.id}`}
                    className="gdisc-btn is-outline"
                    aria-label={`${t('groups.openIt')}: ${g.name}`}
                    onClick={onOpen}
                  >
                    {t('groups.openIt')}
                  </Link>
                ) : g.privacy === 'invite' ? null : (
                  <button
                    type="button"
                    className="gdisc-btn"
                    disabled={joining !== null}
                    aria-label={`${t('groups.join')}: ${g.name}`}
                    onClick={() => void join(g)}
                  >
                    {joining === g.id ? t('groups.joining') : t('groups.join')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The list while it loads, in its own shape: a square, two lines and a pill. */
function DiscoverSkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="gdisc-list">
      {[132, 96, 150, 110].map((w, i) => (
        <div className="gdisc-row" key={i}>
          <Skeleton w={52} h={52} radius={11} />
          <span className="gdisc-text">
            <Skeleton line w={w} />
            <Skeleton line w={['86%', '64%', '78%', '58%'][i]} />
          </span>
          <Skeleton w={64} h={32} radius={999} />
        </div>
      ))}
    </SkeletonRegion>
  );
}
