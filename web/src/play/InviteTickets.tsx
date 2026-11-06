import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { PlayGame } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { UsersIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Ticket } from '../ui/Ticket';

/**
 * Asking friends into a game, as handing each of them a ticket (the invite
 * sheet, play/InviteSheet.tsx).
 *
 * Each friend picked is written out a ticket of their own in the game's
 * colour — their face on the stub, their name on the body — which slides up
 * into a small fanned hand above Send. Pressing Send tears the tickets off
 * one after another and sends each flying to its friend in the list above,
 * with a burst of specks where it lands. Once the server has them, the
 * sheet says so for a moment over the fanned tickets ("Tickets sent", and
 * who to) before it closes or opens the lobby. A refusal brings the tickets
 * back, the hand shakes once, and the reason shows as before.
 *
 * A game posted in a group is one ticket, pinned to the group.
 *
 * The hand is a picture of the ticked boxes, which a screen reader already
 * has, so it is hidden from one; the moment after sending is said aloud.
 * Under Reduce Motion nothing is written out, flies, bursts or shakes: the
 * tickets are simply there, and then the moment is.
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
/** How long the moment after sending stays before the sheet closes or the lobby opens. */
export const SENT_MS = 1400;

/** How long a hand of `count` tickets takes to fly, the last one included. */
export function flightMs(count: number): number {
  return count > 0 ? FLY_MS + (count - 1) * FLY_STAGGER_MS : 0;
}

/** A ticket's place in a fanned hand of `count`: tilted a little more the further it is from the middle. */
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
 * The hand of tickets above Send: one per friend picked, in the order they
 * were picked, or the group's one. `flying` sends them off to the friends'
 * rows in the list (found by `data-friend`, inside `scope`); `back` counts
 * refusals, and each brings them back once more.
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
  /** a game posted in a group: its name, for the one ticket pinned to it */
  group?: string | null;
  flying: boolean;
  back: number;
  /** where to look for the friends' rows the tickets fly to */
  scope: React.RefObject<HTMLElement | null>;
}): React.JSX.Element | null {
  const tray = useRef<HTMLUListElement>(null);
  // the tickets that were in the hand when it was refused come back; one picked after that is simply written out
  const hand = people.map((p) => p.id).join(' ');
  const refusal = useRef<{ n: number; hand: string; ids: ReadonlySet<string> }>({ n: 0, hand: '', ids: new Set() });
  if (back !== refusal.current.n) refusal.current = { n: back, hand, ids: new Set(people.map((p) => p.id)) };
  const returning = !flying && back > 0 ? refusal.current.ids : new Set<string>();
  // the hand shakes once, as it was when it was refused
  const shaken = returning.size > 0 && refusal.current.hand === hand;

  // Where each ticket flies: to its friend's face in the list, while that is
  // in sight; otherwise straight up, out of the hand.
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
            {flying && <span className={`ticket-burst is-on ticket--${game}`} />}
          </li>
        ))
      )}
    </ul>
  );
}

/**
 * The moment after sending: the tickets fanned out, and who they went to —
 * "Ticket sent to Rojda", or "Tickets sent" and the names — or the group's
 * ticket pinned, "Posted in Hevalên Kurmancî". Said aloud as it appears.
 */
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
      <div className={`admit-fan ticket--${game}`} aria-hidden="true">
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
