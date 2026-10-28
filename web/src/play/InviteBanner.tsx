import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DeclineReason, IncomingInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { CaretDownIcon, CloseIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { isFocusedPath } from '../layouts/focus';
import { useMediaQuery } from '../lib/useMediaQuery';
import { GAME_NAME_KEY, lobbyPath, playError, summaryParts } from './playApi';
import { RatedBadge } from '../ranks/rated';
import { usePlayInvites } from './PlayProvider';
import { useInvitesQuiet } from './quietInvites';

/**
 * Banners shown at once; the rest wait behind them, counted. One on a phone,
 * where a second would cover a third of the screen until it is answered.
 */
const MAX_BANNERS = 2;
const MAX_BANNERS_NARROW = 1;

/**
 * The room the banners take under the navigation, kept on the root as a CSS
 * variable: the page's top padding, a full-screen chat and the games' sticky
 * panes add it, so a banner sits above the page instead of over it.
 */
const SPACE_VAR = '--invite-banner-h';
/** between the banners and what comes under them */
const SPACE_BELOW = 8;

/**
 * The invites waiting for you (contract §B1): "Rojda invited you to Peyvok
 * Battle · Hard", with Join and "Not now ▾" (Later, or Not this game — the
 * host is told softly, and never in your words).
 *
 * `role=status`: a screen reader hears it arrive, and the focus stays where
 * you were — an invite never takes over what you are doing. It stays until you
 * answer it or it runs out; it does not slip away after a few seconds, so an
 * invite is never missed because you looked away.
 *
 * It never covers the page either: the room it takes is reserved above the
 * page (`--invite-banner-h`). On a phone, and while a game is being played,
 * it is a one-line chip — who asked, to what, and Join — that opens on a tap,
 * so waiting for an answer costs one line rather than a third of the screen.
 *
 * During a lesson or a review it is held altogether (`isFocusedPath`): the
 * invite waits, and its banner shows on whatever page the learner goes to
 * next.
 */
export function InviteBanner(): React.JSX.Element | null {
  const t = useT();
  const held = isFocusedPath(useLocation().pathname);
  const { lists } = usePlayInvites();
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const now = useNow(lists?.incoming ?? []);
  // a phone, or a game being played: one invite, as a one-line chip until opened
  const narrow = useMediaQuery('(max-width: 560px)');
  const playing = useInvitesQuiet();
  const compact = narrow || playing;
  const max = compact ? MAX_BANNERS_NARROW : MAX_BANNERS;
  const reserve = useReservedSpace();
  const waiting = (lists?.incoming ?? []).filter(
    (i) => i.status === 'pending' && !answered.has(i.id) && Date.parse(i.expiresAt) > now,
  );
  if (held || waiting.length === 0) return null;
  const done = (id: string): void => setAnswered((prev) => new Set(prev).add(id));
  const more = Math.max(0, waiting.length - max);
  return (
    <div className="invite-banners" ref={reserve} role="region" aria-label={t('play.banner.region')}>
      {waiting.slice(0, max).map((invite, i, shown) => (
        <Banner
          key={invite.id}
          invite={invite}
          compact={compact}
          onDone={() => done(invite.id)}
          // the rest are counted inside the last banner, not over the page
          more={i === shown.length - 1 ? more : 0}
        />
      ))}
    </div>
  );
}

/**
 * Measures the banners and writes the room they take to `--invite-banner-h`
 * on the root, again whenever they change size (one opened, one answered),
 * and takes it away when the last one goes. The layout's own position is read
 * (offsetTop, offsetHeight), not the drawn one, so a banner sliding in is
 * measured where it will rest.
 */
function useReservedSpace(): (el: HTMLDivElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(
    () => () => {
      observer.current?.disconnect();
      document.documentElement.style.removeProperty(SPACE_VAR);
    },
    [],
  );
  return useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty(SPACE_VAR);
      return;
    }
    const measure = (): void => {
      const nav = parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 0;
      const below = el.offsetTop + el.offsetHeight - nav + SPACE_BELOW;
      root.style.setProperty(SPACE_VAR, `${Math.max(0, Math.ceil(below))}px`);
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(measure);
      observer.current.observe(el);
    }
  }, []);
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

function Banner({
  invite,
  compact,
  onDone,
  more,
}: {
  invite: IncomingInvite;
  /** a phone or a game in play: a one-line chip, opened on request */
  compact: boolean;
  onDone: () => void;
  more: number;
}): React.JSX.Element {
  const t = useT();
  // null: as the screen has it (a chip when compact); then as the reader chose
  const [opened, setOpened] = useState<boolean | null>(null);
  const full = opened ?? !compact;
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
      // the reason needs the whole banner to be read
      setOpened(true);
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

  const title = invite.rematch
    ? t('play.banner.again', { name: invite.from.name, game })
    : t('play.banner.invited', { name: invite.from.name, game });
  const joinButton = (
    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void join()}>
      {busy ? t('games.joining') : t('play.banner.join')}
    </button>
  );

  if (!full) {
    // the chip: who asked and to what, Join, and the rest one tap away
    return (
      <div className="invite-banner is-chip" role="status">
        <Avatar url={invite.from.avatarUrl} glyphSize={14} />
        <p className="invite-banner-text">
          <span className="invite-banner-title">{title}</span>
        </p>
        {typeof invite.summary.rated === 'boolean' && <RatedBadge rated={invite.summary.rated} size="sm" iconOnly className="invite-rated" />}
        {more ? <span className="invite-banner-more">{t('play.banner.more', { count: more })}</span> : null}
        <span className="invite-banner-actions">
          {joinButton}
          <button
            type="button"
            className="invite-banner-x invite-banner-toggle"
            aria-expanded={false}
            aria-label={t('play.banner.expand')}
            title={t('play.banner.expand')}
            onClick={() => setOpened(true)}
          >
            <CaretDownIcon size={16} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="invite-banner" role="status">
      <Avatar url={invite.from.avatarUrl} glyphSize={18} />
      <p className="invite-banner-text">
        <span className="invite-banner-title">{title}</span>
        {/* Rated or Friendly, before anyone joins (Game Ranks) */}
        {typeof invite.summary.rated === 'boolean' && <RatedBadge rated={invite.summary.rated} size="sm" className="invite-rated" />}
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
          {joinButton}
          <NotNow disabled={busy} onPick={(reason) => void decline(reason)} />
          {compact && (
            <button
              type="button"
              className="invite-banner-x invite-banner-toggle is-open"
              aria-expanded
              aria-label={t('play.banner.collapse')}
              title={t('play.banner.collapse')}
              onClick={() => setOpened(false)}
            >
              <CaretDownIcon size={16} />
            </button>
          )}
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
