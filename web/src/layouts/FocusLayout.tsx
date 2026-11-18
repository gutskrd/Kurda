import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LessonPlaceholder } from '../learn/LessonPlaceholder';
import { RailProvider } from '../social/RailProvider';
import { PlayProvider } from '../play/PlayProvider';
import { useT } from '../i18n/I18nProvider';
import { useTrail } from './trail';

/**
 * The shell for lessons and reviews: only the lesson, with its own ✕ and progress, and no navigation, social column,
 * invite banner or rating box. The rail and invite providers stay, so invites wait and show on the next page
 * (`isFocusedPath`). The skip link and error boundary are the app shell's; the loading fallback is the lesson frame
 * (learn/LessonPlaceholder). Lessons are noted with `useTrail` so the back button can skip them.
 */
export function FocusLayout(): React.JSX.Element {
  const t = useT();
  useTrail();
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
