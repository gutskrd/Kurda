import { useMemo, type ReactNode } from 'react';
import { PaletteScope, useTheme } from '../theme/ThemeProvider';
import { TileLookScope, type TileLook } from '../theme/Tile';
import { VALLEY, VALLEY_PALETTES, valleyButton, valleyTile, type Valley } from './valley';

/**
 * The lesson in its painted valley (valley.ts): everything inside is drawn on
 * its warm paper in its ink, and every tile and lesson button in its colours,
 * by day or at dusk as the reader has the app.
 */
export function ValleyScope({ children }: { children: ReactNode }): React.JSX.Element {
  const { scheme } = useTheme();
  const look = useMemo<TileLook>(() => {
    const v = VALLEY[scheme];
    return { tile: (state) => valleyTile(v, state), button: (tone, enabled) => valleyButton(v, tone, enabled) };
  }, [scheme]);
  return (
    <PaletteScope palettes={VALLEY_PALETTES}>
      <TileLookScope look={look}>{children}</TileLookScope>
    </PaletteScope>
  );
}

/** The valley's own colours, for what the app's palette has no word for: the hills, a chip, the red of what is chosen. */
export function useValley(): Valley {
  return VALLEY[useTheme().scheme];
}
