import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { UserIcon } from '../components/icons';
import { countLabel, type NavItem } from '../components/TopNav';
import { useT } from '../i18n/I18nProvider';

/**
 * The bar of places, on a phone: the same list the top bar has on a wide
 * screen (`useNavLinks`), in one rounded bar that floats over the bottom of
 * the window, each place an icon with its word under it. It is the phone
 * app's own bar (mobile/src/navigation/TabBar.tsx), for the same reasons.
 *
 * It floats, clear of the window's edges, so the page is seen to carry on
 * under and round it and the bar reads as something to hold, not as the end
 * of the screen. It is solid: nothing shows through between the icons. The
 * page leaves room for it under its last row (shell.css).
 *
 * Every place says what it is. An open book and a paper plane mean Learn and
 * Messages only to somebody who already knows; a word under each is read at
 * once, in the reader's own language.
 *
 * The place you are on is told three ways, none of them colour alone: its
 * glyph is drawn solid where the others are in outline, its word is in the
 * page's ink and a step heavier, and a soft capsule sits behind it. The
 * capsule slides along the bar to the place chosen, so the change is seen
 * moving and not only found. That is all that moves, and for a reader who
 * asked for less motion nothing does: the capsule is simply behind the place
 * they are on.
 *
 * Two things badge, and nothing else does: Messages, with how many are unread
 * (1–9, then "9+"), and Profile, with a dot when something of yours is
 * waiting. Both are said in words in the link's name — "Messages, 3 unread" —
 * because a number in a coloured circle is nothing a screen reader can see.
 *
 * Pressing the place you are already on takes its page back to the top.
 *
 * A visitor has the two places a visitor can use and, beside them, the way
 * in: without an account there are no messages and no profile, and Sign in
 * is what stands where they would be.
 *
 * In Arabic and Soranî the bar runs with the page, Home on the right.
 *
 * Only the root of a place draws it (`isPlaceRoot`, roots.ts, which the app's
 * shell asks). It is after the page in the document, so a keyboard and a
 * screen reader reach the page first, and it is a `nav` with the name the
 * list of places has on a wide screen: on a phone it is that list.
 */
export function PlacesBar({ links }: { links: readonly NavItem[] }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const { pathname } = useLocation();

  const items: readonly NavItem[] =
    status === 'signedIn' ? links : [...links, { key: 'login', label: t('nav.login'), to: '/login', icon: <UserIcon size={22} /> }];
  // counted from the reading edge; the styles turn it into a place along the bar, in either direction
  const at = items.findIndex((l) => l.owns?.(pathname));

  return (
    <nav className="places-bar" aria-label={t('nav.primary')}>
      <div className="places-row" style={{ '--places': items.length, '--at': Math.max(at, 0) } as React.CSSProperties}>
        {at >= 0 && <span className="places-capsule" aria-hidden="true" />}
        <ul className="places-list">
          {items.map((l, i) => {
            const active = i === at;
            const badge = l.badge ?? 0;
            // what is waiting, in words: the badge and the dot themselves are only drawn
            const spoken = badge > 0 ? t('nav.tabUnread', { place: l.label, count: badge }) : l.dot ? t('nav.tabWaiting', { place: l.label }) : undefined;
            const face = (
              <>
                <span className="places-glyph" aria-hidden="true">
                  {active && l.activeIcon ? l.activeIcon : l.icon}
                  {badge > 0 ? <span className="nav-badge">{countLabel(badge)}</span> : l.dot ? <span className="nav-dot" /> : null}
                </span>
                <span className="places-word" dir="auto">
                  {l.label}
                </span>
              </>
            );
            return (
              <li key={l.key ?? l.to}>
                {l.external ? (
                  <a href={l.to} className="places-link" aria-label={spoken}>
                    {face}
                  </a>
                ) : (
                  <Link
                    to={l.to}
                    className={`places-link${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    aria-label={spoken}
                    onClick={active ? () => window.scrollTo({ top: 0 }) : undefined}
                  >
                    {face}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
