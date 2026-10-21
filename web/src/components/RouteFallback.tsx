import { Skeleton, SkeletonRegion } from './Skeleton';
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
 * page loads, which puts back the weight this is here to avoid. So it is the
 * one thing nearly every page starts with — its heading and the line under
 * it, in the page's own container and the heading's own classes — which puts
 * the bars where the page's first words will be. It waits a moment before it
 * shows at all (SkeletonRegion), so a page that arrives quickly never flashes.
 *
 * `SkeletonRegion` carries `role="status"` and the label, so somebody using a
 * screen reader is told the page is loading rather than being handed silence.
 */
export function RouteFallback(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="container route-fallback">
      <div className="page-header">
        <div className="page-title">
          <Skeleton line w="38%" />
        </div>
        <p className="page-sub">
          <Skeleton line w="62%" />
        </p>
      </div>
    </SkeletonRegion>
  );
}
