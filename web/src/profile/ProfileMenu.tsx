import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookmarkIcon,
  FlagIcon,
  GearIcon,
  MedalIcon,
  MenuIcon,
  ShareIcon,
  ShieldIcon,
  ShopIcon,
  TrophyIcon,
  UsersIcon,
} from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useRail } from '../social/RailProvider';
import { keepInView } from '../reports/keepInView';

/**
 * Everything that is yours but is not your profile, behind one button at the
 * top of it: the shop, what you saved, your friends, your badges and ranks,
 * settings, and the record of your reports and your account's standing.
 *
 * These used to be spread across the top bar — a shop icon, a gear, a face
 * that opened a popup — which on a phone either crowded the bar or hid in a
 * menu of their own. They are all about you, so they live with you.
 *
 * A list of links behind a disclosure button rather than an ARIA menu: every
 * entry goes to a page, so each is an ordinary link, read and tabbed through
 * as one. Escape and a click elsewhere close it.
 */
export function ProfileMenu(): React.JSX.Element {
  const t = useT();
  const { data } = useRail();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const gifts = data.unread.gifts ?? 0;
  const requests = data.unread.requests;

  useLayoutEffect(() => {
    if (open && pop.current) keepInView(pop.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const items: Array<{ to: string; label: string; icon: React.ReactNode; count?: number }> = [
    { to: '/app/shop', label: t('nav.shop'), icon: <ShopIcon size={20} />, count: gifts },
    { to: '/app/saved', label: t('saved.title'), icon: <BookmarkIcon size={20} /> },
    { to: '/app/friends', label: t('nav.friends'), icon: <UsersIcon size={20} />, count: requests },
    { to: '/app/badges', label: t('badges.title'), icon: <MedalIcon size={20} /> },
    { to: '/app/rankings', label: t('nav.rankings'), icon: <TrophyIcon size={20} /> },
    { to: '/app/settings', label: t('nav.settings'), icon: <GearIcon size={20} /> },
    { to: '/app/settings/reports', label: t('reports.mine.title'), icon: <FlagIcon size={20} /> },
    { to: '/app/settings/standing', label: t('standing.title'), icon: <ShieldIcon size={20} weight="regular" /> },
  ];
  const waiting = gifts > 0 || requests > 0;

  return (
    <div className="profile-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="icon-btn icon-btn-lg profile-menu-btn"
        aria-expanded={open}
        aria-label={waiting ? t('nav.tabWaiting', { place: t('nav.menu') }) : t('nav.menu')}
        title={t('nav.menu')}
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon size={22} />
        {waiting && <span className="nav-bell-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="user-menu profile-menu-list" ref={pop}>
          <ul>
            {items.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="user-menu-item" onClick={() => setOpen(false)}>
                  {item.icon}
                  <span className="profile-menu-label">{item.label}</span>
                  {(item.count ?? 0) > 0 && <span className="chat-unread">{item.count}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Sharing your profile: the device's own share sheet where there is one, and
 * the link copied where there is not (a desktop), said in the button itself.
 */
export function ShareProfile({ userId, name }: { userId: string; name: string }): React.JSX.Element {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = new URL(`/app/users/${userId}`, window.location.origin).toString();

  async function share(): Promise<void> {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch {
        // dismissed, or refused: copying is still a working answer
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void share()}>
      <ShareIcon size={16} />
      <span aria-live="polite">{copied ? t('share.copied') : t('profile.share')}</span>
    </button>
  );
}
