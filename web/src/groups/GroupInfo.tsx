import { useState } from 'react';
import {
  canEditGroup,
  canManage,
  canModerateGroup,
  canSetRole,
  requestCooldownDays,
  roleRank,
  type GroupBan,
  type GroupRejoinRequest,
  type Role,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, GroupDetail, GroupMember } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { BlockIcon, DrawIcon, FlagIcon, HostIcon, RemovePersonIcon, SafetyIcon, SignOutIcon, TrashIcon, UserIcon } from '../components/icons';
import { useProfileModal } from '../profile/ProfileModal';
import { ReportSheet } from '../reports/ReportSheet';
import { useT } from '../i18n/I18nProvider';
import { GroupAvatar } from './GroupAvatar';
import { GroupEdit } from './GroupEdit';
import { GroupAsk } from './GroupAsk';
import { BanSheet } from './BanSheet';
import { OptionsMenu, type MenuItem } from './OptionsMenu';
import { BansSection, RequestsSection, useModeration } from './GroupModeration';
import { announceGroupsChanged } from './groupsChanged';

/** Something that cannot be taken back, waiting for a yes. */
type Ask =
  | { kind: 'remove' | 'owner'; member: GroupMember }
  | { kind: 'leave' }
  | { kind: 'delete' }
  | { kind: 'decline'; request: GroupRejoinRequest }
  | { kind: 'unban'; ban: GroupBan };

/**
 * A group's own page, opened from its thread: what it is, who is in it, and
 * what you may do about it.
 *
 * At the top the group itself — its picture, name, description, whether
 * anyone can join and how many have — and, for the owner and the admins, the
 * way to change those. Then the members, one plain row each: a face, a name,
 * and a quiet word under it for the owner and the admins. Nothing to press on
 * the row but the person: what you may do about somebody (make them an admin,
 * hand them the group, remove or ban them) waits behind a ⋯ at its end, and
 * only when there is something. The rules are @kurda/shared's, which the
 * server decides with too, so nothing is offered that would be refused.
 *
 * The owner and the admins also see who asks to come back — above the
 * members, since each is waiting on them — and, under the members, who is
 * banned.
 *
 * Anything that cannot be undone — removing someone, handing on the group,
 * leaving it, deleting it, turning a request down, lifting a ban — asks first,
 * in a step of its own with the plain consequences and Cancel beside it. What
 * is about the group rather than its members (report, leave, delete) sits at
 * the end, apart.
 */
export function GroupInfo({
  detail,
  onChanged,
  onLeft,
}: {
  detail: GroupDetail;
  /** reload the group (its name, picture and roster) after a change */
  onChanged: () => Promise<void>;
  /** you are no longer in it (left, or deleted it): whatever showed it goes */
  onLeft: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const { openProfile } = useProfileModal();
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** what the last action did, said where a screen reader hears it */
  const [done, setDone] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [banning, setBanning] = useState<GroupMember | null>(null);
  /** turning a request down stops that person's requests too */
  const [stopRequests, setStopRequests] = useState(false);

  const myRole = detail.myRole;
  const mayEdit = canEditGroup(myRole);
  const moderates = canModerateGroup(myRole);
  const moderation = useModeration(detail.id, moderates);

  async function act(
    run: () => Promise<{ ok: boolean; error?: ApiError }>,
    after?: () => void,
    said?: string,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await run();
    setBusy(false);
    setAsk(null);
    if (!res.ok) {
      setError(res.error ? describeError(res.error, t) : t('chat.thatDidNotWork'));
      return;
    }
    if (said) setDone(said);
    if (after) after();
    else await onChanged();
  }

  const setRole = (m: GroupMember, role: 'moderator' | 'member'): Promise<void> =>
    act(() => client.put(`/groups/${detail.id}/members/${m.userId}/role`, { role }));

  /** a request or a ban changed: both lists, and the roster and its count, are read again */
  async function afterModeration(): Promise<void> {
    await Promise.all([moderation.reload(), onChanged()]);
  }

  async function approve(r: GroupRejoinRequest): Promise<void> {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await client.post<{ rejoined?: boolean }>(`/groups/${detail.id}/requests/${r.userId}/approve`);
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    // the ban is lifted either way; whether they are back in depends on the group's usual rules
    setDone(res.data.rejoined === false ? t('groups.requests.approvedOut', { name: r.username }) : t('groups.requests.approvedIn', { name: r.username }));
    await afterModeration();
  }

  function confirm(): void {
    if (!ask) return;
    switch (ask.kind) {
      case 'remove':
        void act(() => client.delete(`/groups/${detail.id}/members/${ask.member.userId}`));
        return;
      case 'owner':
        void act(() => client.post(`/groups/${detail.id}/transfer`, { userId: ask.member.userId }));
        return;
      case 'leave':
        void act(
          () => client.post(`/groups/${detail.id}/leave`),
          () => {
            announceGroupsChanged();
            onLeft();
          },
        );
        return;
      case 'delete':
        void act(
          () => client.delete(`/groups/${detail.id}`),
          () => {
            announceGroupsChanged();
            onLeft();
          },
        );
        return;
      case 'decline': {
        const { request } = ask;
        void act(
          () => client.post(`/groups/${detail.id}/requests/${request.userId}/decline`, { stopRequests }),
          () => void afterModeration(),
          t('groups.requests.declined', { name: request.username }),
        );
        return;
      }
      case 'unban': {
        const { ban } = ask;
        void act(
          () => client.delete(`/groups/${detail.id}/bans/${ban.userId}`),
          () => void afterModeration(),
          t('groups.bans.unbanned', { name: ban.username }),
        );
      }
    }
  }

  // what an action did, first in the page in every view, so it stays put while a yes is asked for and is heard when it changes
  const status = (
    <p className={done ? 'msg msg-success ginfo-done' : 'sr-only'} role="status">
      {done}
    </p>
  );

  if (editing) {
    return (
      <div className="ginfo">
        {status}
        <GroupEdit
          detail={detail}
          onDone={() => setEditing(false)}
          onChanged={async () => {
            await onChanged();
            announceGroupsChanged();
          }}
        />
      </div>
    );
  }

  if (ask) {
    const step = askWords(ask, detail, t);
    return (
      <div className="ginfo">
        {status}
        <GroupAsk
          title={step.title}
          body={step.body}
          action={step.action}
          danger={step.danger}
          busy={busy}
          onCancel={() => setAsk(null)}
          onConfirm={confirm}
        >
          {ask.kind === 'decline' && (
            <label className="gswitch">
              <input type="checkbox" role="switch" className="settings-switch-input" checked={stopRequests} onChange={(e) => setStopRequests(e.target.checked)} />
              <span className="gswitch-text">
                <span>{t('groups.requests.stop', { name: ask.request.username })}</span>
                <span className="gswitch-hint">{t('groups.requests.stopHint')}</span>
              </span>
            </label>
          )}
        </GroupAsk>
      </div>
    );
  }

  // owner, then admins, then everyone else by name
  const members = [...detail.members].sort((a, b) => roleRank(b.role) - roleRank(a.role) || a.username.localeCompare(b.username));
  const roleWord = (role: Role): string | null =>
    role === 'owner' ? t('groups.role.owner') : role === 'moderator' ? t('groups.role.admin') : null;

  return (
    <div className="ginfo">
      {status}
      <header className="ginfo-head">
        <GroupAvatar id={detail.id} name={detail.name} photoUrl={detail.photoUrl} size={96} />
        <h2 className="ginfo-name" dir="auto">
          {detail.name}
        </h2>
        {detail.description && (
          <p className="ginfo-about" dir="auto">
            {detail.description}
          </p>
        )}
        <p className="ginfo-meta">
          {detail.privacy === 'invite' ? t('groups.inviteGroup') : t('groups.openGroup')}
          {' · '}
          {t('groups.memberCount', { count: detail.memberCount ?? detail.members.length })}
        </p>
        {mayEdit && (
          <Button variant="secondary" size="sm" className="ginfo-edit" onClick={() => setEditing(true)}>
            <DrawIcon size={16} />
            {t('groups.edit')}
          </Button>
        )}
      </header>

      {error && (
        <div className="msg msg-error" role="alert">
          {error}
        </div>
      )}

      {moderates && (
        <RequestsSection
          requests={moderation.requests}
          waiting={detail.pendingRequests ?? 0}
          error={moderation.error}
          busy={busy}
          onApprove={(r) => void approve(r)}
          onDecline={(r) => {
            setStopRequests(false);
            setAsk({ kind: 'decline', request: r });
          }}
        />
      )}

      <section className="ginfo-section" aria-labelledby="ginfo-members">
        <h3 className="ginfo-section-title" id="ginfo-members">
          {t('groups.members')}
        </h3>
        {mayEdit && <p className="ginfo-hint">{t('groups.adminHint')}</p>}
        <ul className="ginfo-members">
          {members.map((m) => {
            const self = m.userId === user?.id;
            const word = roleWord(m.role);
            const manageable = myRole !== null && !self && canManage(myRole, m.role);
            const owner = myRole !== null && canSetRole(myRole, 'moderator');
            const items: MenuItem[] = manageable
              ? [
                  { key: 'profile', label: t('groups.viewProfile'), icon: <UserIcon size={18} />, run: () => openProfile({ kind: 'user', userId: m.userId, username: m.username }) },
                  ...(owner && m.role === 'member' ? [{ key: 'admin', label: t('groups.makeAdmin'), icon: <SafetyIcon size={18} />, run: () => void setRole(m, 'moderator') }] : []),
                  ...(owner && m.role === 'moderator' ? [{ key: 'unadmin', label: t('groups.removeAdmin'), icon: <SafetyIcon size={18} />, run: () => void setRole(m, 'member') }] : []),
                  ...(myRole === 'owner' ? [{ key: 'owner', label: t('groups.makeOwner'), icon: <HostIcon size={18} weight="regular" />, run: () => setAsk({ kind: 'owner', member: m }) }] : []),
                  { key: 'remove', label: t('groups.removeMember'), icon: <RemovePersonIcon size={18} />, danger: true, run: () => setAsk({ kind: 'remove', member: m }) },
                  { key: 'ban', label: t('groups.ban.menu'), icon: <BlockIcon size={18} />, danger: true, run: () => setBanning(m) },
                ]
              : [];
            return (
              <li className="ginfo-member" key={m.userId}>
                {/* the person is the row: it opens their profile */}
                <button type="button" className="ginfo-who" onClick={() => openProfile({ kind: 'user', userId: m.userId, username: m.username })}>
                  <Avatar url={m.avatarUrl} glyphSize={18} />
                  <span className="ginfo-who-text">
                    <span className="ginfo-who-top">
                      <span className="ginfo-who-name" dir="auto">
                        {m.username}
                      </span>
                      {self && <span className="ginfo-you">{t('chat.you')}</span>}
                    </span>
                    {word && <span className="ginfo-role">{word}</span>}
                  </span>
                </button>
                {items.length > 0 && <OptionsMenu label={t('groups.memberOptions', { name: m.username })} items={items} disabled={busy} />}
              </li>
            );
          })}
        </ul>
      </section>

      {moderates && (
        <BansSection
          bans={moderation.bans}
          error={moderation.error}
          busy={busy}
          onUnban={(ban) => setAsk({ kind: 'unban', ban })}
        />
      )}

      <ul className="ginfo-end">
        {myRole !== 'owner' && (
          <li>
            <button type="button" className="ginfo-end-row" onClick={() => setReporting(true)}>
              <FlagIcon size={18} />
              {t('report.group')}
            </button>
          </li>
        )}
        {myRole !== null && myRole !== 'owner' && (
          <li>
            <button type="button" className="ginfo-end-row is-danger" onClick={() => setAsk({ kind: 'leave' })}>
              <SignOutIcon size={18} className="flip-rtl" />
              {t('groups.leave', { group: detail.name })}
            </button>
          </li>
        )}
        {myRole === 'owner' && (
          <>
            {/* the server refuses an owner's leave — a group with no owner has nobody to hand it on — so it says what to do instead */}
            <li className="ginfo-note">{t('groups.ownerCannotLeave', { group: detail.name })}</li>
            <li>
              <button type="button" className="ginfo-end-row is-danger" onClick={() => setAsk({ kind: 'delete' })}>
                <TrashIcon size={18} />
                {t('groups.delete')}
              </button>
            </li>
          </>
        )}
      </ul>

      <ReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        target={{ targetType: 'group', targetId: detail.id }}
        name={detail.name}
        leaveGroup={myRole !== null && myRole !== 'owner' ? { groupId: detail.id, name: detail.name } : null}
        onLeftGroup={() => {
          announceGroupsChanged();
          onLeft();
        }}
      />
      <BanSheet
        groupId={detail.id}
        groupName={detail.name}
        member={banning}
        onClose={() => setBanning(null)}
        onBanned={() => {
          const name = banning?.username ?? '';
          setBanning(null);
          setError(null);
          setDone(t('groups.ban.done', { name }));
          void afterModeration();
        }}
      />
    </div>
  );
}

/** What each yes says: its title, the plain consequences, the button that does it, and whether that button is the danger colour. */
function askWords(
  ask: Ask,
  detail: GroupDetail,
  t: ReturnType<typeof useT>,
): { title: string; body: React.ReactNode; action: string; danger: boolean } {
  switch (ask.kind) {
    case 'remove': {
      const name = ask.member.username;
      return {
        title: t('groups.removeMember'),
        body: (
          <>
            <p>{t('groups.removeFrom', { name, group: detail.name })}</p>
            {/* removed is not banned: they can come back, and are told how */}
            <p>{detail.privacy === 'invite' ? t('groups.remove.canBeAdded', { name }) : t('groups.remove.canJoin', { name })}</p>
          </>
        ),
        action: t('groups.removeMember'),
        danger: true,
      };
    }
    case 'owner':
      return { title: t('groups.makeOwner'), body: t('groups.makeOwnerWarning', { name: ask.member.username }), action: t('groups.makeOwner'), danger: false };
    case 'leave':
      return { title: t('groups.leave', { group: detail.name }), body: null, action: t('groups.leave', { group: detail.name }), danger: true };
    case 'delete':
      return { title: t('groups.delete'), body: t('groups.deleteWarning', { group: detail.name }), action: t('groups.delete'), danger: true };
    case 'decline': {
      const { username: name, declines } = ask.request;
      const days = requestCooldownDays(declines + 1);
      return {
        title: t('groups.requests.declineTitle', { name }),
        body: days === 1 ? t('groups.requests.waitDay', { name }) : t('groups.requests.waitDays', { name, count: days }),
        action: t('groups.requests.decline'),
        danger: true,
      };
    }
    case 'unban':
      return {
        title: t('groups.bans.unbanTitle', { name: ask.ban.username }),
        body: t('groups.bans.unbanBody', { name: ask.ban.username }),
        action: t('groups.bans.unban'),
        danger: false,
      };
  }
}
