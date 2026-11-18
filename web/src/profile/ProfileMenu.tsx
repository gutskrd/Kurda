import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { localeDir } from '@kurda/shared';
import { BookmarkIcon, GearIcon, MedalIcon, MoreIcon, ShareIcon, ShopIcon, TrophyIcon, UsersIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useRail } from '../social/RailProvider';
import { useUnseenGifts } from '../shop/useUnseenGifts';
import { keepInView } from '../reports/keepInView';
import { shareProfileLink } from './share';

/**
 * The owner's menu in the profile banner's corner: shop, saved, friends, badges and rankings, and settings. Reports and
 * account standing stay in Settings. It is a disclosure of ordinary links rather than an ARIA menu, since every entry
 * is a page; Escape and an outside click close it.
 */
export function ProfileMenu(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { data } = useRail();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const gifts = useUnseenGifts();
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
  ];
  const waiting = gifts > 0 || requests > 0;
  // The button is named after its items, in their own words, so the name stays in step with the list.
  const holds = items.map((item) => item.label).join(localeDir(locale) === 'rtl' ? '، ' : ', ');

  return (
    <div className="profile-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="icon-btn icon-btn-lg profile-menu-btn"
        aria-expanded={open}
        aria-label={waiting ? t('nav.tabWaiting', { place: holds }) : holds}
        title={holds}
        onClick={() => setOpen((v) => !v)}
      >
        {/* three dots, not three lines: three lines are the menu a phone's bar folds into on the public pages */}
        <MoreIcon size={22} />
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

/** Shares the profile through the share sheet, or copies the link and says so in the button. */
export function ShareProfile({ userId, name }: { userId: string; name: string }): React.JSX.Element {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function share(): Promise<void> {
    if ((await shareProfileLink(userId, name)) !== 'copied') return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void share()}>
      <ShareIcon size={16} />
      <span aria-live="polite">{copied ? t('share.copied') : t('profile.share')}</span>
    </button>
  );
}
