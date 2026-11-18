/**
 * Whether the screen a guide is on is in front, so Hevalo's lines and the landing art stop behind another screen. The
 * navigator's own hook throws outside a navigator, and the intro slides have none, so this reads the navigation context
 * directly and answers "in front" where there is none.
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
