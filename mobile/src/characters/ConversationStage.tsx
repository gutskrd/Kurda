import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  characterArt,
  conversationLineVoice,
  gazeTargets,
  lookAcross,
  stageCast,
  stageLines,
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
import { usePageWidth } from '../theme/pageWidth';

export interface ConversationStageProps {
  /** The conversation's parts, each played by a character of its own (`conversationCast`). */
  speakers: readonly ConversationSpeaker[];
  lines: readonly ConversationLine[];
  /** Each line's recording voice as saved; only its timeline is used, never the speaker it was saved under. */
  voices: ReadonlyArray<RecordingVoice | null>;
  /** The line being said: the one playing now, else the last one heard; null before any. */
  at: number | null;
  /** That line's recording. */
  source: string | null;
  /** Whether it is sounding now. */
  playing: boolean;
  /** The player it plays in; null while it has none. */
  player: PlaybackClock | null;
  /** The screen reads right to left, so the first part stands on the right, where its lines start. */
  rtl?: boolean;
  /** What they have all just seen: the learner's answer graded. */
  reaction?: CharacterReaction | null;
}

/** Room left above the heads, so none touches the top edge. */
const HEADROOM = spacing.md;

/** How far above the stage's top a hop may carry a head, as a share of the stage's height, as on a lesson's stage. */
const HOP_ROOM = 0.3;

/** The character for each part when every part has one this app can draw; else null, and the conversation has no stage. */
export function conversationCast(speakers: readonly { character?: unknown; learner?: unknown }[]): SpeakerId[] | null {
  // The learner's own part is the one the characters face, not one of them.
  return stageCast(speakers);
}

/**
 * A conversation's people together on one stage above its lines: side by side in their own light (shared
 * `standTogether`, `togetherBackdrop`), each drawn whole and cut at the waist, looking at each other.
 *
 * The speaker of the current line lip-syncs to the sound while the others listen with still mouths. Everyone
 * looks at the speaker, who looks back at the previous speaker (shared `gazeTargets`). A line is always said by
 * the character playing its part, whatever voice its recording was saved under (shared `conversationLineVoice`).
 * Decorative: screen readers skip it and it takes no touches.
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
  const pageWide = usePageWidth();
  const [width, setWidth] = useState(0);
  const height = STAGE_HEIGHT.card;
  // Until the stage is laid out, the window width minus the screen margins stands in for its own.
  const across = width > 0 ? width : pageWide - spacing.lg * 2;
  const places = useMemo(
    () => standTogether((conversationCast(speakers) ?? []).map((id) => characterArt(id)), across, height, HEADROOM, rtl),
    [speakers, across, height, rtl],
  );
  const dark = colors.scheme === 'dark';
  const backdrop = useMemo(() => (width > 0 && places.length > 0 ? togetherBackdrop(places, width, height, { dark }) : null), [places, width, height, dark]);
  const hop = Math.round(height * HOP_ROOM);

  // Each line by its speaker on stage; a learner's line by nobody there, so whoever is there looks out at them.
  const staged = useMemo(() => stageLines(speakers, lines), [speakers, lines]);
  const line = at === null ? undefined : staged[at];
  const spoken = at === null ? undefined : lines[at];
  const looks = gazeTargets(places.length, staged, at);

  return (
    <View
      style={[styles.stage, { height, backgroundColor: colors.surface }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      pointerEvents="none"
      // Both platforms: VoiceOver's elements-hidden and TalkBack's no-hide-descendants.
      aria-hidden
      testID="conversation-stage"
    >
      <View style={styles.backdrop}>{backdrop ? <SvgXml xml={backdrop} width={width} height={height} /> : null}</View>
      {/* Cut off at the stage's foot, and free to hop out over its top. */}
      <View style={[styles.figures, { top: -hop }]}>
        {places.map((place) => {
          const art = characterArt(place.id);
          // The one whose line it is says it, in the voice of the character playing the part; the rest listen.
          const said =
            line !== undefined && spoken !== undefined && at !== null && line.speaker === place.part
              ? { voice: conversationLineVoice(speakers, spoken, voices[at]), text: spoken.text, player, playing, source }
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
