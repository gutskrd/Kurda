import { useCallback, useEffect, useRef, useState } from 'react';
// Soranî in a face made for Arabic script
import '@fontsource-variable/vazirmatn';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MAX_PLAYERS, storyTextDirection, type StoryGameView } from '@kurda/shared';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorState, Loading } from '../components/states';
import { ArrowIcon } from '../components/icons';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { STORIES_HUB } from './api';
import { GameLobby } from './GameLobby';
import { GameQuestion, GameReading, GameReveal } from './GamePlay';
import { GameResults } from './GameResults';
import { playerName } from './GameParts';
import { InviteFriendsButton, InvitedList } from '../play/LobbyInvites';
import { RematchPanel } from '../play/RematchPanel';
import { useQuietInvites } from '../play/quietInvites';
import { MODE_KEY } from './SetupSheet';
import { useGameStory, useStoryGame } from './useStoryGame';
import { useGameFinished } from '../feedback/gameFinished';

/**
 * A story game (/app/games/stories/play/:gameId): the lobby, the reading,
 * each question and its answer, and the results — one screen whose middle
 * changes with the game.
 *
 * One polite live region speaks for the whole game (a new question, an
 * answer locked, right or wrong, the results), so a screen reader hears each
 * change once and nothing ever takes the focus but a new question's heading.
 */
export function StoryGame(): React.JSX.Element {
  const { gameId = '' } = useParams();
  return <GamePage key={gameId} id={gameId} />;
}

function GamePage({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const game = useStoryGame(id);
  const [said, setSaid] = useState('');
  // a fresh string each time, so saying the same thing twice is heard twice
  const announce = useCallback((text: string) => setSaid((prev) => (prev === text ? `${text} ` : text)), []);

  const view = game.load.state === 'ready' ? game.load.view : null;
  const story = useGameStory(id, view !== null && view.status !== 'lobby');
  // the rating box hears of a game that ended while it was played here (not
  // one opened finished), and not of one this player left
  const me = view?.players.find((p) => p.isMe);
  useGameFinished('stories', view ? id : null, view?.status === 'finished', me?.gone ?? false);
  // while reading and answering, an invite to something else waits as a chip
  useQuietInvites(view !== null && (view.status === 'reading' || view.status === 'question' || view.status === 'reveal'));

  async function leave(): Promise<void> {
    await game.act('/leave');
    navigate(STORIES_HUB);
  }

  return (
    <div className="container game-page story-game">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
      {game.load.state === 'loading' && <Loading label={t('stories.game.loading')} />}
      {game.load.state === 'gone' && (
        <GameEnded title={t('stories.game.goneTitle')} body={t('stories.error.notFound')} />
      )}
      {game.load.state === 'error' && (
        <ErrorState
          message={describeError({ kind: game.load.status && game.load.status >= 500 ? 'server' : 'network', message: '' }, t)}
          onRetry={game.refresh}
        />
      )}
      {view && (
        <>
          <GameHead view={view} onLeave={leave} />
          {view.status === 'cancelled' ? (
            <GameEnded title={t('stories.game.cancelledTitle')} body={t('stories.game.cancelled')} />
          ) : view.status === 'lobby' ? (
            <GameLobby
              view={view}
              act={game.act}
              announce={announce}
              {...lobbyInvites(view)}
            />
          ) : view.status === 'reading' ? (
            <GameReading view={view} story={story} act={game.act} skew={game.skew} announce={announce} />
          ) : view.status === 'question' ? (
            <GameQuestion
              key={view.question?.index ?? -1}
              view={view}
              story={story}
              act={game.act}
              answer={game.answer}
              skew={game.skew}
              announce={announce}
            />
          ) : view.status === 'reveal' ? (
            <GameReveal key={view.reveal?.index ?? -1} view={view} story={story} act={game.act} announce={announce} />
          ) : (
            <GameResults view={view} story={story} announce={announce} again={<PlayAgain view={view} />} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The host's "Invite friends" and the list of friends asked (the play
 * layer's, as in every game's lobby). Only the host asks: the server takes
 * invites from the host alone.
 */
function lobbyInvites(view: StoryGameView): { invite?: React.ReactNode; invited?: React.ReactNode } {
  // the host themself, not whoever holds the controls while the host is away
  if (!view.players.some((p) => p.isMe && p.isHost)) return {};
  const room = Math.max(0, MAX_PLAYERS[view.mode] - view.players.filter((p) => !p.gone).length);
  return {
    invite: <InviteFriendsButton game="stories" lobbyId={view.id} room={room} />,
    invited: <InvitedList game="stories" lobbyId={view.id} room={room} />,
  };
}

/**
 * Playing again from the results: a duo's rematch both ask for, a group's
 * next round the host opens (play/RematchPanel). Solo has its own Try again.
 */
function PlayAgain({ view }: { view: StoryGameView }): React.JSX.Element | null {
  const t = useT();
  if (view.mode === 'solo') return null;
  const other = view.players.find((p) => !p.isMe);
  return (
    <RematchPanel
      game="stories"
      lobbyId={view.id}
      otherName={other ? playerName(other, t) : t('games.opponent')}
      isHost={view.isHost}
    />
  );
}

/** The game's title, what kind of game it is, and the way out. */
function GameHead({ view, onLeave }: { view: StoryGameView; onLeave: () => Promise<void> }): React.JSX.Element {
  const t = useT();
  const { lang, dir } = storyTextDirection(view.settings.dialect);
  const over = view.status === 'finished' || view.status === 'cancelled';
  // the host leaving a lobby closes it for everyone; anyone leaving a game under way cannot come back
  const hostOfLobby = view.status === 'lobby' && view.players.some((p) => p.isMe && p.isHost);
  return (
    <header className="sg-head">
      <div className="sg-head-text">
        <Link to={STORIES_HUB} className="back-link sg-back">
          <ArrowIcon size={16} />
          {t('stories.reader.back')}
        </Link>
        <h1 className="sg-title">
          <span lang={lang} dir={dir}>
            {view.settings.storyTitle}
          </span>
        </h1>
        <p className="sg-sub">{t(MODE_KEY[view.mode])}</p>
      </div>
      {!over && (
        <ConfirmButton
          className="btn btn-ghost btn-sm sg-leave"
          label={t('stories.game.leave')}
          confirmLabel={hostOfLobby ? t('stories.game.leaveCloses') : t('stories.game.leaveSure')}
          title={t('stories.game.leave')}
          onConfirm={onLeave}
        />
      )}
    </header>
  );
}

function GameEnded({ title, body }: { title: string; body: string }): React.JSX.Element {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="state sg-ended">
      <h2 ref={heading} tabIndex={-1}>
        {title}
      </h2>
      <p>{body}</p>
      <div className="sg-ended-actions">
        <Link to={STORIES_HUB} className="btn btn-secondary">
          {t('stories.backToStories')}
        </Link>
      </div>
    </div>
  );
}

