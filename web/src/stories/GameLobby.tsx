import { useEffect, useRef, useState } from 'react';
import { MIN_PLAYERS_TO_START, MAX_PLAYERS, type StoryGameView } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { PlayerReport } from '../reports/PlayerReport';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import { HostIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { SetupSheet } from './SetupSheet';
import { storyError } from './api';
import { ExtraTimeToggle, FromMemoryNote, SettingsLine, playerName, type Act } from './GameParts';
import { rememberedExtraTime } from './prefs';
import { LobbyRated } from '../ranks/rated';
import { CodeTicket } from '../play/CodeTicket';

/**
 * The lobby of a duo or group game: the code ticket, who is in, and for the host the settings, Remove and Start; everyone
 * else waits and can leave. `invite` and `invited` are the play layer's button and list, as in every game's lobby.
 */
export function GameLobby({
  view,
  act,
  invite,
  invited,
}: {
  view: StoryGameView;
  act: Act;
  invite?: React.ReactNode;
  invited?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const present = view.players.filter((p) => !p.gone);
  const need = MIN_PLAYERS_TO_START[view.mode];
  const canStart = view.activeCount >= need;

  // Joining through an invite or a typed code skips this game's own join and its settings, so a remembered Extra time
  // is applied here once, before the first timed question; turning it off in the lobby forgets it.
  const extraBrought = useRef(false);
  useEffect(() => {
    if (extraBrought.current) return;
    extraBrought.current = true;
    if (rememberedExtraTime() && !view.extraTime) void act('/extra-time', { on: true });
  }, []);

  async function start(): Promise<void> {
    setBusy(true);
    const res = await act('/start');
    setBusy(false);
    if (!res.ok) setNotice(storyError(res.error, t));
  }

  return (
    <section className="sg-lobby" aria-labelledby="sg-lobby-title">
      <h2 id="sg-lobby-title" className="sr-only">
        {t('stories.game.lobby')}
      </h2>

      <CodeTicket game="stories" code={view.code} access={view.settings.access} invite={invite} />

      <FromMemoryNote view={view} />

      {/* Rated or Friendly: seen before joining, changed by the host here. */}
      {view.mode !== 'solo' && view.rated && (
        <LobbyRated
          game="stories"
          lobbyId={view.id}
          state={view.rated}
          isHost={view.isHost}
          member={view.players.some((p) => p.isMe)}
          playerCount={present.length}
          seatName={(seat) => {
            const p = view.players.find((x) => x.seat === seat);
            return p ? playerName(p, t) : t('stories.game.playerN', { seat });
          }}
        />
      )}

      <div className="sg-panel">
        <div className="sg-panel-head">
          <h3 className="sg-panel-title">{t('stories.game.settings')}</h3>
          {view.isHost && (
            <button type="button" className="link-btn sg-panel-action" onClick={() => setSettings(true)}>
              {t('stories.game.changeSettings')}
            </button>
          )}
        </div>
        <SettingsLine view={view} />
      </div>

      <div className="sg-panel">
        <div className="sg-panel-head">
          <h3 className="sg-panel-title" id="sg-players-title">
            {t('stories.game.players', { count: present.length, max: MAX_PLAYERS[view.mode] })}
          </h3>
        </div>
        <ul className="sg-players" aria-labelledby="sg-players-title">
          {present.map((p) => (
            <li key={p.seat} className="sg-player">
              <Avatar url={p.avatarUrl} glyphSize={18} />
              <span className="sg-player-name">
                {playerName(p, t)}
                {p.isHost && (
                  <span className="sg-host">
                    <HostIcon size={12} />
                    {t('stories.game.host')}
                  </span>
                )}
                {p.away && <span className="sg-away">{t('stories.game.away')}</span>}
              </span>
              {/* Anyone else can be reported by seat (reports/PlayerReport). */}
              {!p.isMe && <PlayerReport game="stories" gameId={view.id} seat={p.seat} name={playerName(p, t)} />}
              {view.isHost && !p.isMe && (
                <ConfirmButton
                  className="btn btn-ghost btn-sm sg-remove"
                  label={t('stories.game.remove')}
                  title={t('stories.game.removeWho', { name: playerName(p, t) })}
                  onConfirm={async () => {
                    const res = await act('/remove', { seat: p.seat });
                    if (!res.ok) setNotice(storyError(res.error, t));
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Who is in first, then who was asked. */}
      {invited}

      <ExtraTimeToggle view={view} act={act} />

      <div className="sg-actions">
        {view.isHost ? (
          <>
            <Button size="lg" onClick={() => void start()} disabled={busy || !canStart}>
              {busy ? t('games.starting') : t('stories.game.start')}
            </Button>
            {!canStart && (
              <p className="muted sg-wait">
                {/* Enough people, but someone has stepped away from the page. */}
                {present.length >= need ? t('stories.game.waitAway') : t('stories.game.needMore')}
              </p>
            )}
          </>
        ) : (
          <p className="sg-wait">{t('games.waitingForHost')}</p>
        )}
        {notice && (
          <p className="sg-notice" role="status">
            {notice}
          </p>
        )}
      </div>

      {settings && (
        <SetupSheet
          open
          onClose={() => setSettings(false)}
          dialect={view.settings.dialect}
          initialMode={view.mode}
          lobby={view}
        />
      )}
    </section>
  );
}
