import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Live connectivity (KUR-278). Wraps NetInfo so the UI can react to going
 * offline/online. `isConnected` is `null` while unknown at startup — we treat
 * unknown as online to avoid a false "offline" flash on launch.
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
