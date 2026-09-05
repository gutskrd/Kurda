import { Link } from 'react-router-dom';
import {
  inviteBlurb,
  inviteGlyph,
  inviteLabel,
  inviteLinkPattern,
  invitePath,
  parseInvite,
  type GameInvite,
} from '../lib/gameInvites';

/**
 * Renders a chat message body: if it carries a MyKurda game-invite link, show a
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

/**
 * A rich preview for a game lobby, in the spirit of a link embed.
 *
 * The whole card is the link, so the tap target is the card rather than a small
 * button — which matters most on a phone, where this sits inside a bubble.
 *
 * It carries its OWN dark surface instead of inheriting the bubble's. Your own
 * bubble is `--primary`, which in this theme is white: a translucent card and a
 * `--primary` border and eyebrow all disappeared into it, so an invite you sent
 * was barely visible. Now it looks the same whichever side sent it.
 */
export function GameInviteCard({ invite }: { invite: GameInvite }): React.JSX.Element {
  const label = inviteLabel(invite.type);
  return (
    <Link
      to={invitePath(invite)}
      className={`invite-card invite-${invite.type}`}
      aria-label={`Join a ${label} game`}
    >
      <span className="invite-card-head">
        <span className="invite-card-art" aria-hidden>
          {inviteGlyph(invite.type)}
        </span>
        <span className="invite-card-heading">
          <span className="invite-card-eyebrow">Game invite</span>
          <span className="invite-card-title">{label}</span>
        </span>
      </span>
      <span className="invite-card-blurb">{inviteBlurb(invite.type)}</span>
      <span className="invite-card-join">
        Join game
        <span aria-hidden>→</span>
      </span>
    </Link>
  );
}
