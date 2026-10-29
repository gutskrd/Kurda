import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { RecordingVoice } from '@kurda/shared';
import { CharacterStage } from '../../characters/CharacterStage';
import { HevaloWindow } from '../../characters/HevaloWindow';
import type { CharacterReaction } from '../../characters/SpeakingCharacter';
import { useDirection } from '../../reports/direction';
import { useTheme } from '../../theme/ThemeProvider';
import { TILE_EDGE, tileTone } from '../../theme/tileTones';
import { radii, spacing } from '../../theme/tokens';
import type { AudioControls } from '../useAudio';

/** The stage the character beside a bubble stands on, head to waist; Hevalo's window, standing in, as wide. */
const FIGURE = 150;
const FIGURE_WIDTH = 118;
const WINDOW = 134;

/** The tail's square, before it is turned to a point. */
const TAIL = 14;

/** A bubble of one line: the tail points out of the middle of it. */
const BUBBLE = 56;

/**
 * A speech bubble, drawn as a tile is — the same quiet edge and face — with a
 * tail on the side its speaker stands. Tapped, it does `onPress` (says it
 * again); `accessibilityLabel` is what it is for a screen reader then.
 */
function SpeechBubble({
  tail,
  onPress,
  accessibilityLabel,
  children,
}: {
  tail: 'left' | 'right';
  onPress?: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { face, edge } = tileTone(colors, 'idle');
  const look = [styles.bubble, { backgroundColor: face, borderColor: edge }];
  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [look, pressed && { backgroundColor: tileTone(colors, 'picked').face }]}
        >
          {children}
        </Pressable>
      ) : (
        <View style={look}>{children}</View>
      )}
      {/* over the bubble's edge, so its point grows out of it with no line across */}
      <View
        pointerEvents="none"
        style={[styles.tail, tail === 'left' ? styles.tailLeft : styles.tailRight, { backgroundColor: face, borderColor: edge }]}
      />
    </View>
  );
}

/**
 * Who asks, and what they say: a character head to waist with a speech bubble
 * beside it, the tail pointing at them — on the right, facing left, in a
 * right-to-left language.
 *
 * The character is whoever says the item's recording, following the sound
 * with their mouth, and saying it again when tapped. With nobody chosen for
 * it, Hevalo leans out of his window there instead, listening rather than
 * saying it — and, since he says nothing, hidden from a screen reader. Either
 * way they react to the verdict: pleased when it was right, a curious tilt of
 * the head when not.
 */
export function PromptScene({
  voice,
  audio,
  reaction,
  onReplay,
  bubble = null,
  below,
  children,
}: {
  /** who says the recording, when the app can draw them */
  voice: RecordingVoice | null;
  /** the recording's player, when there is one to follow */
  audio: AudioControls | null;
  reaction: CharacterReaction | null;
  /** say it again: a tap on whoever says it */
  onReplay?: () => void;
  /** the bubble as a button of its own (a clip to hear again), and what it is called; plain words otherwise */
  bubble?: { onPress: () => void; label: string } | null;
  /** under the bubble, on its side: the slow play */
  below?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const dir = useDirection();
  const says = !!voice && !!audio?.supported;
  const speaker = voice?.speaker ?? 'hevalo';
  return (
    <View style={[styles.scene, { flexDirection: dir.row }]} testID="prompt-scene">
      {/* on a small stage of their own, in their own light, whose foot cuts them off at the waist; Hevalo, standing in, in his window */}
      <View aria-hidden={!says} style={styles.figure}>
        {!says && speaker === 'hevalo' ? (
          <HevaloWindow size={WINDOW} flip={dir.rtl} reaction={reaction} />
        ) : (
          <CharacterStage
            speaker={speaker}
            voice={says ? voice : null}
            player={says ? audio.clock : null}
            playing={says ? audio.playing : false}
            source={says ? audio.source : null}
            height={FIGURE}
            quiet={!says}
            reaction={reaction}
            onPress={says ? onReplay : undefined}
          />
        )}
      </View>
      <View style={styles.side}>
        <SpeechBubble tail={dir.rtl ? 'right' : 'left'} onPress={bubble?.onPress} accessibilityLabel={bubble?.label}>
          {children}
        </SpeechBubble>
        {below ? <View style={[styles.below, { alignItems: dir.rtl ? 'flex-start' : 'flex-end' }]}>{below}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { alignItems: 'center', gap: spacing.md },
  figure: { width: FIGURE_WIDTH },
  side: { flex: 1, gap: spacing.xs },
  bubble: {
    minHeight: BUBBLE,
    borderWidth: TILE_EDGE,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  tail: {
    position: 'absolute',
    top: (BUBBLE - TAIL) / 2,
    width: TAIL,
    height: TAIL,
    transform: [{ rotate: '45deg' }],
  },
  tailLeft: { left: -TAIL / 2 + 0.5, borderLeftWidth: TILE_EDGE, borderBottomWidth: TILE_EDGE },
  tailRight: { right: -TAIL / 2 + 0.5, borderRightWidth: TILE_EDGE, borderTopWidth: TILE_EDGE },
  below: { paddingHorizontal: spacing.xs },
});
