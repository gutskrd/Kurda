import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TAB_BAR_SCROLL, TAB_CAPSULE, springEasing, tabBarScroll } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { UserIcon } from '../components/icons';
import type { NavItem } from '../components/TopNav';
import { useT } from '../i18n/I18nProvider';
import { useGlass } from '../glass/useGlass';

/** The capsule's springs as transition curves, and its lift, the same numbers as the phone app's (shared `TAB_CAPSULE`). */
const LEAD = springEasing(TAB_CAPSULE.lead);
const FOLLOW = springEasing(TAB_CAPSULE.follow);
const CAPSULE_STYLE = {
  '--lead-ease': LEAD.easing,
  '--lead-ms': `${LEAD.ms}ms`,
  '--follow-ease': FOLLOW.easing,
  '--follow-ms': `${FOLLOW.ms}ms`,
  '--lift-scale': TAB_CAPSULE.liftScale,
  '--lift-fill': TAB_CAPSULE.liftFill,
  '--lift-ms': `${TAB_CAPSULE.liftMs}ms`,
} as React.CSSProperties;

/**
 * The phone's bar of places (`useNavLinks`), floating over the bottom of the window like the phone app's
 * (mobile/src/navigation/TabBar.tsx), each place an icon alone with its name for screen readers; the page leaves room
 * for it (shell.css).
 *
 * The current place shows a solid glyph, or a ring round your picture, and a capsule that springs over to it, stretching
 * and lifting on the way.
 * Something new waiting (unread messages, a gift or a request) is a small red dot, said in the link's name. While the
 * page scrolls down the bar shrinks out of the way and comes back on a short scroll up (shared tab-bar-scroll.ts).
 * Pressing the current place scrolls to the top. Visitors see their two places and Sign in. It is mirrored in Arabic
 * and Soranî, drawn only on place roots (`isPlaceRoot`), and comes after the page in the document as the `nav` of
 * places.
 */
export function PlacesBar({ links }: { links: readonly NavItem[] }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const { pathname } = useLocation();
  const glass = useGlass<HTMLElement>();

  const items: readonly NavItem[] =
    status === 'signedIn' ? links : [...links, { key: 'login', label: t('nav.login'), to: '/login', icon: <UserIcon size={22} /> }];
  // counted from the reading edge; the styles turn it into a place along the bar, in either direction
  const at = items.findIndex((l) => l.owns?.(pathname));

  // Which way the capsule last moved, so the end in front can lead and the one behind follow, and a lift that changes
  // name on every move so it plays again.
  const [was, setWas] = useState(at);
  const [lead, setLead] = useState<'end' | 'start'>('end');
  const [lift, setLift] = useState<'a' | 'b' | null>(null);
  if (at !== was) {
    setWas(at);
    if (at >= 0 && was >= 0) {
      setLead(at > was ? 'end' : 'start');
      setLift(lift === 'a' ? 'b' : 'a');
    }
  }

  // Small while the page scrolls down; each page starts with the bar full size.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const rule = tabBarScroll();
    const onScroll = () => setCompact(rule.note(window.scrollY));
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      setCompact(false);
    };
  }, [pathname]);

  return (
    <nav
      ref={glass}
      className={`places-bar glass${compact ? ' is-compact' : ''}`}
      aria-label={t('nav.primary')}
      style={{ '--compact': TAB_BAR_SCROLL.compactScale } as React.CSSProperties}
    >
      <div
        className={`places-row is-leading-${lead}${lift ? ` is-lift-${lift}` : ''}`}
        style={{ ...CAPSULE_STYLE, '--places': items.length, '--at': Math.max(at, 0) } as React.CSSProperties}
      >
        {at >= 0 && (
          <span className="places-track" aria-hidden="true">
            <span className="places-capsule" />
          </span>
        )}
        <ul className="places-list">
          {items.map((l, i) => {
            const active = i === at;
            const badge = l.badge ?? 0;
            // the place's name, with what is waiting in words: the dot itself is only drawn
            const spoken = badge > 0 ? t('nav.tabUnread', { place: l.label, count: badge }) : l.dot ? t('nav.tabWaiting', { place: l.label }) : l.label;
            const face = (
              <span className="places-glyph" aria-hidden="true">
                {active && l.activeIcon ? l.activeIcon : l.icon}
                {badge > 0 || l.dot ? <span className="nav-dot" /> : null}
              </span>
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
