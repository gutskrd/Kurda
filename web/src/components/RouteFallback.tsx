import { Skeleton, SkeletonRegion, SkeletonText } from './Skeleton';
import { useT } from '../i18n/I18nProvider';

/**
 * What stands in for a page while that page's code is still arriving.
 *
 * Every route below the shell is loaded on demand, so there is a moment —
 * usually a few dozen milliseconds, longer on a bad connection — where the
 * router knows which page to show and does not yet have it. This is that
 * moment.
 *
 * Deliberately plain. A per-page skeleton would be a better imitation of what
 * is coming, but it would have to be imported eagerly to be shown before the
 * page loads, which puts back the weight this is here to avoid. So: a heading's
 * worth of bar, a paragraph's worth of lines, and the right announcement.
 *
 * `SkeletonRegion` carries `role="status"` and the label, so somebody using a
 * screen reader is told the page is loading rather than being handed silence.
 */
export function RouteFallback(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="route-fallback">
      <Skeleton h={28} w="42%" radius={8} />
      <SkeletonText lines={3} />
    </SkeletonRegion>
  );
}
