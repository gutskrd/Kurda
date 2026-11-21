import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { characterArt, roundLayer, roundNeck, roundPart, roundPoint, turnStep, type BrowState, type EyeState, type MouthShape } from '@kurda/shared';
import { useDrawingIds } from './drawingIds';
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

/** The deer's neck riding round under his head as it turns (shared head-round.ts), at the step `turn` has reached. */
export function TurnedNeck({ xml, turn, width, height }: { xml: string; turn: Turn; width: number; height: number }): React.JSX.Element {
  const step = useTurnStep(turn);
  return <Layer xml={roundNeck(xml, step)} width={width} height={height} />;
}

/**
 * The deer's head turned aside as a whole (shared head-round.ts), laid as the speaking character lays it: the antlers
 * and ears behind, turning on the native driver and showing their depth at the step reached (an ear's back and hollow,
 * an antler's far side); then his outline, what lies on his face, his eyes with their pupils,
 * lids and brows, and his muzzle with the mouth and nose, each shape kept as drawn and moved with the piece of his head
 * it sits on at the step `turn` has reached, his face within his outline. The player passes what moves of its own: the
 * pupils' look, the ears' twitch and the nose's sniff.
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
  const clip = `${useDrawingIds('turn') ?? 'turn'}-face`;
  const style = useMemo(() => partStyles(turn, characterArt('hevalo'), layers.frame, width / layers.frame.w), [turn, layers.frame, width]);
  // The nose swells about where it has turned to.
  const sniffAt = useMemo(() => {
    const art = characterArt('hevalo');
    const p = art.rig ? roundPoint(art.rig.sniff, step, 'fur') : null;
    const { frame } = layers;
    return p ? { transformOrigin: `${(((p.x - frame.x) / frame.w) * 100).toFixed(3)}% ${(((p.y - frame.y) / frame.h) * 100).toFixed(3)}%` } : null;
  }, [step, layers]);
  const parts = rig?.faceParts;
  if (!rig || !antlers || !parts) return null;
  // What lies on his face and his eyes stay within his turned outline; his muzzle, mouth and nose may stand out of it.
  const fur = (xml: string): string => roundLayer(xml, step, 'fur', clip);
  const eye = (xml: string): string => roundLayer(xml, step, 'eyes', clip);
  // The pupils move with their look on their own, so they are not clipped where they were drawn.
  const pupil = (xml: string): string => roundLayer(xml, step, 'eyes');
  const at = (s: object | undefined | null, xml: string) => (
    <Animated.View style={[StyleSheet.absoluteFill, s]}>
      <Layer xml={xml} width={width} height={height} />
    </Animated.View>
  );
  return (
    <>
      {at(style.antlerLeft, roundPart(antlers.left, step, 'antler', `${clip}-antler-left`))}
      {at(style.antlerRight, roundPart(antlers.right, step, 'antler', `${clip}-antler-right`))}
      <Animated.View style={[StyleSheet.absoluteFill, style.earLeft]}>{at(ears?.left, roundPart(rig.earLeft, step, 'ear', `${clip}-ear-left`))}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, style.earRight]}>{at(ears?.right, roundPart(rig.earRight, step, 'ear', `${clip}-ear-right`))}</Animated.View>
      <Layer xml={roundLayer(parts.outline, step, 'outline')} width={width} height={height} />
      <Layer xml={fur(parts.features)} width={width} height={height} />
      <Layer xml={eye(rig.whites)} width={width} height={height} />
      {at(pupils?.left, pupil(rig.pupilLeft))}
      {at(pupils?.right, pupil(rig.pupilRight))}
      {eyes === 'open' ? null : <Layer xml={eye(eyes === 'half' ? rig.half : layers.eyes[eyes])} width={width} height={height} />}
      <Layer xml={eye(layers.brows[brows])} width={width} height={height} />
      <Layer xml={fur(layers.mouths[mouth])} width={width} height={height} />
      {at(sniff ? [sniff, sniffAt] : null, fur(layers.overlay))}
    </>
  );
}
