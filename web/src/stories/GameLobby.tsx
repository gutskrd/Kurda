import { useEffect, useRef, useState } from 'react';
import { MIN_PLAYERS_TO_START, MAX_PLAYERS, formatJoinCode, type StoryGameView } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { PlayerReport } from '../reports/PlayerReport';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import { CopyIcon, HostIcon, ShareIcon } from '../components/icons';
import { buildInviteUrl } from '../lib/gameInvites';
import { useT } from '../i18n/I18nProvider';
import { SetupSheet } from './SetupSheet';
import { storyError } from './api';
import { ExtraTimeToggle, FromMemoryNote, SettingsLine, playerName, type Act, type Announce } from './GameParts';
import { rememberedExtraTime } from './prefs';

/**
 * The lobby of a duo or group game: the code and the ways to share it,
 * who is in, and — for the host — the settings, removing a player and Start
 * (contract §A1). Everyone else waits for the host and can leave.
 *
 * `invite` is the "Invite friends" button and `invited` the list of friends
 * asked, both from the play layer, so every game's lobby asks friends the
 * same way.
 */
export function GameLobby({
  view,
  act,
  announce,
  invite,
  invited,
}: {
  view: StoryGameView;
  act: Act;
  announce: Announce;
  invite?: React.ReactNode;
  invited?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = buildInviteUrl('stories', view.id);
  const code = view.code;
  const present = view.players.filter((p) => !p.gone);
  const need = MIN_PLAYERS_TO_START[view.mode];
  const canStart = view.activeCount >= need;

  // An invite's Join gets you in without your settings (it is the play layer's
  // accept, not this game's join), so a remembered Extra time is put on here,
  // once, before the first timed question. Turning it off in the lobby
  // forgets it, so this never undoes a choice made here.
  const extraBrought = useRef(false);
  useEffect(() => {
    if (extraBrought.current) return;
    extraBrought.current = true;
    if (rememberedExtraTime() && !view.extraTime) void act('/extra-time', { on: true });
  }, []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t('games.copied'));
      announce(t('games.copied'));
    } catch {
      setNotice(t('games.copyFailed'));
    }
  }

  async function share(): Promise<void> {
    try {
      await navigator.share({
        title: t('games.stories.name'),
        // a link and the code: either one gets a friend in
        text: t('stories.game.shareText', { code: code ? formatJoinCode(code) : '' }),
        url,
      });
    } catch {
      // closing the share sheet is not an error
    }
  }

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

      {code && (
        <div className="sg-code-card">
          <span className="sg-code-label" id="sg-code-label">
            {t('stories.game.code')}
          </span>
          <span
            className="sg-code"
            role="img"
            // read out one character at a time: "A B C 2 3 4"
            aria-label={t('stories.game.codeSpelled', { code: code.split('').join(' ') })}
          >
            {formatJoinCode(code)}
          </span>
          <p className="sg-code-hint">
            {view.settings.access === 'open' ? t('stories.game.codeOpen') : t('stories.game.codeFriends')}
          </p>
          <div className="sg-share">
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              <CopyIcon size={16} />
              {t('games.copyLink')}
            </Button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <Button variant="secondary" size="sm" onClick={() => void share()}>
                <ShareIcon size={16} />
                {t('stories.game.share')}
              </Button>
            )}
            {invite}
          </div>
          {notice && (
            <p className="sg-notice" role="status">
              {notice}
            </p>
          )}
        </div>
      )}

      <FromMemoryNote view={view} />

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
              {/* anyone else in the lobby can be reported, by seat (reports/PlayerReport) */}
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

      {/* who is in first, then who was asked */}
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
                {/* enough people, but someone has stepped away from the page */}
                {present.length >= need ? t('stories.game.waitAway') : t('stories.game.needMore')}
              </p>
            )}
          </>
        ) : (
          <p className="sg-wait">{t('games.waitingForHost')}</p>
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
