import type { ReactNode } from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import type { RecordingVoice } from '@kurda/shared';
import { CharacterStage } from '../../characters/CharacterStage';
import { HevaloWindow } from '../../characters/HevaloWindow';
import type { CharacterReaction } from '../../characters/SpeakingCharacter';
import { useDirection } from '../../reports/direction';
import { display, displayFont } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/tokens';
import type { AudioControls } from '../useAudio';
import { useValley } from '../ValleyScope';
import { CARD } from '../valley';

/** The stage the character beside a bubble stands on, head to waist; Hevalo's window is as wide when standing in. */
const FIGURE = 150;
const FIGURE_WIDTH = 118;
const WINDOW = 134;

/** Past this length a bubble holds a scene in sentences rather than a spoken line. */
const A_LINE = 48;

/**
 * How a bubble's words are set, in the display face: a spoken line ("Silav! Bi xêr hatî!") large and heavy, a scene
 * of a few sentences a size smaller at regular weight, so it reads as a paragraph rather than a headline.
 */
export function saidStyle(words: string | undefined): TextStyle {
  return (words?.length ?? 0) <= A_LINE ? LINE : SCENE;
}

const LINE: TextStyle = display(21);
const SCENE: TextStyle = { fontFamily: displayFont, fontSize: typography.sizes.md + 1, lineHeight: 25, fontWeight: typography.weights.regular };

/** A one-line bubble's height. */
const BUBBLE = 56;

/** The one tight corner, at the foot on the speaker's side, where the bubble comes from them without a tail. */
const TIGHT = 6;

/**
 * A speech bubble: a cream card on a sandy edge with its tight corner toward its speaker. Tapped, it calls `onPress`
 * (say it again), with `accessibilityLabel` naming it.
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
  const valley = useValley();
  const look = [styles.bubble, tail === 'left' ? styles.tightLeft : styles.tightRight, { backgroundColor: valley.card, borderColor: valley.line }];
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [look, pressed && { backgroundColor: valley.redWash }]}
    >
      {children}
    </Pressable>
  ) : (
    <View style={look}>{children}</View>
  );
}

/**
 * Who asks and what they say: a character, head to waist, with a bubble whose tight corner faces them (mirrored in
 * right-to-left languages). The character is whoever says the recording, lip-synced and repeating it when tapped;
 * with nobody chosen, Hevalo listens at his window instead, hidden from screen readers since he says nothing.
 * Either reacts to the verdict: pleased when right, a curious tilt when not.
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
  /** Who says the recording, when the app can draw them. */
  voice: RecordingVoice | null;
  /** The recording's player, when there is one to follow. */
  audio: AudioControls | null;
  reaction: CharacterReaction | null;
  /** Says it again, on a tap on the speaker. */
  onReplay?: () => void;
  /** The bubble as its own button (a clip to replay) and its label; plain words otherwise. */
  bubble?: { onPress: () => void; label: string } | null;
  /** Under the bubble, on its side: the slow play. */
  below?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const dir = useDirection();
  const says = !!voice && !!audio?.supported;
  const speaker = voice?.speaker ?? 'hevalo';
  return (
    <View style={[styles.scene, { flexDirection: dir.row }]} testID="prompt-scene">
      {/* On their own small stage and light, cut off at the waist; or Hevalo standing in, at his window. */}
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
  // The bubble's foot level with the speaker's, where its tight corner meets them.
  scene: { alignItems: 'flex-end', gap: spacing.sm + 2 },
  figure: { width: FIGURE_WIDTH },
  side: { flex: 1, gap: spacing.xs },
  bubble: {
    minHeight: BUBBLE,
    borderWidth: CARD.edge,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md - 2,
    justifyContent: 'center',
  },
  tightLeft: { borderBottomLeftRadius: TIGHT },
  tightRight: { borderBottomRightRadius: TIGHT },
  below: { paddingHorizontal: spacing.xs },
});
