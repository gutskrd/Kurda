import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LessonPlaceholder } from '../learn/LessonPlaceholder';
import { RailProvider } from '../social/RailProvider';
import { PlayProvider } from '../play/PlayProvider';
import { useT } from '../i18n/I18nProvider';

/**
 * The shell for a lesson and a review: the lesson alone, with its own ✕, its
 * progress and nothing else — no navigation, no social column, no invite
 * banner and no rating box. A question is answered better with nothing
 * tugging at the eye, and a game invite landing over a question made the
 * learner choose between the two.
 *
 * Nothing is lost by it. The rail's and the invites' providers are still here,
 * so an invite sent mid-lesson is received as it would be anywhere; it waits,
 * and its banner shows as soon as the learner leaves for any other page
 * (`isFocusedPath` is how the banner and the rating box know to hold). The
 * skip link and the error boundary are the app shell's own. What it shows
 * while a page's code is still arriving is not: every page here is a lesson
 * or leads to one, so it is the lesson's own frame (learn/LessonPlaceholder),
 * the same picture the page then keeps while its session is asked for.
 */
export function FocusLayout(): React.JSX.Element {
  const t = useT();
  return (
    <RailProvider>
      <PlayProvider>
        <a href="#main" className="skip-link">
          {t('nav.skipToContent')}
        </a>
        <main id="main" className="focus-main">
          <ErrorBoundary>
            <Suspense fallback={<LessonPlaceholder label={t('lesson.loading')} />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </PlayProvider>
    </RailProvider>
  );
}
