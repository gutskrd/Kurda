import { Platform, Switch, type SwitchProps } from 'react-native';
import { haptic } from '../feedback/haptics';
import { useTheme } from './ThemeProvider';

/**
 * The system switch, felt as it flips: the lightest tick there is, for a value
 * that changed under the person's own finger. Everything else is the
 * platform's own control, in the app's ink (see `switchOn` in palette.ts):
 * a dark track and a white knob when it is on in light mode, a pale track and
 * a dark knob in dark mode, a grey track with a white knob when it is off.
 */
export function Toggle({ onValueChange, ...rest }: SwitchProps): React.JSX.Element {
  const { colors } = useTheme();
  const onThumb = onKnob(colors.switchOnThumb, colors.scheme);
  return (
    <Switch
      thumbColor={rest.value ? onThumb : colors.switchOffThumb}
      trackColor={{ true: colors.switchOn, false: colors.switchOff }}
      // iOS paints the track of a switch that is off from this, not from trackColor
      ios_backgroundColor={colors.switchOff}
      // react-native-web takes the knob of a switch that is on from its own prop (teal when left out)
      {...({ activeThumbColor: onThumb } as object)}
      {...rest}
      onValueChange={(next) => {
        haptic('select');
        onValueChange?.(next);
      }}
    />
  );
}

/**
 * The knob of a switch that is on.
 *
 * On iOS the knob sits inside its track, so in dark mode it is dark on the
 * pale track. Android and a browser draw it bigger than the track, standing
 * out past its edges onto the page, where a dark knob would vanish into a
 * dark page; there it is white, and stands out against the page instead.
 */
function onKnob(knob: string, scheme: 'light' | 'dark'): string {
  return Platform.OS === 'ios' || scheme === 'light' ? knob : '#FFFFFF';
}
