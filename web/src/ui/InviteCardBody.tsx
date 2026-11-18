import type { PlayGame } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { TicketBody, TicketGlyph, TicketStub } from './Ticket';

/**
 * The inside of a game invite's ticket (ui/Ticket.tsx): the game's mark on the stub and the words on the body. The
 * holder supplies the ticket itself (`ticketClass(type, 'row', 'invite-card')`). The "button" is a span, since in a
 * chat the whole card is one link and on the front page it sits in a picture.
 */
export function InviteCardBody({
  type,
  game,
  blurb,
  action,
}: {
  /** Which game, for the mark on the stub. */
  type: PlayGame;
  /** The game's name in the reader's language. */
  game: string;
  blurb: string;
  action: string;
}): React.JSX.Element {
  const t = useT();
  return (
    <>
      <TicketStub as="span" className="invite-stub">
        <TicketGlyph game={type} />
      </TicketStub>
      <TicketBody as="span" className="invite-main">
        <span className="invite-eyebrow">{t('games.invite.eyebrow')}</span>
        <span className="invite-title">{t('games.invite.join', { game })}</span>
        <span className="invite-blurb">{blurb}</span>
        <span className="invite-action">{action}</span>
      </TicketBody>
    </>
  );
}
