import { useId, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { parseWinLink, shareCardSvg, type ShareCardOptions, type WinLink } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { NotFound } from '../pages/NotFound';
import { leagueName } from '../ranks/names';
import './win-page.css';

/**
 * Where a shared win's link lands (/win/<kind>, shared/src/win-link.ts): the
 * page somebody sees who tapped the link under a friend's line in a message,
 * with or without an account, on a phone or a desk.
 *
 * It is the postcard they were sent, large, with what was done said under it
 * in their own language, and one thing to press: begin, or for somebody
 * already signed in, go and learn. A page for one look and one tap.
 *
 * It says what was done and never who did it. The address has no way to name
 * a person (`parseWinLink` reads a kind from a fixed list and one detail of a
 * fixed shape), so there is nothing here to look up, nothing to wait for, and
 * nobody whose page this is. Some of the people sharing are children.
 *
 * The picture is the one the link was drawn with where it was pasted (the
 * edge script points at a file of the same drawing), so what was tapped is
 * what opens.
 */

/** A win as its card is asked for: the kind, and the one detail its stamp prints. */
function cardOf(win: WinLink): ShareCardOptions {
  if (win.kind === 'streak') return win.days === null ? { kind: 'streak' } : { kind: 'streak', days: win.days };
  if (win.kind === 'league') return win.tier === null ? { kind: 'league' } : { kind: 'league', tier: win.tier };
  return { kind: win.kind };
}

export function WinPage(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { status } = useAuth();
  const location = useLocation();
  const win = parseWinLink(location.pathname);
  const idPrefix = `wp${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  // one stable value for the picture to be drawn from: the same link is the same drawing, however often the page renders
  const key = win ? JSON.stringify(win) : '';
  const picture = useMemo(() => (key ? { __html: shareCardSvg({ ...cardOf(JSON.parse(key) as WinLink), idPrefix }) } : null), [key, idPrefix]);

  let title = '';
  if (win?.kind === 'lesson') title = t('win.lesson');
  // one day is not yet a row of them
  else if (win?.kind === 'streak') title = win.days !== null && win.days > 1 ? t('win.streak', { count: new Intl.NumberFormat(locale).format(win.days) }) : t('win.streakPlain');
  else if (win?.kind === 'badge') title = t('win.badge');
  else if (win?.kind === 'league') title = win.tier ? t('win.league', { league: leagueName(t, win.tier) }) : t('win.leaguePlain');
  // the word game's link is under a game that was lost as under one that was won: the page says the game
  else if (win?.kind === 'peyvok') title = t('games.card.wordle');
  usePageMeta(title || t('notFound.title'), t('win.body'));

  if (!win || !picture) return <NotFound />;

  return (
    <div className="container container-narrow win-page">
      <div className="win-card" role="img" aria-label={t('win.picture')} dangerouslySetInnerHTML={picture} />
      <div className="win-words">
        <p className="win-kicker">{t('win.kicker')}</p>
        <h1 className="page-title win-title">{title}</h1>
        <p className="win-body">{t('win.body')}</p>
      </div>
      <div className="win-actions">
        {status === 'restoring' ? null : status === 'signedIn' ? (
          <Link to="/app" className="btn btn-primary btn-lg win-go">
            {t('nav.learn')}
          </Link>
        ) : (
          <>
            <Link to="/register" className="btn btn-primary btn-lg win-go">
              {t('landing.hero.start')}
            </Link>
            <Link to="/login" className="btn btn-secondary win-login">
              {t('invite.login')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
