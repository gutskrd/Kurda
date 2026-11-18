import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { gameEmblemHue, stampBox, stampLook, stampShapeFor, stampSize, stampSvg, type GameEmblem } from '@kurda/shared';
import { useFontScale } from '../a11y/useFontScale';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { typography } from '../theme/tokens';
import { GameArt } from './GameArt';

/**
 * A game as a postage stamp (Hevalo's letters travel by bird): the shared stamp outline in the game's hue, with its
 * cover, its Kurdish name and, where it differs, what the name means. The colours, sizes and glow come from the shared
 * stamp (`stampLook`, `stampSize`), so the website prints the same; every stamp of one width is the same height, so a
 * row stands level.
 *
 * It is a picture, not a control: whoever shows it wraps it in the pressable and names it for screen readers.
 */
export function GameStamp({
  game,
  name,
  meaning,
  width,
  large = false,
  moving = false,
  after = 0,
}: {
  game: GameEmblem;
  name: string;
  /** What the name means, where the interface is not Kurdish; left out when it is the name again. */
  meaning?: string | null;
  width: number;
  /** The stamp put forward today: larger words, and room for them. */
  large?: boolean;
  moving?: boolean;
  after?: number;
}): React.JSX.Element {
  const { scheme } = useTheme();
  // The paper, inks and light for this scheme; the one put forward shines, the others glow quietly.
  const look = stampLook(scheme, gameEmblemHue(game), large);
  // Larger text asks for a taller stamp: the words keep their room, and every stamp in a row grows alike.
  const textScale = useFontScale({ max: TEXT_MAX });
  const { height, pad, art } = stampSize(width, large, textScale);
  const box = stampBox(width, height, look.strength, look.reach);
  // No outline: the light shows where the paper ends.
  const paper = useMemo(
    () => stampSvg({ width, height, paper: look.paper, glow: look.glow, strength: look.strength, reach: look.reach, ...stampShapeFor(width) }),
    [width, height, look.paper, look.glow, look.strength, look.reach],
  );
  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* The paper and its light, which reaches past the stamp's own box on every side. */}
      <View style={[styles.paper, { left: -box.inset, top: -box.inset }]} pointerEvents="none">
        <SvgXml xml={paper} width={box.width} height={box.height} />
      </View>
      <View style={[styles.face, { paddingTop: pad, paddingHorizontal: pad }]}>
        <GameArt game={game} size={art} moving={moving} after={after} />
        <View style={styles.words}>
          <Text style={[large ? styles.nameLarge : [styles.name, nameOn(width)], { color: look.ink }]} numberOfLines={2} maxFontSizeMultiplier={TEXT_MAX}>
            {name}
          </Text>
          {meaning ? (
            // What tells a newcomer what the game is: on the shelf it may take a second line before it is cut short.
            <Text style={[large ? styles.meaningLarge : styles.meaning, { color: look.inkSoft }]} numberOfLines={large ? 1 : 2} maxFontSizeMultiplier={TEXT_MAX}>
              {meaning}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** How far a stamp's words grow with the reader's text size: past this a name of two lines would outgrow any stamp. */
const TEXT_MAX = 1.3;

/**
 * A name a little smaller on a stamp narrower than usual, as the website sets it: two lines of name over two of meaning
 * is the most a stamp holds. At the usual width or wider it is the usual size.
 */
const nameOn = (width: number) => display(Math.round(Math.min(typography.sizes.md, Math.max(15, width * 0.105))));

const styles = StyleSheet.create({
  paper: { position: 'absolute' },
  face: { flex: 1, alignItems: 'center' },
  // The words are centred in what the cover leaves, so a short name does not sit against the picture.
  words: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 2, paddingBottom: 6 },
  name: { ...display(typography.sizes.md), textAlign: 'center' },
  nameLarge: { ...display(typography.sizes.xl), textAlign: 'center' },
  // In the name's ink a little quieter, as one solid colour (`StampLook.inkSoft`).
  meaning: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textAlign: 'center' },
  meaningLarge: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
});
