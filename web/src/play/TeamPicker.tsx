import { useState, type ReactNode } from 'react';
import type { MultiGame, MultiSeat } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import { HostIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { PlayerReport } from '../reports/PlayerReport';
import { useRail } from '../social/RailProvider';
import { multiSeatName } from './MultiRoom';
import '../learn/path.css';
import './teams.css';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Each team's colour, one of the path's tones (`lp-tone-*`, which have a
 * light and a dark version), and its name: a team is always named as well as
 * coloured, so the colour is never the only way to tell them apart.
 */
export const TEAM_TONE: Readonly<Record<number, string>> = { 1: 'saffron', 2: 'river', 3: 'rose', 4: 'pine' };
const TEAM_KEY: Readonly<Record<number, MessageKey>> = { 1: 'play.teams.team1', 2: 'play.teams.team2' };

export function teamName(team: number, t: Translate): string {
  const key = TEAM_KEY[team];
  return key ? t(key) : t('play.teams.teamN', { team });
}

export function teamTone(team: number | null | undefined): string {
  return TEAM_TONE[team ?? 1] ?? 'saffron';
}

/**
 * The teams of a team game's lobby, on the website: one column per team in
 * its colour and name, each player by seat (a friend by name, anyone else as
 * "Player N"), the host marked. A player moves themselves with "Join" on the
 * other team; the host can move anyone, and remove them, as in every lobby. A
 * report sits beside each other player, by seat. It stands where the lobby's
 * roster stands in a game without teams (play/MultiRoom.tsx).
 */
export function TeamPicker({
  players,
  teams,
  max,
  isHost,
  game,
  gameId,
  note,
  onTeam,
  onRemove,
}: {
  players: readonly MultiSeat[];
  teams: number;
  max: number;
  isHost: boolean;
  game: MultiGame;
  gameId: string;
  /** what the game says about its teams (three play together…) */
  note?: ReactNode;
  onTeam: (seat: number, team: number) => Promise<void>;
  onRemove: (seat: number) => Promise<void>;
}): React.JSX.Element {
  const t = useT();
  const myAvatar = useRail().data.you?.avatarUrl ?? null;
  const [busy, setBusy] = useState(false);
  const present = players.filter((p) => !p.gone);
  const me = present.find((p) => p.isMe) ?? null;
  const numbers = Array.from({ length: teams }, (_, i) => i + 1);

  async function move(seat: number, team: number): Promise<void> {
    setBusy(true);
    try {
      await onTeam(seat, team);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sg-panel team-picker" aria-labelledby="team-picker-title">
      <div className="sg-panel-head">
        <h2 className="sg-panel-title" id="team-picker-title">
          {t('play.teams.title')} · {t('stories.game.players', { count: present.length, max })}
        </h2>
      </div>
      {note}
      <div className="team-columns">
        {numbers.map((team) => {
          const members = present.filter((p) => (p.team ?? 1) === team);
          const name = teamName(team, t);
          const others = numbers.filter((n) => n !== team);
          return (
            <section key={team} className={`team-col lp-tone-${teamTone(team)}`} aria-labelledby={`team-${team}-name`}>
              <h3 className="team-name" id={`team-${team}-name`}>
                <span className="team-swatch" aria-hidden="true" />
                {name}
                <span className="team-count">{members.length}</span>
              </h3>
              {members.length === 0 ? (
                <p className="team-empty">{t('play.teams.empty')}</p>
              ) : (
                <ul className="team-members">
                  {members.map((p) => {
                    const who = multiSeatName(p, t);
                    return (
                      <li key={p.seat} className={`team-member${p.isMe ? ' is-me' : ''}`}>
                        <Avatar url={p.isMe ? myAvatar : p.avatarUrl} glyphSize={16} />
                        <span className="team-member-name">
                          {who}
                          {p.isHost && (
                            <span className="sg-host">
                              <HostIcon size={12} />
                              {t('stories.game.host')}
                            </span>
                          )}
                        </span>
                        {isHost &&
                          others.map((to) => (
                            <Button
                              key={to}
                              size="sm"
                              variant="ghost"
                              className="team-move"
                              disabled={busy}
                              aria-label={t('play.teams.moveWho', { name: who, team: teamName(to, t) })}
                              onClick={() => void move(p.seat, to)}
                            >
                              {t('play.teams.move', { team: teamName(to, t) })}
                            </Button>
                          ))}
                        {!p.isMe && <PlayerReport game={game} gameId={gameId} seat={p.seat} name={who} />}
                        {isHost && !p.isMe && (
                          <ConfirmButton
                            className="btn btn-ghost btn-sm sg-remove"
                            label={t('stories.game.remove')}
                            title={t('stories.game.removeWho', { name: who })}
                            onConfirm={() => onRemove(p.seat)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {me && (me.team ?? 1) !== team && !isHost && (
                <Button size="sm" variant="secondary" className="team-join" disabled={busy} onClick={() => void move(me.seat, team)}>
                  {t('play.teams.join', { team: name })}
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
