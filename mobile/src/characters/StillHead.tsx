import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { BrowState } from '@kurda/shared';
import { useDrawingIds } from './drawingIds';
import type { Turn } from './headTurnMotion';
import { characterLayers } from './layers';
import { TurnedHead } from './TurnedHead';

/**
 * Hevalo's head and neck as a still picture that can still turn aside in the round (`turn`, shared head-turn.ts): no
 * blinks, looks, speech or taps, the same drawing as `characterSvg`'s head crop, laid in the pieces a turn moves. For a
 * picture that only decorates but answers the phone swinging round.
 */
export function StillHead({ width, turn, brows = 'neutral', flip = false }: { width: number; turn: Turn; brows?: BrowState; flip?: boolean }): React.JSX.Element {
  const ids = useDrawingIds('sh');
  const layers = useMemo(() => characterLayers('hevalo', 'head', ids), [ids]);
  const height = (width * layers.frame.h) / layers.frame.w;
  return (
    <View style={[{ width, height }, flip ? styles.flip : null]} aria-hidden>
      <SvgXml xml={layers.body} width={width} height={height} style={StyleSheet.absoluteFill} />
      <TurnedHead layers={layers} turn={turn} width={width} height={height} eyes="open" brows={brows} mouth="rest" />
    </View>
  );
}

const styles = StyleSheet.create({
  flip: { transform: [{ scaleX: -1 }] },
});
