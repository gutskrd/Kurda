import { Link } from 'react-router-dom';
import {
  INVITE_BLURB_KEY,
  INVITE_NAME_KEY,
  hasRetiredInvite,
  inviteLinkPattern,
  invitePath,
  parseInvite,
  withoutRetiredInvites,
  type GameInvite,
  type GameInviteType,
} from '../lib/gameInvites';
import { InviteCardBody } from '../ui/InviteCardBody';
import { ticketClass } from '../ui/Ticket';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * A chat message body: an invite link becomes an invite card under any text sent with it, and anything else is shown as
 * written. The text runs in its own direction (`dir="auto"`) whatever the page's. An invite to a retired game keeps its
 * words and shows a note in place of the link.
 */
export function MessageBody({ body }: { body: string }): React.JSX.Element {
  const invite = parseInvite(body);
  if (!invite && hasRetiredInvite(body)) {
    const rest = withoutRetiredInvites(body).replace(/\s+/g, ' ').trim();
    return (
      <>
        {rest && (
          <p className="invite-lead" dir="auto">
            {rest}
          </p>
        )}
        <RetiredGameNote />
      </>
    );
  }
  if (!invite) return <span dir="auto">{body}</span>;
  // Keep any text the sender wrote alongside the link.
  const rest = body.replace(inviteLinkPattern(), ' ').replace(/\s+/g, ' ').trim();
  return (
    <>
      {rest && (
        <p className="invite-lead" dir="auto">
          {rest}
        </p>
      )}
      <GameInviteCard invite={invite} />
    </>
  );
}

/** The button the front page draws on the invite, worded as the lobby's own. */
const ACTION_KEY: Record<GameInviteType, MessageKey> = {
  'wordle-battle': 'games.battle.join',
  'rhyme-match': 'games.rhymeMatch.join',
  stories: 'games.stories.join',
  'last-letter': 'games.lastLetter.join',
  impostor: 'games.impostor.join',
  'who-am-i': 'games.whoAmI.join',
};

/**
 * A lobby invite as a ticket in its game's colour (ui/Ticket.tsx), drawn by the same `InviteCardBody` as the front page's.
 * The whole card is the link, so "Join" is a span styled as a button rather than a second control. It has its own surface
 * because your own bubble is white in this theme.
 */
export function GameInviteCard({ invite }: { invite: GameInvite }): React.JSX.Element {
  const t = useT();
  const label = t(INVITE_NAME_KEY[invite.type]);
  return (
    <Link to={invitePath(invite)} className={ticketClass(invite.type, 'row', 'invite-card')} aria-label={t('games.invite.join', { game: label })}>
      <InviteCardBody type={invite.type} game={label} blurb={t(INVITE_BLURB_KEY[invite.type])} action={t(ACTION_KEY[invite.type])} />
    </Link>
  );
}

/** One quiet line where an invite to a retired game was, since there is nothing to join. */
export function RetiredGameNote(): React.JSX.Element {
  const t = useT();
  return <span className="invite-retired">{t('games.retired')}</span>;
}
