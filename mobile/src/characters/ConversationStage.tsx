import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  characterArt,
  conversationLineVoice,
  gazeTargets,
  isSpeakerId,
  lookAcross,
  standTogether,
  togetherBackdrop,
  type ConversationLine,
  type ConversationSpeaker,
  type RecordingVoice,
  type SpeakerId,
} from '@kurda/shared';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import { STAGE_HEIGHT, type PlaybackClock } from './voice';

export interface ConversationStageProps {
  /** the conversation's parts, each played by a character of its own (`conversationCast`) */
  speakers: readonly ConversationSpeaker[];
  lines: readonly ConversationLine[];
  /** each line's recording's voice, as it was saved; only its timeline is used, never whom it was saved under */
  voices: ReadonlyArray<RecordingVoice | null>;
  /** the line being said: the one playing now, or else the one heard last; null before any has been */
  at: number | null;
  /** that line's recording */
  source: string | null;
  /** whether it is sounding now */
  playing: boolean;
  /** the player it plays in; null while it has none */
  player: PlaybackClock | null;
  /** the screen reads right to left, so the first part stands on the right, where its lines start */
  rtl?: boolean;
  /** what they have all just seen: the learner's answer graded */
  reaction?: CharacterReaction | null;
}

/** Room left above the heads, so none touches the top edge. */
const HEADROOM = spacing.md;

/** How far over the stage's top edge a hop may carry a head, as a share of the stage's height, as on a lesson's own stage. */
const HOP_ROOM = 0.3;

/** The character playing each part, when every part has one this app can draw; else null, and the conversation is read without a stage. */
export function conversationCast(speakers: readonly { character?: unknown }[]): SpeakerId[] | null {
  const cast = speakers.map((s) => s.character);
  return cast.length > 0 && cast.every(isSpeakerId) ? cast : null;
}

/**
 * The people in a conversation together on one stage, above its lines: side
 * by side in their own light (shared `standTogether`, `togetherBackdrop`),
 * each drawn whole and cut off at the waist by the stage's foot, and looking
 * at each other.
 *
 * Whoever says the line being heard says it, lip-synced to the sound, and the
 * others listen with their mouths still. Everyone looks at the one saying it,
 * who looks back at whoever spoke before them (shared `gazeTargets`). A line
 * is always said by the character playing its part, whatever voice its
 * recording was saved under (shared `conversationLineVoice`).
 *
 * Only a picture: the lines below already say who says what, so a screen
 * reader passes over it, and it takes no touch.
 */
export function ConversationStage({
  speakers,
  lines,
  voices,
  at,
  source,
  playing,
  player,
  rtl = false,
  reaction = null,
}: ConversationStageProps): React.JSX.Element {
  const { colors } = useTheme();
  const screen = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const height = STAGE_HEIGHT.card;
  // until the stage has been laid out, the window's width less the screen's margins stands in for its own
  const across = width > 0 ? width : screen.width - spacing.lg * 2;
  const places = useMemo(
    () => standTogether((conversationCast(speakers) ?? []).map((id) => characterArt(id)), across, height, HEADROOM, rtl),
    [speakers, across, height, rtl],
  );
  const dark = colors.scheme === 'dark';
  const backdrop = useMemo(() => (width > 0 && places.length > 0 ? togetherBackdrop(places, width, height, { dark }) : null), [places, width, height, dark]);
  const hop = Math.round(height * HOP_ROOM);

  const line = at === null ? undefined : lines[at];
  const looks = gazeTargets(places.length, lines, at);

  return (
    <View
      style={[styles.stage, { height, backgroundColor: colors.surface }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      pointerEvents="none"
      // both platforms: VoiceOver's elements-hidden and TalkBack's no-hide-descendants
      aria-hidden
      testID="conversation-stage"
    >
      <View style={styles.backdrop}>{backdrop ? <SvgXml xml={backdrop} width={width} height={height} /> : null}</View>
      {/* cut off at the stage's foot, and free to hop out over its top */}
      <View style={[styles.figures, { top: -hop }]}>
        {places.map((place) => {
          const art = characterArt(place.id);
          // the one whose line it is says it, in the voice of the character playing the part; the rest listen
          const said =
            line !== undefined && at !== null && line.speaker === place.part
              ? { voice: conversationLineVoice(speakers, line, voices[at]), text: line.text, player, playing, source }
              : { player: null, playing: false, quiet: true };
          return (
            <View
              key={place.part}
              style={[styles.figure, { left: place.left, top: hop + place.top, width: (place.height * art.viewBox.w) / art.viewBox.h, height: place.height }]}
            >
              <SpeakingCharacter
                {...said}
                speaker={place.id}
                crop="full"
                height={place.height}
                flip={place.mirrored}
                gaze={lookAcross(place, places[looks[place.part] ?? place.part] ?? place)}
                reaction={reaction}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: radii.xl },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.xl, overflow: 'hidden' },
  figures: { position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomLeftRadius: radii.xl, borderBottomRightRadius: radii.xl, overflow: 'hidden' },
  figure: { position: 'absolute' },
});
