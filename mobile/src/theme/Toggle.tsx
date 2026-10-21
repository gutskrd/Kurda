import { Platform, Switch, type SwitchProps } from 'react-native';
import { haptic } from '../feedback/haptics';
import { useTheme } from './ThemeProvider';

/**
 * The system switch, felt as it flips: the lightest tick there is, for a value
 * that changed under the person's own finger. Everything else is the
 * platform's own control, in the app's two inks.
 */
export function Toggle({ onValueChange, ...rest }: SwitchProps): React.JSX.Element {
  const { colors } = useTheme();
  const thumbColor = useSwitchThumb(rest.value);
  return (
    <Switch
      thumbColor={thumbColor}
      trackColor={{ true: colors.switchOn, false: colors.controlTrack }}
      {...rest}
      onValueChange={(next) => {
        haptic('select');
        onValueChange?.(next);
      }}
    />
  );
}

/**
 * The grip's colour, on Android only.
 *
 * Left alone, Android paints a switch that is on in the build's own accent — a
 * colour that is nowhere else in the app. So it is white, on or off, over
 * the green track, as iOS draws it. iOS keeps its own white grip: giving it a
 * colour takes away the shadow that lets it be seen on a pale track.
 */
export function useSwitchThumb(_on: boolean | undefined): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  return '#FFFFFF';
}
