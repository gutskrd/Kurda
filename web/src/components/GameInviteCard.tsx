import { Link } from 'react-router-dom';
import {
  inviteBlurb,
  inviteLabel,
  inviteLinkPattern,
  invitePath,
  parseInvite,
  type GameInvite,
  type GameInviteType,
} from '../lib/gameInvites';
import { ChevronIcon, TilesIcon, WaveformIcon } from './icons';

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

/** A line drawing per game — recognisable at 22px, and never an emoji. */
const ICONS: Record<GameInviteType, (props: { size?: number }) => React.JSX.Element> = {
  'wordle-battle': TilesIcon,
  'rhyme-match': WaveformIcon,
};

/**
 * A rich preview for a game lobby.
 *
 * Built as one row — mark, label, chevron — the way a system list row is. The
 * hierarchy is carried by weight and opacity rather than by colour: an
 * accent-tinted eyebrow, a gradient tile and a filled action bar were three
 * things shouting at once for a card that says one thing.
 *
 * The whole card is the link, so the tap target is the card rather than a small
 * button — which matters most on a phone, where this sits inside a bubble. It
 * carries its OWN surface rather than inheriting the bubble's, because your own
 * bubble is white in this theme and a translucent card disappeared into it.
 */
export function GameInviteCard({ invite }: { invite: GameInvite }): React.JSX.Element {
  const label = inviteLabel(invite.type);
  const Icon = ICONS[invite.type];
  return (
    <Link to={invitePath(invite)} className="invite-card" aria-label={`Join a ${label} game`}>
      <span className="invite-card-art" aria-hidden>
        <Icon size={21} />
      </span>
      <span className="invite-card-text">
        <span className="invite-card-eyebrow">Game invite</span>
        <span className="invite-card-title">{label}</span>
        <span className="invite-card-blurb">{inviteBlurb(invite.type)}</span>
      </span>
      <ChevronIcon size={17} className="invite-card-chevron" />
    </Link>
  );
}
