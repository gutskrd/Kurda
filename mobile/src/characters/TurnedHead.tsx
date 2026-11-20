import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { characterArt, roundLayer, roundPoint, turnStep, type BrowState, type EyeState, type MouthShape } from '@kurda/shared';
import { partStyles, type Turn } from './headTurnMotion';
import type { CharacterLayers } from './layers';

/** One drawing in the shared frame, memoised on its markup. */
const Layer = memo(function Layer({ xml, width, height }: { xml: string; width: number; height: number }) {
  return xml ? <SvgXml xml={xml} width={width} height={height} style={StyleSheet.absoluteFill} /> : null;
});

/** The step of the turn `turn` holds (shared head-round.ts), followed as it moves. */
function useTurnStep(turn: Turn): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = turn.addListener(({ value }) => setStep(turnStep(value)));
    return () => turn.removeListener(id);
  }, [turn]);
  return step;
}

/**
 * The deer's head turned aside in the round (shared head-round.ts), laid as the speaking character lays it: the antlers
 * and ears behind, turning on the native driver; then the face, the eyes with their pupils, lids and brows, the mouth
 * and the nose, each drawn turned at the step `turn` has reached, so his outline, snout and features move as a solid
 * head's do. The player passes what moves of its own: the pupils' look, the ears' twitch and the nose's sniff.
 */
export function TurnedHead({
  layers,
  turn,
  width,
  height,
  eyes,
  brows,
  mouth,
  pupils,
  ears,
  sniff,
}: {
  layers: CharacterLayers;
  turn: Turn;
  width: number;
  height: number;
  eyes: EyeState;
  brows: BrowState;
  mouth: MouthShape;
  pupils?: { left: object; right: object } | null;
  ears?: { left: object; right: object } | null;
  sniff?: object | null;
}): React.JSX.Element | null {
  const rig = layers.rig;
  const antlers = rig?.antlers;
  const step = useTurnStep(turn);
  const style = useMemo(() => partStyles(turn, characterArt('hevalo'), layers.frame, width / layers.frame.w), [turn, layers.frame, width]);
  // The nose swells about where it has turned to.
  const sniffAt = useMemo(() => {
    const art = characterArt('hevalo');
    const p = art.rig ? roundPoint(art.rig.sniff, step, 'fur') : null;
    const { frame } = layers;
    return p ? { transformOrigin: `${(((p.x - frame.x) / frame.w) * 100).toFixed(3)}% ${(((p.y - frame.y) / frame.h) * 100).toFixed(3)}%` } : null;
  }, [step, layers]);
  if (!rig || !antlers) return null;
  const fur = (xml: string): string => roundLayer(xml, step, 'fur');
  const eye = (xml: string): string => roundLayer(xml, step, 'eyes');
  const at = (s: object | undefined | null, xml: string) => (
    <Animated.View style={[StyleSheet.absoluteFill, s]}>
      <Layer xml={xml} width={width} height={height} />
    </Animated.View>
  );
  return (
    <>
      {at(style.antlerLeft, antlers.left)}
      {at(style.antlerRight, antlers.right)}
      <Animated.View style={[StyleSheet.absoluteFill, style.earLeft]}>{at(ears?.left, rig.earLeft)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, style.earRight]}>{at(ears?.right, rig.earRight)}</Animated.View>
      <Layer xml={fur(rig.face)} width={width} height={height} />
      <Layer xml={eye(rig.whites)} width={width} height={height} />
      {at(pupils?.left, eye(rig.pupilLeft))}
      {at(pupils?.right, eye(rig.pupilRight))}
      {eyes === 'open' ? null : <Layer xml={eye(eyes === 'half' ? rig.half : layers.eyes[eyes])} width={width} height={height} />}
      <Layer xml={eye(layers.brows[brows])} width={width} height={height} />
      <Layer xml={fur(layers.mouths[mouth])} width={width} height={height} />
      {at(sniff ? [sniff, sniffAt] : null, fur(layers.overlay))}
    </>
  );
}
