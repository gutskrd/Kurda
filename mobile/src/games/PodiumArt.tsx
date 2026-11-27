import Svg, { G, Path } from 'react-native-svg';
import { PODIUM_ART_BLOCKS, PODIUM_ART_NUMERAL, PODIUM_ART_NUMERALS, PODIUM_ART_STAR, TICKET_ART_BOX, podiumBlockPath } from '@kurda/shared';
import { inkArt } from '../theme/inkArt';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The rankings card's podium (shared ticket.ts), as on the website: three blocks and a star over the first, cut from the
 * same ink as the join ticket with their places in the card's colour (theme/inkArt.ts), on the ticket's canvas, so
 * the two cards on the games page read as a pair. It is decoration; the card says what it is.
 */
export function PodiumArt({ size }: { size: number }): React.JSX.Element {
  const { colors } = useTheme();
  const art = inkArt(colors);
  const [w, h] = [TICKET_ART_BOX.width + 6, TICKET_ART_BOX.height + 12];
  const { width, height } = PODIUM_ART_NUMERAL;
  return (
    <Svg width={size} height={(size * h) / w} viewBox={`-3 -6 ${w} ${h}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PODIUM_ART_BLOCKS.map((block) => (
        <G key={block.place}>
          <Path d={podiumBlockPath(block)} fill={art.body} />
          <Path
            d={PODIUM_ART_NUMERALS[block.place]}
            transform={`translate(${block.x + (block.width - width) / 2} ${block.y + (block.height - height) / 2})`}
            fill="none"
            stroke={art.marks}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      ))}
      <Path d={PODIUM_ART_STAR} fill={art.body} />
    </Svg>
  );
}
