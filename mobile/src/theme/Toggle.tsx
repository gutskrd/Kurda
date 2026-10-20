import { Switch, type SwitchProps } from 'react-native';
import { haptic } from '../feedback/haptics';

/**
 * The system switch, felt as it flips: the lightest tick there is, for a value
 * that changed under the person's own finger. Everything else is the
 * platform's own control, untouched.
 */
export function Toggle({ onValueChange, ...rest }: SwitchProps): React.JSX.Element {
  return (
    <Switch
      {...rest}
      onValueChange={(next) => {
        haptic('select');
        onValueChange?.(next);
      }}
    />
  );
}
