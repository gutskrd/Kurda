import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatJoinCode, isPlayGame, parseJoinLink, PLAY_GAME_EMBLEM, type JoinedByCode } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { GameArt } from '../games/GameArt';
import { stageTone } from '../games/GameHead';
import { useT } from '../i18n/I18nProvider';
import { haptic } from '../lib/haptics';
import type { PublicProfile } from '../lib/types';
import { TicketArt } from './JoinCode';
import { joinCodeError } from './joinCode';
import { GAME_NAME_KEY, lobbyPath } from './playApi';
import '../games/game-stage.css';
import './invite-page.css';

/**
 * Where an invite link lands (/join/<game>/<CODE>, shared/src/join-link.ts), with or without an account: the game's
 * picture and name, who is waiting when the link says, the code, and one button. Signed in, that is Join, the same as
 * typing the code; otherwise sign up or in and return here. A friends-only game still takes only the host's friends, so
 * a refusal offers a friend request to the host when the link names them. Only the game, a valid code and a person the
 * server confirms are read from the address (`parseJoinLink`).
 */


type Phase = 'ready' | 'joining' | 'joined' | 'refused';

export function InvitePage(): React.JSX.Element {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { status, client, refreshUser } = useAuth();
  const link = parseJoinLink(location.pathname, location.search);
  const [host, setHost] = useState<PublicProfile | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [asked, setAsked] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const mounted = useRef(true);
  // Set on every mount, or a page mounted twice in a row would stay marked gone and drop the join's answer.
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);

  // Who is asking, confirmed by the server, so a name is never taken from an address.
  const from = link?.from ?? null;
  useEffect(() => {
    if (!from || status === 'restoring') return;
    let live = true;
    void client.get<PublicProfile>(`/users/${from}`).then((res) => {
      if (live && res.ok) setHost(res.data);
    });
    return () => void (live = false);
  }, [client, from, status]);

  if (!link) {
    return (
      <div className="container container-narrow invite-page">
        <div className="gate">
          <TicketArt className="invite-ticket" />
          <h1 className="page-title">{t('invite.broken.title')}</h1>
          <p className="page-sub">{t('invite.broken.body')}</p>
          <Link to="/app/games" className="btn btn-primary">
            {t('invite.broken.games')}
          </Link>
        </div>
      </div>
    );
  }

  // The game's stamp; a story game has none and wears the ticket.
  const emblem = PLAY_GAME_EMBLEM[link.game] ?? null;
  const name = host ? host.displayName || host.username : null;
  const back = location.pathname + location.search;
  const signedIn = status === 'signedIn';
  const own = host?.friendStatus === 'self';

  async function join(): Promise<void> {
    if (phase === 'joining' || phase === 'joined' || !link) return;
    setPhase('joining');
    setMessage(null);
    const res = await client.post<JoinedByCode>('/play/join', { code: link.code });
    if (!mounted.current) return;
    if (res.ok && isPlayGame(res.data.game)) {
      setPhase('joined');
      haptic('correct');
      navigate(lobbyPath(res.data.game, res.data.lobbyId), { replace: true });
      return;
    }
    // An account without a birth month is asked now, as for any game.
    if (!res.ok && res.error.code === 'BIRTH_DATE_REQUIRED') void refreshUser();
    setPhase('refused');
    setMessage(res.ok ? t('play.join.notFound') : joinCodeError(res.error, t));
    haptic('wrong');
  }

  async function befriend(): Promise<void> {
    if (!host || asked === 'sending') return;
    setAsked('sending');
    const res = await client.post('/friends/requests', { userId: host.userId });
    if (!mounted.current) return;
    setAsked(res.ok ? 'sent' : 'failed');
    if (res.ok) setHost({ ...host, friendStatus: 'pending_out' });
  }

  // A friends game takes the host's friends; someone who is not one is shown how to become one.
  const stranger = signedIn && host !== null && (host.friendStatus === 'none' || host.friendStatus === 'pending_in');
  const waiting = signedIn && host?.friendStatus === 'pending_out';
    // The server says "no such game" both for a code nobody uses and a game this person may not join; beside the friend
    // request that reads as a broken code, so the way forward is said instead.
  const unexplained = phase === 'refused' && message === t('play.join.notFound');
  const befriending = unexplained && name !== null && (stranger || waiting);
  const chars = [...link.code];

  return (
    <div className="container container-narrow invite-page gs" style={emblem ? stageTone(emblem) : undefined}>
      <div className="gs-hero invite-hero">
        {emblem ? <GameArt game={emblem} size={168} moving /> : <TicketArt className="invite-ticket" />}
        <p className="gs-hero-meta">{t('invite.kicker')}</p>
        <h1 className="gs-hero-title">{t(GAME_NAME_KEY[link.game])}</h1>
        <p className="gs-hero-line">{name && !own ? t('invite.from', { name }) : t('invite.generic')}</p>
        <p className="invite-code" dir="ltr" aria-label={t('invite.code', { code: chars.join(' ') })}>
          {chars.map((ch, i) => (
            <Fragment key={i}>
              {i === chars.length / 2 && <span className="invite-code-gap" aria-hidden="true" />}
              <span className="invite-code-tile" aria-hidden="true">
                {ch}
              </span>
            </Fragment>
          ))}
        </p>
      </div>

      <div className="invite-actions" aria-live="polite">
        {signedIn ? (
          <>
            <Button size="lg" className="gs-go" onClick={() => void join()} disabled={phase === 'joining' || phase === 'joined'} aria-busy={phase === 'joining'}>
              {phase === 'joining' || phase === 'joined' ? t('invite.joining') : t('invite.join')}
            </Button>
            {message && !befriending && (
              <p className="invite-note is-refused" role="status">
                {message}
              </p>
            )}
            {befriending && stranger && (
              <div className="invite-friend" role="status">
                <p className="invite-note">{t('invite.friends.needed', { name })}</p>
                <Button variant="secondary" onClick={() => void befriend()} disabled={asked === 'sending'}>
                  {t('invite.friends.ask', { name })}
                </Button>
                {asked === 'failed' && <p className="invite-note is-refused">{t('invite.friends.failed')}</p>}
              </div>
            )}
            {befriending && waiting && (
              <p className="invite-note" role="status">
                {t('invite.friends.sent', { name })}
              </p>
            )}
          </>
        ) : status === 'restoring' ? null : (
          <>
            <Link to="/register" state={{ from: back }} className="btn btn-primary btn-lg gs-go">
              {t('invite.create')}
            </Link>
            <Link to="/login" state={{ from: back }} className="btn btn-secondary invite-login">
              {t('invite.login')}
            </Link>
            <p className="invite-note">{t('invite.free')}</p>
          </>
        )}
      </div>

      <p className="invite-fallback">{t('invite.fallback', { code: formatJoinCode(link.code) })}</p>
    </div>
  );
}
