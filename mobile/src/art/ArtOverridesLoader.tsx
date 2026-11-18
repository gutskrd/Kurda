import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { deviceStore } from '../keyboard/deviceStore';
import { startArtOverrides } from './overrides';

/**
 * Keeps the uploaded-art list (overrides.ts) current for the app's lifetime. Mounted once at boot; draws nothing.
 * The list is public, so it loads signed in or not.
 */
export function ArtOverridesLoader(): null {
  const { client } = useAuth();
  useEffect(() => startArtOverrides(client, { store: deviceStore, appState: AppState }), [client]);
  return null;
}
