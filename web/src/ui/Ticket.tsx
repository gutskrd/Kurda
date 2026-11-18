import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { playGameHue, type PlayGame } from '@kurda/shared';
import { BookIcon, ChainIcon, HelpIcon, ImpostorIcon, TicketIcon, TilesIcon, WaveformIcon } from '../components/icons';

/**
 * The ticket every invitation on the website is drawn as: a stub on the starting side and a body, torn along a
 * perforation with notches at each end. A lobby's join code stands it on end (play/CodeTicket.tsx). Its tone gives
 * the colour: each game its stamp's hue, a friendship the heart colour, a spent ticket grey. The shape is a separate
 * layer under the content (`ticket-paper`), so a menu opened inside is not clipped by the notches. Styles are in
 * styles/ticket.css and motion in motion.css.
 */

/** What a ticket is for, which sets its colour. */
export type TicketTone = PlayGame | 'friend' | 'muted';

/** A ticket lies on its side (stub at the start) or stands on end (stub on top). */
type TicketLayout = 'row' | 'column';

/** The classes that make an element a ticket, for a root that is not a plain div, such as a link or list item. */
export function ticketClass(tone: TicketTone, layout: TicketLayout = 'row', extra?: string | false | null): string {
  return `ticket ticket--${layout} ${ticketToneClass(tone)}${extra ? ` ${extra}` : ''}`;
}

/**
 * The classes that give an element a ticket's colour without its shape, such as a notification's badge: the tone's,
 * and for a game its stamp's hue, read by `.ticket-hued` (ticket.css).
 */
export function ticketToneClass(tone: TicketTone): string {
  const hue = tone === 'friend' || tone === 'muted' ? null : playGameHue(tone);
  return hue ? `ticket--${tone} ticket-hued hue-${hue}` : `ticket--${tone}`;
}

type HalfProps = HTMLAttributes<HTMLElement> & {
  /** A span, for use inside a link or button where a div may not go. */
  as?: 'div' | 'span';
  /** A ticket waiting on somebody: a faint light crosses its paper now and then while it is `is-awake`. */
  shine?: boolean;
  children?: ReactNode;
};

function Half({ kind, as: Tag = 'div', shine = false, className, children, ...rest }: HalfProps & { kind: 'stub' | 'body' }): React.JSX.Element {
  return (
    <Tag className={`ticket-${kind}${className ? ` ${className}` : ''}`} {...rest}>
      {/* The light runs inside the paper, so it is clipped to the paper's shape. */}
      <span className="ticket-paper" aria-hidden="true">
        {shine && <span className="ticket-shine" />}
      </span>
      {children}
    </Tag>
  );
}

/** The stub: the small half on the start side that tears off. */
export function TicketStub(props: HalfProps): React.JSX.Element {
  return <Half kind="stub" {...props} />;
}

/** The body: the half with the words. */
export function TicketBody(props: HalfProps): React.JSX.Element {
  return <Half kind="body" {...props} />;
}

/** A ticket in a div, for the common case: its stub then its body. */
export function Ticket({
  tone,
  layout = 'row',
  stub,
  stubClassName,
  bodyClassName,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  tone: TicketTone;
  layout?: TicketLayout;
  stub: ReactNode;
  stubClassName?: string;
  bodyClassName?: string;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className={ticketClass(tone, layout, className)} {...rest}>
      <TicketStub className={stubClassName}>{stub}</TicketStub>
      <TicketBody className={bodyClassName}>{children}</TicketBody>
    </div>
  );
}

/** Each game's mark for the stub of its ticket. */
const GAME_GLYPH: Record<PlayGame, (p: { size?: number }) => React.JSX.Element> = {
  'wordle-battle': TilesIcon,
  'rhyme-match': WaveformIcon,
  stories: BookIcon,
  'last-letter': ChainIcon,
  impostor: ImpostorIcon,
  'who-am-i': HelpIcon,
};

/** The mark on a game ticket's stub; a ticket glyph for anything that is not a game. */
export function TicketGlyph({ game, size = 22 }: { game?: PlayGame | null; size?: number }): React.JSX.Element {
  const Glyph = game ? GAME_GLYPH[game] : TicketIcon;
  return (
    <span className="ticket-glyph" aria-hidden="true">
      <Glyph size={size} />
    </span>
  );
}

/** A stamp across a ticket, such as "Joined" or "Friends", read as text. `fresh` makes a newly added stamp land. */
export function TicketStamp({
  tone = 'ink',
  fresh = false,
  className,
  children,
}: {
  tone?: 'ink' | 'success' | 'muted';
  fresh?: boolean;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return <span className={`ticket-stamp is-${tone}${fresh ? ' is-fresh' : ''}${className ? ` ${className}` : ''}`}>{children}</span>;
}

/**
 * Whether a stamp was added while the reader watched: true once `stamp` differs from what the ticket wore when first
 * drawn with its data (`ready`).
 */
export function useFreshStamp(stamp: string | null, ready = true): boolean {
  const [first, setFirst] = useState<string | null | undefined>(() => (ready ? stamp : undefined));
  useEffect(() => {
    if (ready && first === undefined) setFirst(stamp);
  }, [ready, first, stamp]);
  return first !== undefined && stamp !== null && stamp !== first;
}
