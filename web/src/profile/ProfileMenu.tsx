import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { localeDir } from '@kurda/shared';
import { BookmarkIcon, GearIcon, MedalIcon, MoreIcon, ShareIcon, ShopIcon, TrophyIcon, UsersIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useRail } from '../social/RailProvider';
import { keepInView } from '../reports/keepInView';
import { shareProfileLink } from './share';

/**
 * Everything that is yours but is not your profile, behind one button in the
 * far corner of its banner — where the menu of a profile is looked for, and
 * where the menu about anybody else is too: the shop, what you saved, your
 * friends, your badges and ranks, and settings.
 *
 * These used to be spread across the top bar — a shop icon, a gear, a face
 * that opened a popup — which on a phone either crowded the bar or hid in a
 * menu of their own. They are all about you, so they live with you.
 *
 * Six, and no more. The record of your reports and your account's standing
 * were here as a seventh and an eighth; both are pages of Settings, two rows
 * down its Safety section, and a menu that repeats what the page behind its
 * last item holds only gets longer to read.
 *
 * A list of links behind a disclosure button rather than an ARIA menu: every
 * entry goes to a page, so each is an ordinary link, read and tabbed through
 * as one. Escape and a click elsewhere close it.
 */
export function ProfileMenu(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
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
  ];
  const waiting = gifts > 0 || requests > 0;
  // the button is named for what it holds, in the items' own words, so the name cannot fall behind the list:
  // "Menu" said nothing, and on a phone it was the name of the bar's menu button as well
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
        {/* three dots, not three lines: on a phone the bar's menu above is the three lines */}
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

/**
 * Sharing your profile: the device's own share sheet where there is one, and
 * the link copied where there is not (a desktop), said in the button itself.
 */
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
