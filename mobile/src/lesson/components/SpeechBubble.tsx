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

/** The stage the character beside a bubble stands on, head to waist; Hevalo's window, standing in, as wide. */
const FIGURE = 150;
const FIGURE_WIDTH = 118;
const WINDOW = 134;

/** Longer than this, what a bubble says is a scene told in sentences rather than a line said. */
const A_LINE = 48;

/**
 * How the words in a bubble are set: in the display face, as the lesson's
 * Kurdish and its questions are. A line said — "Silav! Bi xêr hatî!" — is set
 * large and heavy; a scene told in a few sentences around what is said is set
 * a size smaller in the face's regular weight, so a paragraph of it reads as
 * a paragraph rather than as a headline.
 */
export function saidStyle(words: string | undefined): TextStyle {
  return (words?.length ?? 0) <= A_LINE ? LINE : SCENE;
}

const LINE: TextStyle = display(21);
const SCENE: TextStyle = { fontFamily: displayFont, fontSize: typography.sizes.md + 1, lineHeight: 25, fontWeight: typography.weights.regular };

/** A bubble of one line. */
const BUBBLE = 56;

/** The one corner drawn tight, at the foot on the speaker's side: the bubble comes out of them there, with no tail. */
const TIGHT = 6;

/**
 * A speech bubble, a cream card on a sandy edge like the lesson's answers,
 * its corner at the foot on the side its speaker stands drawn tight, which is
 * where it comes out of them. Tapped, it does `onPress` (says it again);
 * `accessibilityLabel` is what it is for a screen reader then.
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
 * Who asks, and what they say: a character head to waist with a speech bubble
 * beside it, its tight corner toward them — on the right, facing left, in a
 * right-to-left language.
 *
 * The character is whoever says the item's recording, following the sound
 * with their mouth, and saying it again when tapped. With nobody chosen for
 * it, Hevalo puts his head in at the window there instead, listening rather than
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
  // the bubble's foot level with the speaker's, where its tight corner meets them
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
