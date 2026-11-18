import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { PlayGame } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { UsersIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Ticket, ticketToneClass } from '../ui/Ticket';

/**
 * Asking friends into a game as handing out tickets (play/InviteSheet.tsx): each friend picked gets a ticket in the
 * game's colour in a fanned hand above Send. Send tears them off and flies each to its friend's row; once the server
 * has them, "Tickets sent" shows briefly before the sheet closes or the lobby opens. A refusal brings them back with a
 * shake. A group game is one ticket pinned to the group. The hand is hidden from screen readers, which have the
 * checkboxes; the moment after sending is announced. Reduced motion skips the movement.
 */

/** Someone a ticket is written out to. */
export interface Admit {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** How long each ticket takes to reach its friend, and how far apart they leave. */
export const FLY_MS = 560;
export const FLY_STAGGER_MS = 80;
/** How long "sent" shows before the sheet closes or the lobby opens. */
export const SENT_MS = 1400;

/** How long a hand of `count` tickets takes to fly, the last included. */
export function flightMs(count: number): number {
  return count > 0 ? FLY_MS + (count - 1) * FLY_STAGGER_MS : 0;
}

/** A ticket's place in a fanned hand: tilted more the further from the middle. */
function fanStyle(i: number, count: number, extra: Record<string, string | number> = {}): CSSProperties {
  return { '--i': i, '--n': count, '--tilt': `${(i - (count - 1) / 2) * 2}deg`, ...extra } as CSSProperties;
}

/** One friend's ticket: their face on the stub, their name on the body. */
function AdmitTicket({ game, person, className }: { game: PlayGame; person: Admit; className?: string }): React.JSX.Element {
  return (
    <Ticket
      tone={game}
      stub={<Avatar url={person.avatarUrl} glyphSize={14} />}
      className={`admit${className ? ` ${className}` : ''}`}
      stubClassName="admit-stub"
      bodyClassName="admit-main"
    >
      <span className="admit-name">{person.name}</span>
    </Ticket>
  );
}

/** The group's one ticket, pinned to it. */
function GroupTicket({ game, name, pinned }: { game: PlayGame; name: string; pinned: boolean }): React.JSX.Element {
  return (
    <Ticket tone={game} stub={<UsersIcon size={18} />} className="admit is-group" stubClassName="admit-stub" bodyClassName="admit-main">
      <span className="admit-name">{name}</span>
      {pinned && <span className="admit-pin" />}
    </Ticket>
  );
}

/**
 * The hand of tickets above Send, in picking order, or the group's one. `flying` sends them to the friends' rows
 * (`data-friend` inside `scope`); `back` counts refusals, each bringing them back once more.
 */
export function AdmitTray({
  game,
  people,
  group,
  flying,
  back,
  scope,
}: {
  game: PlayGame;
  people: readonly Admit[];
  /** A game posted in a group: its name, for the one pinned ticket. */
  group?: string | null;
  flying: boolean;
  back: number;
  /** Where to find the friends' rows the tickets fly to. */
  scope: React.RefObject<HTMLElement | null>;
}): React.JSX.Element | null {
  const tray = useRef<HTMLUListElement>(null);
  // Tickets in the hand when refused come back; one picked after that is simply written out.
  const hand = people.map((p) => p.id).join(' ');
  const refusal = useRef<{ n: number; hand: string; ids: ReadonlySet<string> }>({ n: 0, hand: '', ids: new Set() });
  if (back !== refusal.current.n) refusal.current = { n: back, hand, ids: new Set(people.map((p) => p.id)) };
  const returning = !flying && back > 0 ? refusal.current.ids : new Set<string>();
  // The hand shakes once, as it was when refused.
  const shaken = returning.size > 0 && refusal.current.hand === hand;

  // Each ticket flies to its friend's face in the list while visible, otherwise straight up.
  useLayoutEffect(() => {
    if (!flying || !tray.current) return;
    const list = scope.current?.querySelector('.invite-list')?.getBoundingClientRect();
    for (const slot of tray.current.querySelectorAll<HTMLElement>('.admit-slot')) {
      const from = slot.getBoundingClientRect();
      const face = scope.current?.querySelector(`[data-friend="${slot.dataset.id}"] .friend-avatar`)?.getBoundingClientRect();
      const seen = face && list && face.top >= list.top - 4 && face.bottom <= list.bottom + 4;
      const dx = seen ? face.left + face.width / 2 - (from.left + from.width / 2) : 0;
      const dy = seen ? face.top + face.height / 2 - (from.top + from.height / 2) : -Math.max(120, from.height * 3);
      slot.style.setProperty('--fly-x', `${Math.round(dx)}px`);
      slot.style.setProperty('--fly-y', `${Math.round(dy)}px`);
    }
  }, [flying, scope]);

  if (!group && people.length === 0) return null;
  return (
    <ul ref={tray} className={`admit-tray${shaken ? ' is-refused' : ''}`} aria-hidden="true">
      {group ? (
        <li className="admit-slot" style={fanStyle(0, 1)}>
          <GroupTicket game={game} name={group} pinned={false} />
        </li>
      ) : (
        people.map((p, i) => (
          <li key={p.id} className="admit-slot" data-id={p.id} style={fanStyle(i, people.length)}>
            <AdmitTicket game={game} person={p} className={flying ? 'is-flying' : returning.has(p.id) ? 'is-back' : undefined} />
            {flying && <span className={`ticket-burst is-on ${ticketToneClass(game)}`} />}
          </li>
        ))
      )}
    </ul>
  );
}

/** The moment after sending: the fanned tickets and who they went to, or the group's pinned ticket; announced as it appears. */
export function TicketsSent({ game, people, group }: { game: PlayGame; people: readonly Admit[]; group?: string | null }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(people.map((p) => p.name));
  const title = group
    ? t('play.ticket.posted', { name: group })
    : people.length === 1
      ? t('play.ticket.sentOne', { name: people[0]!.name })
      : t('play.ticket.sentMany');
  return (
    <div className="admit-sent" role="status">
      <div className={`admit-fan ${ticketToneClass(game)}`} aria-hidden="true">
        {group ? (
          <div className="admit-dealt" style={fanStyle(0, 1)}>
            <GroupTicket game={game} name={group} pinned />
          </div>
        ) : (
          people.map((p, i) => (
            <div key={p.id} className="admit-dealt" style={fanStyle(i, people.length, { '--tilt': `${(i - (people.length - 1) / 2) * 6}deg`, '--x': `${(i - (people.length - 1) / 2) * 30}px` })}>
              <AdmitTicket game={game} person={p} />
            </div>
          ))
        )}
        <span className="ticket-burst is-on" />
      </div>
      <p className="admit-sent-title">{title}</p>
      {!group && people.length > 1 && <p className="admit-sent-names">{names}</p>}
    </div>
  );
}
