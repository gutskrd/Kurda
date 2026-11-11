import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameDialect } from '@kurda/shared';
import { ArrowIcon } from '../components/icons';
import { Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { InviteForm } from '../play/InviteSheet';
import { usePartyOffer, type PartyGame } from './offer';
import './party.css';

/**
 * The frame both party games' pages share on the website
 * (/app/games/impostor, /app/games/dont-say): the back link and the title,
 * then either the start — how to play in three steps, and a game with friends
 * (the invite sheet's form, in place) offered only in the varieties with
 * enough approved cards — or the room.
 */
export function PartyPage({ titleKey, className, children }: { titleKey: MessageKey; className: string; children: ReactNode }): React.JSX.Element {
  const t = useT();
  return (
    <div className={`container game-page party-page ${className}`}>
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>
            {t(titleKey)}
          </h1>
        </div>
      </div>
      {children}
    </div>
  );
}

export function PartyStart({
  game,
  introKey,
  steps,
  blurbKey,
  notOfferedKey,
  Icon,
}: {
  game: PartyGame;
  introKey: MessageKey;
  /** how to play, in three short steps */
  steps: readonly MessageKey[];
  blurbKey: MessageKey;
  notOfferedKey: MessageKey;
  Icon: (p: { size?: number }) => React.JSX.Element;
}): React.JSX.Element {
  const t = useT();
  const offer = usePartyOffer(game);
  if (offer === null) return <Loading />;
  if (offer.length === 0) {
    return (
      <div className="state party-not-offered">
        <Icon size={32} />
        <p>{t(notOfferedKey)}</p>
        <Link to="/app/games" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    );
  }
  return (
    <div className="party-start">
      <p className="page-sub">{t(introKey)}</p>
      <section className="party-how" aria-labelledby="party-how-title">
        <h2 id="party-how-title" className="party-way-title">
          {t('games.party.howTitle')}
        </h2>
        <ol className="party-steps">
          {steps.map((key, i) => (
            <li key={key} className="party-step">
              <span className="party-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="party-way" aria-labelledby="party-friends">
        <h2 id="party-friends" className="party-way-title">
          {t('games.party.withFriends')}
        </h2>
        <p className="muted">{t(blurbKey)}</p>
        <InviteForm target={{ kind: 'new', game }} lockGame heading={false} />
      </section>
    </div>
  );
}

/** "Kurmancî · Beginner · 30 s": what a lobby is set to, above its roster. */
export function PartyLobbyNote({
  dialect,
  difficulty,
  topic,
  extra,
}: {
  dialect: GameDialect;
  difficulty?: string;
  /** what the lobby’s cards are about, in Kurdish (a category the host chose) */
  topic?: string;
  extra?: string;
}): React.JSX.Element {
  const t = useT();
  const level = difficulty === 'beginner' || difficulty === 'intermediate' || difficulty === 'advanced' ? t(`games.solo.difficulty.${difficulty}`) : null;
  return (
    <p className="party-lobby-note muted">
      <span lang={dialect === 'ckb' ? 'ckb' : 'ku'}>{dialectName(dialect)}</span>
      {level ? ` · ${level}` : null}
      {topic ? (
        <>
          {' · '}
          <span lang={dialect === 'ckb' ? 'ckb' : 'ku'}>{topic}</span>
        </>
      ) : null}
      {extra ? ` · ${extra}` : null}
    </p>
  );
}

/**
 * How much of the present wait is left, as a flat bar that empties (drawn
 * from the server's clock), with the seconds for a screen reader. Under five
 * seconds on the viewer's own turn it turns to the warning colour.
 */
export function PartyTimer({ startedAt, endsAt, now, low, label }: { startedAt: string; endsAt: string; now: number; low: boolean; label: string }): React.JSX.Element {
  const total = Math.max(1, Date.parse(endsAt) - Date.parse(startedAt));
  const left = Math.max(0, Date.parse(endsAt) - now);
  const share = Math.min(1, left / total);
  return (
    <div className={`party-timer${low ? ' is-low' : ''}`} role="timer" aria-label={label}>
      <span className="party-timer-fill" style={{ transform: `scaleX(${share})` }} />
    </div>
  );
}

/** Seconds left until a time, from the server's clock. */
export function secondsLeft(endsAt: string | null | undefined, now: number): number {
  return endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)) : 0;
}
