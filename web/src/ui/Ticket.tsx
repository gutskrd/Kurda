import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import type { PlayGame } from '@kurda/shared';
import { BookIcon, ChainIcon, HelpIcon, QuotesIcon, TicketIcon, TilesIcon, WaveformIcon } from '../components/icons';

/**
 * A ticket: the one shape every invitation on the website takes, so asking
 * somebody in feels like handing them something rather than sending a form.
 *
 * Two halves torn along a dashed perforation, with a notch bitten out of each
 * end of the tear: a stub, on the side a line of text starts from (the left
 * in English, the right in Soranî and Arabic), and the body with the words.
 * A lobby's join code is the same ticket stood on end, the stub on top
 * (play/CodeTicket.tsx); a game invite, a friend picked to be asked, someone
 * asked into a lobby and a friend request lie on their side. Being one
 * component, they cannot drift apart.
 *
 * The colour says what it is for: each game its own (Peyvok Battle the green
 * of a right letter, Rhyme Match the sun's gold, a story game the ink of the
 * page), a friendship the colour of a heart given, and a ticket that can no
 * longer be used a quiet grey. The shape is drawn on a layer of its own under
 * the content (`ticket-paper`), so a menu opened from inside a ticket is not
 * cut off by its notches. How it looks is in styles/ticket.css, and how it
 * moves (arriving, tearing, folding away, a stamp landing) in motion.css.
 */

/** What a ticket is for, which is its colour. */
export type TicketTone = PlayGame | 'friend' | 'muted';

/** A ticket lies on its side (stub at the start), or stands on end (stub on top). */
export type TicketLayout = 'row' | 'column';

/** The classes that make an element a ticket, for a root that is not a plain div (a link, a list item). */
export function ticketClass(tone: TicketTone, layout: TicketLayout = 'row', extra?: string | false | null): string {
  return `ticket ticket--${layout} ticket--${tone}${extra ? ` ${extra}` : ''}`;
}

type HalfProps = HTMLAttributes<HTMLElement> & {
  /** a span inside a link or a button, where a div may not go */
  as?: 'div' | 'span';
  /** a ticket waiting on somebody: a faint light crosses its paper now and then, while the ticket is `is-awake` */
  shine?: boolean;
  children?: ReactNode;
};

function Half({ kind, as: Tag = 'div', shine = false, className, children, ...rest }: HalfProps & { kind: 'stub' | 'body' }): React.JSX.Element {
  return (
    <Tag className={`ticket-${kind}${className ? ` ${className}` : ''}`} {...rest}>
      {/* the light runs inside the paper, so the paper's own shape is all it can cross */}
      <span className="ticket-paper" aria-hidden="true">
        {shine && <span className="ticket-shine" />}
      </span>
      {children}
    </Tag>
  );
}

/** The stub: the small half, on the start side, that tears off. */
export function TicketStub(props: HalfProps): React.JSX.Element {
  return <Half kind="stub" {...props} />;
}

/** The body: the half with the words. */
export function TicketBody(props: HalfProps): React.JSX.Element {
  return <Half kind="body" {...props} />;
}

/** A ticket in a div, for the common case: its stub, then its body. */
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

/** Each game's mark, for the stub of its ticket: Peyvok Battle's tiles, Rhyme Match's sound, a story's book. */
const GAME_GLYPH: Record<PlayGame, (p: { size?: number }) => React.JSX.Element> = {
  'wordle-battle': TilesIcon,
  'rhyme-match': WaveformIcon,
  stories: BookIcon,
  'last-letter': ChainIcon,
  bluff: QuotesIcon,
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

/**
 * A stamp across a ticket: "Joined", "Finished", "Friends". It is words, and
 * read as words; `fresh` lets it land with a small thump, for a stamp that has
 * just been put on (not one that was already there when the ticket was drawn).
 */
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
 * Whether a stamp has just been put on in front of the reader: true once
 * `stamp` is something other than what the ticket wore when it was first
 * drawn with its data (`ready`). A game that had already finished when a
 * conversation was opened is simply stamped; one that is joined while the
 * reader watches has its stamp land.
 */
export function useFreshStamp(stamp: string | null, ready = true): boolean {
  const [first, setFirst] = useState<string | null | undefined>(() => (ready ? stamp : undefined));
  useEffect(() => {
    if (ready && first === undefined) setFirst(stamp);
  }, [ready, first, stamp]);
  return first !== undefined && stamp !== null && stamp !== first;
}
