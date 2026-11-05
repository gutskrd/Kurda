import type { PlayGame } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { TicketBody, TicketGlyph, TicketStub } from './Ticket';

/**
 * What a game invite says, in the order the front page shows it: that it is an
 * invite, which game, what it is, and the way in.
 *
 * Only the inside: the two halves of the invite's ticket (ui/Ticket.tsx), the
 * game's mark on the stub and the words on the body. Whatever holds it is the
 * ticket itself, in the game's colour (`ticketClass(type, 'row', 'invite-card')`).
 * In a chat the whole card is one link (`GameInviteCard`), so the "button"
 * here is a span that looks like one — a real button inside a link would be
 * two controls fighting over one tap. On the front page the same body sits in
 * a picture, where nothing may be pressable at all.
 */
export function InviteCardBody({
  type,
  game,
  blurb,
  action,
}: {
  /** which game, for the mark on the stub */
  type: PlayGame;
  /** its name, as the reader's language says it */
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
