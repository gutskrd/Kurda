import { Link } from 'react-router-dom';
import { inviteBlurb, inviteLabel, invitePath, parseInvite, type GameInvite } from '../lib/gameInvites';

/**
 * Renders a chat message body: if it carries a MyKurda game-invite link, show a
 * visual invite card (with any surrounding text kept above it); otherwise render
 * the text as-is. Used by both direct and group chat bubbles.
 */
export function MessageBody({ body }: { body: string }): React.JSX.Element {
  const invite = parseInvite(body);
  if (!invite) return <>{body}</>;
  // keep any human text the sender wrote alongside the link
  const rest = body.replace(/\S*\/app\/games\/(?:wordle-battle|rhyme-match)\?id=[A-Za-z0-9-]+\S*/, '').trim();
  return (
    <>
      {rest && <p className="invite-lead">{rest}</p>}
      <GameInviteCard invite={invite} />
    </>
  );
}

/** A visually appealing invite box for a MyKurda online-game lobby. */
export function GameInviteCard({ invite }: { invite: GameInvite }): React.JSX.Element {
  return (
    <div className="invite-card">
      <div className="invite-card-art" aria-hidden>
        {invite.type === 'wordle-battle' ? '🟩' : '🎤'}
      </div>
      <div className="invite-card-body">
        <span className="invite-card-eyebrow">MyKurda game invite</span>
        <span className="invite-card-title">{inviteLabel(invite.type)}</span>
        <span className="invite-card-blurb">{inviteBlurb(invite.type)}</span>
      </div>
      <Link to={invitePath(invite)} className="btn btn-primary btn-sm invite-card-join">
        Join
      </Link>
    </div>
  );
}
