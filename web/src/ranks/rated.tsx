import { useCallback, useEffect, useRef, useState } from 'react';
import { isRankedGame, type ExpectedGains, type PlayGame, type RankedGame, type RatedState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { FriendlyIcon, RatedIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { friendlyReason, rankLabel } from './names';

/**
 * Rated or Friendly, chosen per game (contract 4 §R2).
 *
 * Everyone sees the badge before they join — in the invite, the card, the
 * lobby and the game's header — and only the host changes it, only in the
 * lobby. A setup sheet starts on the host's last choice for that game
 * (remembered on this device and on the server); with none, Friendly for a
 * game among friends and Rated for one opened to everyone, the server's own
 * default, so the sheet shows what the server would have picked.
 */

/** The badge itself: a word and an icon, so it never rests on colour. */
export function RatedBadge({
  rated,
  size = 'md',
  className,
}: {
  /** what it would be or is: a game that was Rated but plays as friendly shows Friendly */
  rated: boolean;
  size?: 'sm' | 'md';
  className?: string;
}): React.JSX.Element {
  const t = useT();
  return (
    <span className={`rated-badge ${rated ? 'is-rated' : 'is-friendly'} is-${size}${className ? ` ${className}` : ''}`}>
      {rated ? <RatedIcon size={size === 'sm' ? 12 : 14} /> : <FriendlyIcon size={size === 'sm' ? 12 : 14} />}
      {rated ? t('rated.rated') : t('rated.friendly')}
    </span>
  );
}

/** What the badge should say for a game's state: Rated until a start decided otherwise. */
export function shownRated(state: RatedState | null | undefined): boolean {
  if (!state) return false;
  return state.counts === null ? state.rated : state.counts;
}

// ---- remembering the host's choice ---------------------------------------------------

const PREF_KEY = (game: RankedGame) => `hevalo.rated.${game}`;

export function rememberedRated(game: RankedGame): boolean | null {
  try {
    const v = localStorage.getItem(PREF_KEY(game));
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

function rememberLocally(game: RankedGame, rated: boolean): void {
  try {
    localStorage.setItem(PREF_KEY(game), rated ? '1' : '0');
  } catch {
    // a device that will not remember starts from the server's memory next time
  }
}

/**
 * The setup sheet's Rated/Friendly: the remembered choice, else the server's,
 * else the default for how the game is being opened. A change is remembered on
 * the device at once and on the server in the background.
 */
export function useRatedChoice(game: PlayGame, open: boolean): [boolean, (rated: boolean) => void] {
  const { client } = useAuth();
  const ranked = isRankedGame(game) ? game : null;
  const [rated, setRated] = useState<boolean>(() => (ranked ? (rememberedRated(ranked) ?? open) : false));
  const touched = useRef(false);

  // a game switched in the sheet starts on that game's own memory
  useEffect(() => {
    touched.current = false;
    setRated(ranked ? (rememberedRated(ranked) ?? open) : false);
  }, [ranked, open]);

  useEffect(() => {
    if (!ranked || rememberedRated(ranked) !== null) return;
    let cancelled = false;
    void client.get<{ preferences: Partial<Record<RankedGame, boolean>> }>('/ranks/preferences').then((res) => {
      if (cancelled || touched.current || !res.ok) return;
      const pref = res.data.preferences?.[ranked];
      if (typeof pref === 'boolean') setRated(pref);
    });
    return () => {
      cancelled = true;
    };
  }, [client, ranked]);

  const choose = useCallback(
    (next: boolean) => {
      touched.current = true;
      setRated(next);
      if (!ranked) return;
      rememberLocally(ranked, next);
      void client.request('PUT', `/ranks/preferences/${ranked}`, { body: { rated: next } });
    },
    [client, ranked],
  );
  return [rated, choose];
}

// ---- the choice, as a control ----------------------------------------------------------

/**
 * Two options side by side, each with the line that says what it means. Radio
 * buttons underneath, so arrow keys move between them and a screen reader
 * hears a group of two.
 */
export function RatedChoice({
  value,
  onChange,
  disabled = false,
  name = 'rated',
  quietLegend = false,
}: {
  value: boolean;
  onChange: (rated: boolean) => void;
  disabled?: boolean;
  name?: string;
  /** the panel around it already says "Match type": keep the legend for screen readers only */
  quietLegend?: boolean;
}): React.JSX.Element {
  const t = useT();
  const options = [
    { rated: true, label: t('rated.rated'), hint: t('rated.ratedHint') },
    { rated: false, label: t('rated.friendly'), hint: t('rated.friendlyHint') },
  ];
  return (
    <fieldset className="rated-choice" disabled={disabled}>
      <legend className={quietLegend ? 'sr-only' : 'chip-radio-legend'}>{t('rated.label')}</legend>
      <div className="rated-choice-options">
        {options.map((o) => (
          <label key={String(o.rated)} className={`rated-option ${o.rated ? 'is-rated' : 'is-friendly'}${value === o.rated ? ' is-on' : ''}`}>
            <input type="radio" name={name} checked={value === o.rated} onChange={() => onChange(o.rated)} />
            <span className="rated-option-icon" aria-hidden="true">
              {o.rated ? <RatedIcon size={18} /> : <FriendlyIcon size={18} />}
            </span>
            <span className="rated-option-text">
              <span className="rated-option-label">{o.label}</span>
              <span className="rated-option-hint">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- the lobby ---------------------------------------------------------------------------

/** A seat's name as the lobby shows it ("You", a friend, "Player 3"). */
export type SeatNamer = (seat: number) => string;

/**
 * The lobby's Rated/Friendly panel: the badge for everyone; the switch for the
 * host; for each opponent, roughly what a win and a loss would do ("Win ≈ +24 ·
 * Lose ≈ −8"); and, when a Rated game would not count if it started now, why.
 * A joined player told the host changed it may leave — leaving a lobby never
 * costs anything.
 */
export function LobbyRated({
  game,
  lobbyId,
  state,
  isHost,
  member,
  playerCount,
  seatName,
}: {
  game: PlayGame;
  lobbyId: string;
  /** absent from an API older than Game Ranks: then there is no panel */
  state: RatedState | undefined;
  isHost: boolean;
  /** in the lobby (the expected gains are a member's alone) */
  member: boolean;
  playerCount: number;
  seatName: SeatNamer;
}): React.JSX.Element | null {
  const t = useT();
  const { client } = useAuth();
  const ranked = isRankedGame(game) ? game : null;
  const chosen = state?.rated ?? false;
  const [rated, setRated] = useState(chosen);
  const [busy, setBusy] = useState(false);
  const [gains, setGains] = useState<ExpectedGains | null>(null);
  // what this player saw when they came in: a later change is said to them
  const firstSeen = useRef(chosen);
  useEffect(() => setRated(chosen), [chosen]);

  useEffect(() => {
    if (!ranked || !member || !chosen) {
      setGains(null);
      return;
    }
    let cancelled = false;
    void client.get<ExpectedGains>(`/ranks/expected/${ranked}/${lobbyId}`).then((res) => {
      if (!cancelled) setGains(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [client, ranked, lobbyId, member, chosen, playerCount]);

  if (!ranked || !state) return null;

  async function change(next: boolean): Promise<void> {
    const before = rated;
    setRated(next);
    setBusy(true);
    const res = await client.request('PUT', `/play/${game}/${lobbyId}/rated`, { body: { rated: next } });
    setBusy(false);
    if (!res.ok) setRated(before);
  }

  const changed = !isHost && member && chosen !== firstSeen.current;
  const why = gains && !gains.wouldCount ? friendlyReason(t, gains.friendlyReason, gains.self) : null;
  const opponents = gains?.wouldCount ? gains.opponents : [];

  return (
    <div className={`sg-panel rated-panel ${rated ? 'is-rated' : 'is-friendly'}`}>
      <div className="sg-panel-head">
        <h3 className="sg-panel-title">{t('rated.label')}</h3>
        {!isHost && <RatedBadge rated={rated} />}
      </div>
      {isHost ? (
        <RatedChoice value={rated} onChange={(v) => void change(v)} disabled={busy} name={`rated-${lobbyId}`} quietLegend />
      ) : (
        <p className="rated-panel-hint">{rated ? t('rated.ratedHint') : t('rated.friendlyHint')}</p>
      )}
      {changed && (
        <p className="rated-panel-note" role="status">
          {chosen ? t('rated.nowRated') : t('rated.nowFriendly')}
        </p>
      )}
      {rated && why && (
        <p className="rated-panel-note">{t('rated.wouldBeFriendly', { reason: why })}</p>
      )}
      {rated && gains?.wouldCount && (
        <div className="rated-gains">
          {gains.first !== null && gains.last !== null && (
            <p className="rated-gains-line">
              {t('rated.expectedGroup', { first: gain(gains.first), last: loss(gains.last) })}
            </p>
          )}
          {opponents.length > 0 && (
            <ul className="rated-gains-list">
              {opponents.map((o) => (
                <li key={o.seat} className="rated-gains-row">
                  <span className="rated-gains-who">
                    {seatName(o.seat)}
                    <span className="rated-gains-rank">
                      {o.placing || !o.tier ? t('ranks.placingShort') : rankLabel(t, o.tier, o.division)}
                    </span>
                  </span>
                  <span className="rated-gains-nums">
                    {t('rated.expected', { win: gain(o.win), lose: loss(o.lose) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** "+24": a change with its sign; nothing is "+0" or "−0". */
export function signed(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return r < 0 ? `−${Math.abs(r)}` : `+${r}`;
}

/** What a win would add: never shown as a loss. */
export function gain(n: number): string {
  return signed(Math.abs(n));
}

/** What a loss would take: never shown as a gain, whichever sign the server sent it with. */
export function loss(n: number): string {
  return signed(-Math.abs(n));
}
