import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { LEARN_PATHS, rememberLearnView, type LearnView } from './learnView';

/**
 * The top of Learn: its name, and the switch between its two halves.
 *
 * Lessons and games are one place — both are how the language goes in — so
 * they share a heading and a switch rather than being two tabs of the bar.
 * Each half keeps its own address, which is what makes the switch two links
 * rather than two buttons: a half can be linked to, and the old /app/games
 * address still lands on the games. Switching replaces the address rather
 * than adding one, so Back leaves Learn instead of stepping through every
 * flick of the switch.
 *
 * Being on a half is what remembers it (`learnView`), so the Learn tab returns
 * here next time.
 */
export function LearnHeader({ view }: { view: LearnView }): React.JSX.Element {
  const t = useT();
  useEffect(() => rememberLearnView(view), [view]);

  const tabs: Array<{ view: LearnView; label: string }> = [
    { view: 'lessons', label: t('learn.view.lessons') },
    { view: 'games', label: t('games.title') },
  ];

  return (
    <div className="page-header learn-head">
      <h1 className="page-title">{t('nav.learn')}</h1>
      <nav className="switch" aria-label={t('learn.view.label')}>
        {tabs.map((tab) => (
          <Link
            key={tab.view}
            to={LEARN_PATHS[tab.view]}
            replace
            className={`switch-btn${view === tab.view ? ' is-active' : ''}`}
            aria-current={view === tab.view ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
