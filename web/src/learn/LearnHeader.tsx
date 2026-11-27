import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { glidesBetween } from '../lib/viewTransition';
import { LEARN_PATHS, rememberLearnView, type LearnView } from './learnView';

// The chosen ground glides only between Learn's own groups; leaving Learn, it goes with its page.
glidesBetween('learn-switch', Object.values(LEARN_PATHS));

/**
 * Learn's heading with the Lessons · Stories · Games switch. The switch is links, since each group has its own address,
 * and it replaces the address so Back leaves Learn. Visiting a group records it (`learnView`) for the Learn tab. The
 * chosen ground slides to the group chosen as the page changes, as the phone's capsule does.
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
            {/* The chosen ground, its own element so it can travel to the next group as the page changes (styles/motion.css). */}
            {view === tab.view && <span className="switch-capsule" aria-hidden="true" />}
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
