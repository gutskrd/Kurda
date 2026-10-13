import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DeclineReason, IncomingInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { CaretDownIcon, CloseIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { GAME_NAME_KEY, lobbyPath, playError, summaryParts } from './playApi';
import { usePlayInvites } from './PlayProvider';

/**
 * Banners shown at once; the rest wait behind them, counted. One on a phone,
 * where a second would cover a third of the screen until it is answered.
 */
const MAX_BANNERS = 2;
const MAX_BANNERS_NARROW = 1;

/**
 * The invites waiting for you (contract §B1): "Rojda invited you to Wordle
 * Battle · Hard", with Join and "Not now ▾" (Later, or Not this game — the
 * host is told softly, and never in your words).
 *
 * `role=status`: a screen reader hears it arrive, and the focus stays where
 * you were — an invite never takes over what you are doing. It stays until you
 * answer it or it runs out; it does not slip away after a few seconds, so an
 * invite is never missed because you looked away.
 */
export function InviteBanner(): React.JSX.Element | null {
  const t = useT();
  const { lists } = usePlayInvites();
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const now = useNow(lists?.incoming ?? []);
  const max = useMediaQuery('(max-width: 560px)') ? MAX_BANNERS_NARROW : MAX_BANNERS;
  const waiting = (lists?.incoming ?? []).filter(
    (i) => i.status === 'pending' && !answered.has(i.id) && Date.parse(i.expiresAt) > now,
  );
  if (waiting.length === 0) return null;
  const done = (id: string): void => setAnswered((prev) => new Set(prev).add(id));
  const more = Math.max(0, waiting.length - max);
  return (
    <div className="invite-banners" role="region" aria-label={t('play.banner.region')}>
      {waiting.slice(0, max).map((invite, i, shown) => (
        <Banner
          key={invite.id}
          invite={invite}
          onDone={() => done(invite.id)}
          // the rest are counted inside the last banner, not over the page
          more={i === shown.length - 1 ? more : 0}
        />
      ))}
    </div>
  );
}

/** The time, ticking over when the soonest invite runs out, so an expired one goes on its own. */
function useNow(invites: readonly IncomingInvite[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const next = Math.min(...invites.map((i) => Date.parse(i.expiresAt)).filter((at) => at > now));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(next - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [invites, now]);
  return now;
}

function Banner({ invite, onDone, more }: { invite: IncomingInvite; onDone: () => void; more: number }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const { refresh } = usePlayInvites();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const game = t(GAME_NAME_KEY[invite.game]);
  const parts = summaryParts(invite.game, invite.summary, t);

  async function join(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post<{ game: typeof invite.game; lobbyId: string }>(`/play/invites/${encodeURIComponent(invite.id)}/accept`);
    setBusy(false);
    if (!res.ok) {
      setError(playError(res.error, t));
      return;
    }
    onDone();
    refresh();
    navigate(lobbyPath(res.data.game ?? invite.game, res.data.lobbyId ?? invite.lobbyId));
  }

  async function decline(reason: DeclineReason): Promise<void> {
    setBusy(true);
    // the banner goes either way: a "not now" that failed to send is still not now
    await client.post(`/play/invites/${encodeURIComponent(invite.id)}/decline`, { reason });
    setBusy(false);
    onDone();
    refresh();
  }

  return (
    <div className="invite-banner" role="status">
      <Avatar url={invite.from.avatarUrl} glyphSize={18} />
      <p className="invite-banner-text">
        <span className="invite-banner-title">
          {invite.rematch
            ? t('play.banner.again', { name: invite.from.name, game })
            : t('play.banner.invited', { name: invite.from.name, game })}
        </span>
        {parts.length > 0 && (
          <span className="invite-banner-summary">
            {parts.map((p, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span lang={p.lang} dir={p.dir}>
                  {p.text}
                </span>
              </span>
            ))}
          </span>
        )}
        {more ? <span className="invite-banner-more">{t('play.banner.more', { count: more })}</span> : null}
        {error && <span className="invite-banner-error">{error}</span>}
      </p>
      {error ? (
        <button type="button" className="invite-banner-x" onClick={onDone} aria-label={t('rail.dismiss')}>
          <CloseIcon size={14} />
        </button>
      ) : (
        <span className="invite-banner-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void join()}>
            {busy ? t('games.joining') : t('play.banner.join')}
          </button>
          <NotNow disabled={busy} onPick={(reason) => void decline(reason)} />
        </span>
      )}
    </div>
  );
}

/**
 * "Not now ▾": a small menu of the two answers. Arrow keys move between them,
 * Escape closes it and gives the focus back to its button.
 */
function NotNow({ onPick, disabled }: { onPick: (reason: DeclineReason) => void; disabled: boolean }): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const away = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function onKey(e: React.KeyboardEvent): void {
    const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  }

  return (
    <div className="invite-notnow" ref={wrap} onKeyDown={open ? onKey : undefined}>
      <button
        type="button"
        ref={button}
        className="btn btn-ghost btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {t('play.banner.notNow')}
        <CaretDownIcon size={14} />
      </button>
      {open && (
        <div className="invite-notnow-menu" role="menu" id={menuId} aria-label={t('play.banner.notNow')}>
          <button type="button" role="menuitem" onClick={() => onPick('later')}>
            {t('play.banner.later')}
          </button>
          <button type="button" role="menuitem" onClick={() => onPick('not_this_game')}>
            {t('play.banner.notThisGame')}
          </button>
        </div>
      )}
    </div>
  );
}
