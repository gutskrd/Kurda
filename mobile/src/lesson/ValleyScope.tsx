import { useMemo } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { valleyFor, type Valley } from './valley';

/** The lesson's own colours for what the app's palette lacks (valley.ts): the ridges, a chip, the ink of what is chosen. */
export function useValley(): Valley {
  const { colors } = useTheme();
  return useMemo(() => valleyFor(colors), [colors]);
}
