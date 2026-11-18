import { Skeleton, SkeletonRegion } from './Skeleton';
import { useT } from '../i18n/I18nProvider';

/**
 * Stands in for a page while its lazily loaded code arrives. Deliberately plain, since a per-page skeleton would have to
 * be loaded eagerly: a heading and the line under it, in the page's own classes. It appears after a moment
 * (SkeletonRegion), which also announces loading to screen readers.
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
