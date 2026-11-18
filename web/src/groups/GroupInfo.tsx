import { useEffect, useRef, useState } from 'react';
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
import { BlockIcon, DrawIcon, FlagIcon, HostIcon, InviteIcon, RemovePersonIcon, SafetyIcon, SignOutIcon, TrashIcon, UserIcon } from '../components/icons';
import { useProfileModal } from '../profile/ProfileModal';
import { ReportSheet } from '../reports/ReportSheet';
import { useT, type Translate } from '../i18n/I18nProvider';
import { GroupAvatar } from './GroupAvatar';
import { GroupEdit } from './GroupEdit';
import { GroupAsk } from './GroupAsk';
import { AddFriendsSheet } from './AddFriendsSheet';
import { BanSheet } from './BanSheet';
import { OptionsMenu, type MenuItem } from './OptionsMenu';
import { BansSection, RequestsSection, useModeration } from './GroupModeration';
import { announceGroupsChanged } from './groupsChanged';
import { useLeaveGroup } from './leave';
import { membersLine } from './memberCount';

/** Something irreversible, waiting for confirmation. */
type Ask =
  | { kind: 'remove' | 'owner'; member: GroupMember }
  | { kind: 'leave' }
  | { kind: 'delete' }
  | { kind: 'decline'; request: GroupRejoinRequest }
  | { kind: 'unban'; ban: GroupBan };

/**
 * A group's own page for its members: the group's picture, name, description and size, then always in this order:
 *
 * - the members, with roles noted quietly; owners and admins get "Add friends" first. Actions on a member wait behind
 *   a ⋯, shown only when the shared rules (which the server also uses) allow something;
 * - for owners and admins, requests to come back (only while there are some), then bans;
 * - actions on the group itself: edit, report, leave, or delete for the owner.
 *
 * Anything irreversible asks first in a step of its own, with the consequences and Cancel.
 */
export function GroupInfo({
  detail,
  onChanged,
  onLeft,
  showRequests = false,
}: {
  detail: GroupDetail;
  /** Reloads the group's name, picture and roster after a change. */
  onChanged: () => Promise<void>;
  /** The reader left or deleted it, so whatever showed it goes. */
  onLeft: () => void;
  /** Opened to answer requests to come back, which are scrolled into view. */
  showRequests?: boolean;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const leave = useLeaveGroup();
  const t = useT();
  const { openProfile } = useProfileModal();
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the last action did, announced to screen readers. */
  const [done, setDone] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [banning, setBanning] = useState<GroupMember | null>(null);
  const [adding, setAdding] = useState(false);
  /** Declining a request also stops that person's requests. */
  const [stopRequests, setStopRequests] = useState(false);

  const myRole = detail.myRole;
  const mayEdit = canEditGroup(myRole);
  const moderates = canModerateGroup(myRole);
  const moderation = useModeration(detail.id, moderates);
  // The list once loaded, the group's own count until then.
  const waiting = moderation.requests?.length ?? detail.pendingRequests ?? 0;

  // The requests sit under the members; a reader who came to answer them is scrolled there once.
  const requestsRef = useRef<HTMLDivElement>(null);
  const shownRequests = useRef(false);
  useEffect(() => {
    if (!showRequests || shownRequests.current || !requestsRef.current) return;
    shownRequests.current = true;
    requestsRef.current.scrollIntoView?.({ block: 'start' });
  }, [showRequests, waiting]);

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

  /** After a request or ban changes, reloads both lists and the roster. */
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
    // The ban is lifted either way; whether they are back in depends on the group's rules.
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
        // Out at once once confirmed (groups/leave.ts); a refusal is said by the app's notice, since this view has gone.
        setAsk(null);
        onLeft();
        void leave(detail.id);
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

  // The action status comes first in every view, so it stays put during confirmations and is announced on change.
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

  // Owner, then admins, then everyone else by name.
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
        <p className="ginfo-meta">{membersLine(t, detail.memberCount ?? detail.members.length)}</p>
      </header>

      {error && (
        <div className="msg msg-error" role="alert">
          {error}
        </div>
      )}

      <section className="ginfo-section" aria-labelledby="ginfo-members">
        <h3 className="ginfo-section-title" id="ginfo-members">
          {t('groups.members')}
        </h3>
        {moderates && (
          <Button variant="secondary" size="sm" className="ginfo-add" aria-haspopup="dialog" onClick={() => setAdding(true)}>
            <InviteIcon size={16} />
            {t('groups.addFriends')}
          </Button>
        )}
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
                {/* The row opens the person's profile. */}
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

      {moderates && waiting > 0 && (
        <div ref={requestsRef}>
          <RequestsSection
            requests={moderation.requests}
            waiting={waiting}
            error={moderation.error}
            busy={busy}
            onApprove={(r) => void approve(r)}
            onDecline={(r) => {
              setStopRequests(false);
              setAsk({ kind: 'decline', request: r });
            }}
          />
        </div>
      )}

      {moderates && (
        <BansSection
          bans={moderation.bans}
          error={moderation.error}
          busy={busy}
          onUnban={(ban) => setAsk({ kind: 'unban', ban })}
        />
      )}

      <ul className="ginfo-end">
        {mayEdit && (
          <li>
            <button type="button" className="ginfo-end-row" onClick={() => setEditing(true)}>
              <DrawIcon size={18} />
              {t('groups.edit')}
            </button>
          </li>
        )}
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
            {/* The server refuses an owner's leave, so this says what to do instead. */}
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
      {moderates && (
        <AddFriendsSheet
          open={adding}
          groupId={detail.id}
          groupName={detail.name}
          memberIds={new Set(detail.members.map((m) => m.userId))}
          onClose={() => setAdding(false)}
          onAdded={() => void onChanged()}
        />
      )}
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

/** Each confirmation's title, consequences, button label, and whether the button is the danger colour. */
function askWords(
  ask: Ask,
  detail: GroupDetail,
  t: Translate,
): { title: string; body: React.ReactNode; action: string; danger: boolean } {
  switch (ask.kind) {
    case 'remove': {
      const name = ask.member.username;
      return {
        title: t('groups.removeMember'),
        body: (
          <>
            <p>{t('groups.removeFrom', { name, group: detail.name })}</p>
            {/* Removed is not banned: they can be added again, and are told so. */}
            <p>{t('groups.remove.canBeAdded', { name })}</p>
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
