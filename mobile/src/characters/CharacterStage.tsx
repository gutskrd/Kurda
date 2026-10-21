import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, LayoutAnimation, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { STAGE_GROUND, characterArt, stageBackdrop } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';
import { SpeakingCharacter, type SpeakingCharacterProps } from './SpeakingCharacter';
import { stageHeight } from './voice';

export interface CharacterStageProps extends Omit<SpeakingCharacterProps, 'crop' | 'size' | 'height' | 'style'> {
  /** the buttons that play what the character says, standing beside it */
  children?: ReactNode;
  /** how much of the window the rest of the screen needs; the stage takes what is left (`stageHeight`) */
  reserve?: number;
}

/** A stage this tall or taller shows the whole figure; a shorter one, head to waist, so the face stays big enough to see. */
const WHOLE_FROM = 240;

/** Where on the stage the character stands, as a share of its width from the start: room on the far side for the buttons. */
const STAND_AT = 0.27;

/**
 * Where a lesson's character stands to say what it says: the whole figure,
 * as large as the screen can spare, in its own light with the Zagros behind
 * it (shared `stageBackdrop`), and the buttons that play it standing beside
 * it on the far side.
 *
 * The character can be tapped: it greets you and says it again, the same as
 * the play button. When the keyboard comes up for an answer the stage steps
 * back to a smaller size, so the field stays in view, and comes forward again
 * when the keyboard goes.
 */
export function CharacterStage({ children, reserve, flip, speaker, ...character }: CharacterStageProps): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const screen = useWindowDimensions();
  const [keyboard, setKeyboard] = useState(false);
  const height = stageHeight(screen.height, keyboard, reserve);
  const [width, setWidth] = useState(0);

  // the stage eases between its sizes as the keyboard comes and goes, rather than jumping, unless motion is turned down
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

  // the feet on the near ridge, the head a little below the top; on a stage too short for a
  // face to be seen in the whole figure, head to waist, standing on the stage's floor
  const whole = height >= WHOLE_FROM;
  const tall = Math.round(whole ? height * STAGE_GROUND - spacing.sm : height - spacing.sm);
  const art = characterArt(speaker);
  const frame = whole ? art.viewBox : art.half;
  const wide = (tall * frame.w) / frame.h;
  const standAt = dir.rtl ? 1 - STAND_AT : STAND_AT;
  const backdrop = useMemo(
    () => (width > 0 ? stageBackdrop(speaker, width, height, standAt, { dark: colors.scheme === 'dark' }) : null),
    [speaker, width, height, standAt, colors.scheme],
  );

  return (
    <View
      style={[styles.stage, { height, backgroundColor: colors.surface }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      testID="character-stage"
    >
      {/* the backdrop keeps to the card's rounded corners; the character may hop out over its top edge */}
      <View style={styles.backdrop} pointerEvents="none">
        {backdrop ? <SvgXml xml={backdrop} width={width} height={height} /> : null}
      </View>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        <View style={[styles.spot, { width: Math.max(wide, width * STAND_AT * 2), paddingBottom: whole ? height * (1 - STAGE_GROUND) : 0 }]}>
          <SpeakingCharacter {...character} speaker={speaker} crop={whole ? 'full' : 'half'} height={tall} flip={flip ?? dir.rtl} />
        </View>
        <View style={styles.controls}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: radii.xl },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.xl, overflow: 'hidden' },
  row: { flex: 1, alignItems: 'stretch' },
  spot: { alignItems: 'center', justifyContent: 'flex-end' },
  controls: { flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: spacing.sm, paddingHorizontal: spacing.md },
});
