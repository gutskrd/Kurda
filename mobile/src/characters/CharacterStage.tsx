import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, LayoutAnimation, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { characterArt, stageBackdrop, stageFigure } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';
import { SpeakingCharacter, type SpeakingCharacterProps } from './SpeakingCharacter';
import { stageHeight } from './voice';

export interface CharacterStageProps extends Omit<SpeakingCharacterProps, 'crop' | 'size' | 'height' | 'style'> {
  /** The buttons that play what the character says, standing beside it. */
  children?: ReactNode;
  /** How much of the window the rest of the screen needs; the stage takes what is left (`stageHeight`). */
  reserve?: number;
  /** A fixed stage height whatever the window, for places with more to show than a lesson exercise (`STAGE_HEIGHT.card`). */
  height?: number;
}

/** Room left above the head on the stage, so it never touches the top edge. */
const HEADROOM = spacing.md;

/** How far above the stage's top a hop may carry the head, as a share of the stage's height, before it is clipped. */
const HOP_ROOM = 0.3;

/** The minimum share of the stage's width for the character's side, from the start; the buttons get the rest. */
const STAND_AT = 0.27;

/**
 * Where a lesson's character stands to speak: head to waist, as large as the screen allows, in its own light
 * (shared `stageBackdrop`), with its play buttons beside it on the far side, or centred when there are no buttons
 * (a speech bubble says the line).
 *
 * The whole figure is drawn with its head just below the stage's top, and the bottom edge cuts it at the waist (a
 * little lower for a wide character). A hop shows the legs rather than a cut edge, and the head may hop above the
 * top. Tapping the character greets and replays, like the play button. When the keyboard opens the stage shrinks
 * so the field stays visible, and grows back when it closes.
 */
export function CharacterStage({ children, reserve, height: fixed, flip, speaker, ...character }: CharacterStageProps): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const screen = useWindowDimensions();
  const [keyboard, setKeyboard] = useState(false);
  const height = fixed ?? stageHeight(screen.height, keyboard, reserve);
  const [width, setWidth] = useState(0);

  // The stage eases between sizes as the keyboard opens and closes, unless motion is reduced.
  const reduced = useRef(reduce);
  reduced.current = reduce;
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const to = (shown: boolean) => () => {
      if (!reduced.current) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboard(shown);
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', to(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', to(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Until the stage is laid out, the window width minus the screen margins stands in for its own.
  const across = width > 0 ? width : screen.width - spacing.lg * 2;
  const shown = stageFigure(speaker, across, height, HEADROOM);
  const art = characterArt(speaker);
  const unit = shown.height / art.half.h;
  const flipped = flip ?? dir.rtl;
  // The whole figure in points, and how far its top and start extend beyond the visible head-to-waist box.
  const whole = { width: art.viewBox.w * unit, height: art.viewBox.h * unit };
  const above = (art.half.y - art.viewBox.y) * unit;
  const aside = (flipped ? art.viewBox.x + art.viewBox.w - (art.half.x + art.half.w) : art.half.x - art.viewBox.x) * unit;
  // With no buttons to stand beside, the character has the whole stage, in the middle of it.
  const spot = children ? Math.max(shown.width, across * STAND_AT * 2) : across;
  const hop = Math.round(height * HOP_ROOM);
  const standAt = (dir.rtl ? across - spot / 2 : spot / 2) / across;
  const backdrop = useMemo(
    () => (width > 0 ? stageBackdrop(speaker, width, height, standAt, { dark: colors.scheme === 'dark' }) : null),
    [speaker, width, height, standAt, colors.scheme],
  );
  // The side the character stands on keeps the card's rounded corner at its foot.
  const corner = dir.row === 'row-reverse' ? { borderBottomRightRadius: radii.xl } : { borderBottomStartRadius: radii.xl };

  return (
    <View
      style={[styles.stage, { height, backgroundColor: colors.surface }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      testID="character-stage"
    >
      <View style={styles.backdrop} pointerEvents="none">
        {backdrop ? <SvgXml xml={backdrop} width={width} height={height} /> : null}
      </View>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <View style={[styles.spot, corner, { width: spot, marginTop: -hop }]} pointerEvents="box-none">
          <View
            style={[styles.figure, { top: hop + HEADROOM - above, left: (spot - shown.width) / 2 - aside, width: whole.width, height: whole.height }]}
          >
            <SpeakingCharacter {...character} speaker={speaker} crop="full" height={whole.height} flip={flipped} />
          </View>
        </View>
        {children ? <View style={styles.controls}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: radii.xl },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.xl, overflow: 'hidden' },
  row: { flex: 1, alignItems: 'stretch' },
  spot: { overflow: 'hidden' },
  figure: { position: 'absolute' },
  controls: { flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: spacing.sm, paddingHorizontal: spacing.md },
});
