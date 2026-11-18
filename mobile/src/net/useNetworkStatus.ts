import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Live connectivity from NetInfo. `isConnected` is null while unknown at startup and counts as online, to avoid
 * flashing "offline" on launch.
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    });
    return () => unsubscribe();
  }, []);
  return online;
}
