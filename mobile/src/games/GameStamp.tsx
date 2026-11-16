import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { STAMP_NIGHT_GLOW, STAMP_SHELF_GLOW, gameEmblemHue, hueSteps, stampBox, stampShapeFor, stampSize, stampSvg, type GameEmblem } from '@kurda/shared';
import { useFontScale } from '../a11y/useFontScale';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { typography } from '../theme/tokens';
import { GameArt } from './GameArt';

/**
 * A game as a stamp: Hevalo's letters travel by bird, so the thing a game is
 * handed over as is a postage stamp.
 *
 * The stamp is the shared outline (shared art `stamp.ts`): pale paper in the
 * game's own hue, perforated on all four sides, giving off a soft light in
 * that hue — full for the stamp put forward today, quieter for a stamp among
 * others, and quieter again by night, where a saturated glow on a dark page
 * glares. On it, the game's cover with its
 * corners rounded, its Kurdish name in the hue's deep shade, and under the
 * name what it means in the reader's language, where the two differ.
 *
 * It is a picture, not a control: whoever shows it wraps it in the thing that
 * is pressed and says its name to a screen reader, so nothing in here is read
 * twice. Every stamp of one width is the same height, whatever its name's
 * length, so a row of them stands level: its sizes, and how much of its light
 * is left among others and by night, are the shared stamp's (`stampSize`),
 * which the website draws from too.
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
  /** what the name means, where the interface is not Kurdish; left out when it is the name again */
  meaning?: string | null;
  width: number;
  /** the stamp put forward today: larger words, and room for them */
  large?: boolean;
  moving?: boolean;
  after?: number;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const hue = hueSteps(scheme, gameEmblemHue(game));
  // larger text asks for a taller stamp: the words keep their room, and every stamp of a row grows alike
  const textScale = useFontScale({ max: TEXT_MAX });
  const { height, pad, art } = stampSize(width, large, textScale);
  // the one put forward shines; a page of them glows quietly, or the page is all light and no stamps
  const strength = (large ? 1 : STAMP_SHELF_GLOW) * (scheme === 'dark' ? STAMP_NIGHT_GLOW : 1);
  const box = stampBox(width, height, strength);
  // by night the palest step is nearly the page's own dark, and the perforations would be lost in it: the paper is a step lighter there
  const sheet = scheme === 'dark' ? hue.wash : hue.tint;
  // no line round it: the light is what shows where the paper ends
  const paper = useMemo(
    () => stampSvg({ width, height, paper: sheet, glow: hue.base, strength, ...stampShapeFor(width) }),
    [width, height, sheet, hue.base, strength],
  );
  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* the paper and its light, which reaches past the stamp's own box on every side */}
      <View style={[styles.paper, { left: -box.inset, top: -box.inset }]} pointerEvents="none">
        <SvgXml xml={paper} width={box.width} height={box.height} />
      </View>
      <View style={[styles.face, { paddingTop: pad, paddingHorizontal: pad }]}>
        <GameArt game={game} size={art} moving={moving} after={after} />
        <View style={styles.words}>
          <Text style={[large ? styles.nameLarge : styles.name, { color: hue.deep }]} numberOfLines={2} maxFontSizeMultiplier={TEXT_MAX}>
            {name}
          </Text>
          {meaning ? (
            <Text style={[large ? styles.meaningLarge : styles.meaning, { color: hue.deep }]} numberOfLines={1} maxFontSizeMultiplier={TEXT_MAX}>
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

const styles = StyleSheet.create({
  paper: { position: 'absolute' },
  face: { flex: 1, alignItems: 'center' },
  // the words are centred in what the cover leaves, so a short name does not sit against the picture
  words: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 2, paddingBottom: 6 },
  name: { ...display(typography.sizes.md), textAlign: 'center' },
  nameLarge: { ...display(typography.sizes.xl), textAlign: 'center' },
  meaning: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textAlign: 'center', opacity: 0.78 },
  meaningLarge: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center', opacity: 0.78 },
});
