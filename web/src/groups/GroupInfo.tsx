import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canEditGroup, canManage, canSetRole, roleRank, type Role } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, GroupDetail, GroupMember } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { DrawIcon, FlagIcon, HostIcon, MoreIcon, RemovePersonIcon, SafetyIcon, SignOutIcon, TrashIcon, UserIcon } from '../components/icons';
import { useProfileModal } from '../profile/ProfileModal';
import { keepInView } from '../reports/keepInView';
import { ReportSheet } from '../reports/ReportSheet';
import { useT } from '../i18n/I18nProvider';
import { GroupAvatar } from './GroupAvatar';
import { GroupEdit } from './GroupEdit';
import { announceGroupsChanged } from './groupsChanged';

/** Something that cannot be taken back, waiting for a yes. */
type Ask = { kind: 'remove' | 'owner'; member: GroupMember } | { kind: 'leave' } | { kind: 'delete' };

/**
 * A group's own page, opened from its thread: what it is, who is in it, and
 * what you may do about it.
 *
 * At the top the group itself — its picture, name, description, whether
 * anyone can join and how many have — and, for the owner and the admins, the
 * way to change those. Then the members, one plain row each: a face, a name,
 * and a quiet word under it for the owner and the admins. Nothing to press on
 * the row but the person: what you may do about somebody (make them an admin,
 * hand them the group, remove them) waits behind a ⋯ at its end, and only
 * when there is something. The rules are @kurda/shared's, which the server
 * decides with too, so nothing is offered that would be refused.
 *
 * Anything that cannot be undone — removing someone, handing on the group,
 * leaving it, deleting it — asks first, in a step of its own with the plain
 * consequences and Cancel beside it. What is about the group rather than its
 * members (report, leave, delete) sits at the end, apart.
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
  const [reporting, setReporting] = useState(false);

  const myRole = detail.myRole;
  const mayEdit = canEditGroup(myRole);

  async function act(run: () => Promise<{ ok: boolean; error?: ApiError }>, after?: () => void): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await run();
    setBusy(false);
    setAsk(null);
    if (!res.ok) {
      setError(res.error ? describeError(res.error, t) : t('chat.thatDidNotWork'));
      return;
    }
    if (after) after();
    else await onChanged();
  }

  const setRole = (m: GroupMember, role: 'moderator' | 'member'): Promise<void> =>
    act(() => client.put(`/groups/${detail.id}/members/${m.userId}/role`, { role }));

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
    }
  }

  if (editing) {
    return (
      <GroupEdit
        detail={detail}
        onDone={() => setEditing(false)}
        onChanged={async () => {
          await onChanged();
          announceGroupsChanged();
        }}
      />
    );
  }

  if (ask) {
    const name = ask.kind === 'remove' || ask.kind === 'owner' ? ask.member.username : '';
    const [title, body, action, danger] =
      ask.kind === 'remove'
        ? [t('groups.removeMember'), t('groups.removeFrom', { name, group: detail.name }), t('groups.removeMember'), true]
        : ask.kind === 'owner'
          ? [t('groups.makeOwner'), t('groups.makeOwnerWarning', { name }), t('groups.makeOwner'), false]
          : ask.kind === 'leave'
            ? [t('groups.leave', { group: detail.name }), null, t('groups.leave', { group: detail.name }), true]
            : [t('groups.delete'), t('groups.deleteWarning', { group: detail.name }), t('groups.delete'), true];
    return (
      <div className="ginfo-ask" role="alertdialog" aria-labelledby="ginfo-ask-title" aria-describedby={body ? 'ginfo-ask-body' : undefined}>
        <h2 className="ginfo-ask-title" id="ginfo-ask-title" dir="auto">
          {title}
        </h2>
        {body && (
          <p className="ginfo-ask-body" id="ginfo-ask-body" dir="auto">
            {body}
          </p>
        )}
        <div className="ginfo-ask-actions">
          <Button variant="secondary" onClick={() => setAsk(null)} disabled={busy} autoFocus>
            {t('common.cancel')}
          </Button>
          <Button className={danger ? 'btn-danger' : undefined} onClick={confirm} disabled={busy}>
            {action}
          </Button>
        </div>
      </div>
    );
  }

  // owner, then admins, then everyone else by name
  const members = [...detail.members].sort((a, b) => roleRank(b.role) - roleRank(a.role) || a.username.localeCompare(b.username));
  const roleWord = (role: Role): string | null =>
    role === 'owner' ? t('groups.role.owner') : role === 'moderator' ? t('groups.role.admin') : null;

  return (
    <div className="ginfo">
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
                {items.length > 0 && <MemberMenu name={m.username} items={items} disabled={busy} />}
              </li>
            );
          })}
        </ul>
      </section>

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
    </div>
  );
}

interface MenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  run: () => void;
}

/**
 * The ⋯ at the end of a member's row, and only what you may do about them.
 * Escape or a press outside closes it and gives the focus back to the ⋯.
 */
function MemberMenu({ name, items, disabled }: { name: string; items: MenuItem[]; disabled: boolean }): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLSpanElement>(null);

  // at the far edge of a phone, the open list is nudged back inside; at the foot of the dialog it opens upwards
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    keepInView(list);
    const box = list.closest('.modal-panel')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const r = list.getBoundingClientRect();
    if (r.bottom > box.bottom - 8 && r.top - r.height - 48 > box.top) list.classList.add('is-up');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // the menu's Escape, not the dialog's under it
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const label = t('groups.memberOptions', { name });
  return (
    <span className={`msg-menu ginfo-menu${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="msg-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon size={22} weight="bold" />
      </button>
      {open && (
        <span className="msg-menu-list" role="menu" ref={listRef} aria-label={label}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`user-menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                buttonRef.current?.focus();
                setOpen(false);
                item.run();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
