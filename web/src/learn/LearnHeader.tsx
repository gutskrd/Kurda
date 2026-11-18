import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { LEARN_PATHS, rememberLearnView, type LearnView } from './learnView';

/**
 * Learn's heading with the Lessons · Stories · Games switch. The switch is links, since each group has its own address,
 * and it replaces the address so Back leaves Learn. Visiting a group records it (`learnView`) for the Learn tab.
 */
export function LearnHeader({ view }: { view: LearnView }): React.JSX.Element {
  const t = useT();
  useEffect(() => rememberLearnView(view), [view]);

  const tabs: Array<{ view: LearnView; label: string }> = [
    { view: 'lessons', label: t('learn.view.lessons') },
    { view: 'stories', label: t('learn.view.stories') },
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
