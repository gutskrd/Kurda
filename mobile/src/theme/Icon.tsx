import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from './ThemeProvider';

/**
 * Skeuomorphic SVG icon set (KUR-268 icon pass). Replaces the app's emoji with
 * crisp vector glyphs that carry real depth: each icon is painted with a
 * vertical light→dark gradient of its tint (a beveled sheen), a soft white top
 * highlight, and a dark bottom shadow edge — the classic emboss. One component,
 * one `name`, themed by the active palette.
 *
 * Paths are authored on a 24×24 grid as filled silhouettes.
 */
export type IconName =
  | 'home'
  | 'play'
  | 'book'
  | 'people'
  | 'person'
  | 'bolt'
  | 'speaker'
  | 'star'
  | 'star-outline'
  | 'cart'
  | 'trophy'
  | 'palette'
  | 'chat'
  | 'gear'
  | 'bell'
  | 'sun'
  | 'coin'
  | 'gem'
  | 'flame'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'sparkle'
  | 'ice'
  | 'moon';

/** 24×24 filled-silhouette path data, keyed by icon name. */
const PATHS: Record<IconName, string> = {
  home: 'M12 2.6 1.5 12.2h3V21h5.2v-5.6h4.6V21H21v-8.8h3L12 2.6Z',
  // rounded game controller
  play:
    'M7.5 7h9a5.5 5.5 0 0 1 5.4 4.5l.7 4A3.2 3.2 0 0 1 16.4 17l-1.3-1.5H8.9L7.6 17A3.2 3.2 0 0 1 1.4 15.5l.7-4A5.5 5.5 0 0 1 7.5 7Zm-1 3.2v1.6H4.9v1.6H6.5v1.6h1.6v-1.6h1.6v-1.6H8.1v-1.6H6.5Zm9.2.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm2.4 2.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z',
  // open book, two pages
  book: 'M11 4.4C8.2 2.9 5.3 2.9 2.6 4.4v15c2.7-1.5 5.6-1.5 8.4 0V4.4Zm2 0v15c2.8-1.5 5.7-1.5 8.4 0v-15C18.7 2.9 15.8 2.9 13 4.4Z',
  // two people
  people:
    'M8.7 4.2a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2ZM16.4 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2ZM2.5 20c0-4.1 2.8-6.2 6.2-6.2s6.2 2.1 6.2 6.2H2.5Zm14.2-4.9c2.9.1 4.8 2 4.8 4.9h-4.1c0-1.9-.6-3.6-1.6-4.9.3 0 .6 0 .9 0Z',
  // single person
  person: 'M12 3.6a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 0 0 0-8.2ZM4 20.4c0-4.4 3.6-6.8 8-6.8s8 2.4 8 6.8H4Z',
  bolt: 'M13.4 2 4 13.4h6L9.2 22 20 9.6h-6.4L13.4 2Z',
  speaker:
    'M11 4.2 6.2 8.2H3.2A1 1 0 0 0 2.2 9.2v5.6a1 1 0 0 0 1 1h3L11 19.8V4.2Zm3.4 3.2a1 1 0 0 1 1.4.2 6.5 6.5 0 0 1 0 8.8 1 1 0 1 1-1.5-1.3 4.5 4.5 0 0 0 0-6.2 1 1 0 0 1 .1-1.5Zm2.7-2.6a1 1 0 0 1 1.4.1 10 10 0 0 1 0 13.2 1 1 0 1 1-1.5-1.3 8 8 0 0 0 0-10.6 1 1 0 0 1 .1-1.4Z',
  star: 'M12 2.4 15 8.9l7.1.8-5.3 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2.9 9.7 10 8.9 12 2.4Z',
  'star-outline':
    'M12 2.4 15 8.9l7.1.8-5.3 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2.9 9.7 10 8.9 12 2.4Zm0 4.9-1.7 3.6-3.9.4 2.9 2.7-.8 3.9L12 18l3.5 2-.8-3.9 2.9-2.7-3.9-.4L12 7.3Z',
  cart: 'M2 3h2.2l.9 2h14.7a1 1 0 0 1 1 1.3l-2 6.4a1 1 0 0 1-1 .7H8.3l-.4 1.6H19v2H6.6a1 1 0 0 1-1-1.3L7.5 13 5 5.3 4 3H2V3Zm6.5 16.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Zm9 0a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z',
  trophy:
    'M6 3h12v2h3v3a4 4 0 0 1-4 4h-.4A6 6 0 0 1 13 15.8V18h3v2H8v-2h3v-2.2A6 6 0 0 1 7.4 12H7a4 4 0 0 1-4-4V5h3V3Zm0 4H5v1a2 2 0 0 0 1 1.7V7Zm12 0v2.7A2 2 0 0 0 19 8V7h-1Z',
  palette:
    'M12 3a9 9 0 0 0 0 18 2.4 2.4 0 0 0 2.4-2.4c0-.6-.2-1.1-.6-1.5a2.4 2.4 0 0 1 1.8-4H18a3 3 0 0 0 3-3c0-4.1-4-7.1-9-7.1Zm-4.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm2-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z',
  chat: 'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  gear:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 3.5-2.1-1.6.3-2.6-2.5-.8-1.3-2.3-2.5.6L11 3l-1.9 2.3-2.5-.6-1.3 2.3-2.5.8.3 2.6L1 12l2.1 1.6-.3 2.6 2.5.8 1.3 2.3 2.5-.6L11 21l1.9-2.3 2.5.6 1.3-2.3 2.5-.8-.3-2.6L21 12Z',
  bell: 'M12 2.5a5.5 5.5 0 0 0-5.5 5.5v3.5L4.5 15v1.5h15V15l-2-3.5V8A5.5 5.5 0 0 0 12 2.5ZM9.5 18a2.5 2.5 0 0 0 5 0h-5Z',
  // Kurdish sun: 8-pointed radiant star
  sun: 'M12 1.5 14 7l4-3.7-1 5.4 5.4-1L18.7 11 24 12l-5.3 1 3.7 4.3-5.4-1 1 5.4L14 18l-2 5.5L10 18l-4 3.7 1-5.4-5.4 1L11 13l-5.5-1L11 11 7.3 6.7l5.4 1-1-5.4L12 6l0-4.5Z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3.5c2.2 0 4 .8 4 2S14.2 12 12 12s-4-.8-4-1.5.8-1.5 4-1.5Zm-4 4.6C9 11.7 10.4 12 12 12s3-.3 4-.9v2c0 1.2-1.8 2-4 2s-4-.8-4-2v-2Z',
  gem: 'M7 3h10l4 5-9 12L3 8l4-5Zm.5 2L5 8h4L10.5 5H7.5Zm5.5 0-1.5 3h5L14 5h-1.5ZM6 9l4 8V9H6Zm8 0v8l4-8h-4Z',
  flame:
    'M13.5 2c.6 3-1.2 4.6-2.8 6.2C9 9.9 7 11.7 7 14.7A5.3 5.3 0 0 0 12.3 20a5 5 0 0 0 5-5c0-1.9-.8-3.4-1.7-4.6-.3 1-1 1.7-1.9 2 .6-2.3-.2-4.6-1.6-6.4-.4-.5-.9-1-1.6-2Z',
  close: 'M6 4.6 4.6 6 10.6 12 4.6 18 6 19.4 12 13.4 18 19.4 19.4 18 13.4 12 19.4 6 18 4.6 12 10.6 6 4.6Z',
  'chevron-left': 'M15.4 5.4 8.8 12l6.6 6.6 1.4-1.4L11.6 12l5.2-5.2-1.4-1.4Z',
  'chevron-right': 'M8.6 5.4 7.2 6.8 12.4 12l-5.2 5.2 1.4 1.4L16 12 8.6 5.4Z',
  sparkle: 'M12 2c.8 4.2 2.8 6.2 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.8 6.2-2.8 7-7Z',
  // filled 6-point snowflake / ice crystal
  ice: 'M12 1.5l1.7 3.6 3.9-1-1 3.9 3.6 1.7-3.6 1.7 1 3.9-3.9-1L12 19.5l-1.7-3.7-3.9 1 1-3.9L2.9 12l3.6-1.7-1-3.9 3.9 1L12 1.5Z',
  moon: 'M13 2.5A9.5 9.5 0 1 0 21.5 15 7.5 7.5 0 0 1 13 2.5Z',
};

/**
 * Render a skeuomorphic icon. `color` defaults to the theme's primary tint;
 * pass `tone="onPrimary"` on primary-filled buttons, or an explicit color.
 */
export function Icon({
  name,
  size = 24,
  color,
  tone,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  tone?: 'primary' | 'secondary' | 'onPrimary';
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const base =
    color ??
    (tone === 'onPrimary'
      ? colors.textOnPrimary
      : tone === 'secondary'
        ? colors.textSecondary
        : tone === 'primary'
          ? colors.primary
          : colors.textPrimary);
  const d = PATHS[name];
  const gid = `ig-${name}`;
  const inset = size * 0.03; // room for the emboss highlight/shadow offsets

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.18} />
          </LinearGradient>
        </Defs>
        {/* dark shadow edge (down) */}
        <Path d={d} fill="#000000" opacity={0.28} transform={`translate(0 ${inset})`} />
        {/* light highlight edge (up) */}
        <Path d={d} fill="#FFFFFF" opacity={0.45} transform={`translate(0 ${-inset})`} />
        {/* solid face in the icon tint */}
        <Path d={d} fill={base} />
        {/* beveled sheen: light top → dark bottom over the face */}
        <Path d={d} fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}
