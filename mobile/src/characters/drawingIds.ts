import { useId } from 'react';
import { Platform } from 'react-native';

/**
 * A prefix for one drawing's gradient and clip ids in the web build, where every drawing shares one document and a
 * repeated id fills one drawing from another's, or from nothing while that one is hidden. Phones root each drawing
 * separately, so there it is undefined and drawings keep their shared, cached markup.
 */
export function useDrawingIds(name: string): string | undefined {
  const own = useId().replace(/[^A-Za-z0-9]/g, '');
  return Platform.OS === 'web' ? `dw-${name}-${own}` : undefined;
}
