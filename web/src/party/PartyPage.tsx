import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameDialect } from '@kurda/shared';
import { ArrowIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import './party.css';

/**
 * The frame of Impostor's page (/app/games/impostor): the back link and title over the start, a one-phone game or a
 * room. The lobby settings line and the turn timer live here too.
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

/** A lobby's settings above its roster, such as "Kurmancî · Beginner · 30 s". */
export function PartyLobbyNote({
  dialect,
  difficulty,
  topic,
  extra,
}: {
  dialect: GameDialect;
  difficulty?: string;
  /** The category the host chose, in Kurdish. */
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
 * A bar that empties as the current wait runs out on the server's clock, with the seconds for screen readers. It turns
 * to the warning colour when `low`.
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
