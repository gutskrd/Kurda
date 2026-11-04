/**
 * Whether the screen a guide is on is the one in front.
 *
 * Hevalo's lines and the slow drift of a landing screen's art stop when the
 * screen is behind another, so nothing runs for a screen nobody sees. The
 * navigator's own hook throws outside a navigator, and the intro slides are
 * drawn by the app root with no navigator round them, so this reads the
 * navigation context directly and answers "in front" where there is none:
 * such a screen is only mounted while it is shown.
 */
import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

export function useScreenFocus(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => (navigation ? navigation.isFocused() : true));

  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const shown = navigation.addListener('focus', () => setFocused(true));
    const hidden = navigation.addListener('blur', () => setFocused(false));
    return () => {
      shown();
      hidden();
    };
  }, [navigation]);

  return focused;
}
