import { useCallback, useEffect, useState } from 'react';
import type { GroupBan, GroupRejoinRequest } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { formatUntil } from '../reports/restriction';
import { useProfileModal } from '../profile/ProfileModal';
import { useLocale, useT } from '../i18n/I18nProvider';

/**
 * The owner's and the admins' two lists: who asks to come back, and who is
 * banned. Loaded once the page opens and kept here, so a yes asked for in
 * between does not empty them.
 */
export function useModeration(
  groupId: string,
  enabled: boolean,
): {
  requests: GroupRejoinRequest[] | null;
  bans: GroupBan[] | null;
  error: string | null;
  reload: () => Promise<void>;
} {
  const { client } = useAuth();
  const t = useT();
  const [requests, setRequests] = useState<GroupRejoinRequest[] | null>(null);
  const [bans, setBans] = useState<GroupBan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const [r, b] = await Promise.all([
      client.get<{ requests: GroupRejoinRequest[] }>(`/groups/${groupId}/requests`),
      client.get<{ bans: GroupBan[] }>(`/groups/${groupId}/bans`),
    ]);
    if (r.ok) setRequests(r.data.requests ?? []);
    if (b.ok) setBans(b.data.bans ?? []);
    const failed = !r.ok ? r.error : !b.ok ? b.error : null;
    setError(failed ? describeError(failed, t) : null);
  }, [client, enabled, groupId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { requests, bans, error, reload };
}

/** Two rows in their own shape while a list loads. */
function ListSkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="gmod-list">
      {[120, 96].map((w) => (
        <div className="gmod-skel" key={w}>
          <Skeleton circle size={40} />
          <Skeleton line w={w} />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** A person in one of the lists: their face and name open their profile; a quiet line under the name. */
function Who({ userId, username, avatarUrl, sub }: { userId: string; username: string; avatarUrl: string | null; sub: string }): React.JSX.Element {
  const { openProfile } = useProfileModal();
  return (
    <button type="button" className="ginfo-who" onClick={() => openProfile({ kind: 'user', userId, username })}>
      <Avatar url={avatarUrl} glyphSize={18} />
      <span className="ginfo-who-text">
        <span className="ginfo-who-name" dir="auto">
          {username}
        </span>
        <span className="ginfo-role">{sub}</span>
      </span>
    </button>
  );
}

/**
 * "Requests to come back": each with the person, their note, when they asked
 * and how often they were turned down before — what the decision needs — and
 * Approve and Decline. An empty list says so.
 */
export function RequestsSection({
  requests,
  waiting,
  error,
  busy,
  onApprove,
  onDecline,
}: {
  requests: GroupRejoinRequest[] | null;
  /** how many the group says are waiting, for the badge before the list has come */
  waiting: number;
  error: string | null;
  busy: boolean;
  onApprove: (request: GroupRejoinRequest) => void;
  onDecline: (request: GroupRejoinRequest) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const count = requests?.length ?? waiting;
  return (
    <section className="ginfo-section" aria-labelledby="ginfo-requests">
      <h3 className="ginfo-section-title gmod-title" id="ginfo-requests">
        {t('groups.requests.title')}
        {count > 0 && <span className="gmod-count">{count}</span>}
      </h3>
      {requests === null ? (
        error ? <p className="ginfo-hint">{error}</p> : <ListSkeleton />
      ) : requests.length === 0 ? (
        <p className="ginfo-hint">{t('groups.requests.none')}</p>
      ) : (
        <ul className="gmod-list">
          {requests.map((r) => {
            const before =
              r.declines === 1 ? t('groups.requests.declinedOnce') : r.declines > 1 ? t('groups.requests.declinedMany', { count: r.declines }) : null;
            const sent = t('groups.requests.sent', { when: formatUntil(r.sentAt, locale) });
            return (
              <li className="gmod-row" key={r.userId}>
                <Who userId={r.userId} username={r.username} avatarUrl={r.avatarUrl} sub={before ? `${sent} · ${before}` : sent} />
                {r.note && (
                  <p className="gmod-note" dir="auto">
                    {r.note}
                  </p>
                )}
                <div className="gmod-actions">
                  <Button size="sm" onClick={() => onApprove(r)} disabled={busy} aria-label={t('groups.requests.approveWho', { name: r.username })}>
                    {t('groups.requests.approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onDecline(r)}
                    disabled={busy}
                    aria-label={t('groups.requests.declineWho', { name: r.username })}
                  >
                    {t('groups.requests.decline')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "Banned": until when (or for good), why, and who did it; Unban at the end. An empty list says so. */
export function BansSection({
  bans,
  error,
  busy,
  onUnban,
}: {
  bans: GroupBan[] | null;
  error: string | null;
  busy: boolean;
  onUnban: (ban: GroupBan) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <section className="ginfo-section" aria-labelledby="ginfo-bans">
      <h3 className="ginfo-section-title" id="ginfo-bans">
        {t('groups.bans.title')}
      </h3>
      {bans === null ? (
        error ? <p className="ginfo-hint">{error}</p> : <ListSkeleton />
      ) : bans.length === 0 ? (
        <p className="ginfo-hint">{t('groups.bans.none')}</p>
      ) : (
        <ul className="gmod-list">
          {bans.map((b) => {
            const until = b.until ? t('groups.bans.until', { date: formatUntil(b.until, locale) }) : t('groups.ban.forGood');
            return (
              <li className="gmod-row is-ban" key={b.userId}>
                <Who userId={b.userId} username={b.username} avatarUrl={b.avatarUrl} sub={b.bannedBy ? `${until} · ${t('groups.bans.by', { name: b.bannedBy })}` : until} />
                <Button
                  size="sm"
                  variant="secondary"
                  className="gmod-unban"
                  onClick={() => onUnban(b)}
                  disabled={busy}
                  aria-label={t('groups.bans.unbanWho', { name: b.username })}
                >
                  {t('groups.bans.unban')}
                </Button>
                {b.reason && (
                  <p className="gmod-note" dir="auto">
                    {b.reason}
                  </p>
                )}
                {b.requestsClosed && <p className="gmod-quiet">{t('groups.bans.requestsStopped')}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
