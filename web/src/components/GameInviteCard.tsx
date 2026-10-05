import { Link } from 'react-router-dom';
import {
  INVITE_BLURB_KEY,
  INVITE_NAME_KEY,
  inviteLinkPattern,
  invitePath,
  parseInvite,
  type GameInvite,
  type GameInviteType,
} from '../lib/gameInvites';
import { InviteCardBody } from '../ui/InviteCardBody';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * Renders a chat message body: if it carries a Hevalo game-invite link, show a
 * visual invite card (with any surrounding text kept above it); otherwise render
 * the text as-is. Used by both direct and group chat bubbles.
 */
export function MessageBody({ body }: { body: string }): React.JSX.Element {
  const invite = parseInvite(body);
  if (!invite) return <>{body}</>;
  // keep any human text the sender wrote alongside the link
  const rest = body.replace(inviteLinkPattern(), ' ').replace(/\s+/g, ' ').trim();
  return (
    <>
      {rest && <p className="invite-lead">{rest}</p>}
      <GameInviteCard invite={invite} />
    </>
  );
}

/** The button the front page draws on the invite, worded as the lobby's own. */
const ACTION_KEY: Record<GameInviteType, MessageKey> = {
  'wordle-battle': 'games.battle.join',
  'rhyme-match': 'games.rhymeMatch.join',
};

/**
 * A rich preview for a game lobby — the card the front page shows arriving in a
 * chat, drawn by the same `InviteCardBody`, so the two cannot disagree.
 *
 * The whole card is the link, so the tap target is the card rather than a small
 * button — which matters most on a phone, where this sits inside a bubble. The
 * "Join" inside it is a span that looks like a button; a real one inside a link
 * would be two controls fighting over one tap. It carries its OWN surface rather
 * than inheriting the bubble's, because your own bubble is white in this theme
 * and a translucent card disappeared into it.
 */
export function GameInviteCard({ invite }: { invite: GameInvite }): React.JSX.Element {
  const t = useT();
  const label = t(INVITE_NAME_KEY[invite.type]);
  return (
    <Link to={invitePath(invite)} className="invite-card" aria-label={t('games.invite.join', { game: label })}>
      <InviteCardBody game={label} blurb={t(INVITE_BLURB_KEY[invite.type])} action={t(ACTION_KEY[invite.type])} />
    </Link>
  );
}
