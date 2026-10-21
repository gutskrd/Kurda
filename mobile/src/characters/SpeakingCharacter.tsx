import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  CHARACTER_NAMES,
  speakingFrame,
  voiceTimeline,
  type RecordingVoice,
  type SpeakerId,
  type SpeakingFrame,
  type Viseme,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { Rise } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { characterLayers, type CharacterCrop } from './layers';
import { stageSize, type PlaybackClock } from './voice';

export { CHARACTER_SIZE, knownVoice, type PlaybackClock } from './voice';

/** How wide a lesson's character is in this window (`stageSize`). */
export function useStageSize(): number {
  return stageSize(useWindowDimensions().width);
}

export interface SpeakingCharacterProps {
  speaker: SpeakerId;
  /** the player the screen already plays the recording with; null before it has one */
  player: PlaybackClock | null;
  /** whether the screen is playing this recording now: the character follows it only then */
  playing: boolean;
  /** the recording, so that another one starts from its own timeline */
  source?: string | null;
  voice?: RecordingVoice | null;
  /** the words said, to move the mouth from when the recording has no timeline of its own */
  text?: string | null;
  /** head and shoulders in a rounded tile, or the whole figure on nothing */
  crop?: CharacterCrop;
  /** how wide it is drawn, in points; the height follows from the drawing */
  size: number;
  /** turned the other way round, to face what lies to its left */
  flip?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface Face {
  mouth: Viseme;
  eyes: 'open' | 'closed';
}

const AT_REST: SpeakingFrame = { mouth: 'rest', eyes: 'open', nod: 0 };

/** The widest a nod turns, with room to spare: Animated maps the angle onto a string. */
const NOD_RANGE = 10;

/** A bust this wide or wider sits in the larger corner. */
const LARGE_TILE = 88;

/**
 * One part of the drawing. Memoised on its markup, so when the mouth changes
 * the body, the head and the eyes are not drawn again.
 */
const Layer = memo(function Layer({ xml, width, height }: { xml: string; width: number; height: number }) {
  return <SvgXml xml={xml} width={width} height={height} style={styles.layer} />;
});

/**
 * Hevalo, Hamo or Xezo saying the recording the screen is playing.
 *
 * The character follows the screen's own player — never a second one — by
 * reading where the recording is on every animation frame while it plays,
 * and works out the face for that moment with `speakingFrame`, the same as
 * the website does. The mouth follows the recording's timeline, or one made
 * from the words once the recording's length is known (`voiceTimeline`).
 *
 * Drawn as stacked layers in one frame: the body and the head once, the eyes
 * and the mouth as two small drawings over them. Only a part that changes is
 * drawn again, and the face changes only when the shape of the mouth or the
 * eyes does; the nod is a turn of the head's view about the neck, set on the
 * Animated value directly, which redraws nothing at all.
 *
 * Still between recordings: nothing moves while somebody is reading. The
 * frames stop when the recording does, when the screen goes and when the app
 * is sent to the background. Under Reduce Motion the head does not nod and
 * the character does not rise in; the mouth still moves, since it says what
 * the sound says.
 *
 * It takes no touches, so it never stands in the way of a play button.
 */
export function SpeakingCharacter({
  speaker,
  player,
  playing,
  source = null,
  voice = null,
  text = null,
  crop = 'bust',
  size,
  flip = false,
  style,
}: SpeakingCharacterProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const layers = characterLayers(speaker, crop);
  const height = (size * layers.frame.h) / layers.frame.w;

  const [face, setFace] = useState<Face>(AT_REST);
  const shown = useRef<SpeakingFrame>(AT_REST);
  const nod = useRef(new Animated.Value(0)).current;
  const born = useRef(Date.now());
  const [awake, setAwake] = useState(AppState.currentState !== 'background');

  // the recording's length once the player knows it, kept with the recording it belongs to
  const [length, setLength] = useState<{ source: string | null; ms: number } | null>(null);
  const durationMs = length && length.source === source ? length.ms : null;
  const timeline = useMemo(() => voiceTimeline(voice, text, durationMs), [voice, text, durationMs]);

  const show = useCallback(
    (next: SpeakingFrame) => {
      const was = shown.current;
      if (was.nod !== next.nod) nod.setValue(next.nod);
      if (was.mouth !== next.mouth || was.eyes !== next.eyes) setFace({ mouth: next.mouth, eyes: next.eyes });
      shown.current = next;
    },
    [nod],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAwake(state !== 'background'));
    return () => sub.remove();
  }, []);

  const live = playing && player !== null && awake;
  useEffect(() => {
    if (!live || !player) {
      show(AT_REST);
      return;
    }
    let frame: number | null = null;
    let measured = durationMs !== null;
    const tick = (): void => {
      const seconds = player.duration;
      if (!measured && Number.isFinite(seconds) && seconds > 0) {
        measured = true;
        setLength({ source, ms: Math.round(seconds * 1000) });
      }
      show(
        speakingFrame({
          timeline,
          ms: player.currentTime * 1000,
          playing: player.playing,
          sinceMs: Date.now() - born.current,
          reducedMotion: reduce,
        }),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [live, player, timeline, durationMs, source, reduce, show]);

  const turn = useMemo(
    () => ({
      transformOrigin: `${layers.pivot.x * 100}% ${layers.pivot.y * 100}%`,
      transform: [{ rotate: nod.interpolate({ inputRange: [-NOD_RANGE, NOD_RANGE], outputRange: [`-${NOD_RANGE}deg`, `${NOD_RANGE}deg`] }) }],
    }),
    [layers, nod],
  );

  const tile: ViewStyle | null =
    crop === 'bust' ? { borderRadius: size >= LARGE_TILE ? radii.lg : radii.md, backgroundColor: colors.controlTrack } : null;

  return (
    <Rise delay={reduce ? null : 0} style={[{ width: size, height }, style]}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('characters.saidBy', { name: CHARACTER_NAMES[speaker] })}
        pointerEvents="none"
        style={[styles.frame, tile, flip && styles.flip]}
      >
        <Layer xml={layers.body} width={size} height={height} />
        <Animated.View style={[StyleSheet.absoluteFill, turn]}>
          <Layer xml={layers.head} width={size} height={height} />
          <Layer xml={layers.eyes[face.eyes]} width={size} height={height} />
          <Layer xml={layers.mouths[face.mouth]} width={size} height={height} />
          {layers.overlay ? <Layer xml={layers.overlay} width={size} height={height} /> : null}
        </Animated.View>
      </View>
    </Rise>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  layer: { position: 'absolute', left: 0, top: 0 },
  flip: { transform: [{ scaleX: -1 }] },
});
