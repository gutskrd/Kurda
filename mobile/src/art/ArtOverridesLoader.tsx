import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { deviceStore } from '../keyboard/deviceStore';
import { startArtOverrides } from './overrides';

/**
 * Keeps the list of uploaded pictures (overrides.ts) for as long as the app
 * runs: mounted once where the app boots, inside the session's provider for
 * its client. Draws nothing. The list is public, so it is loaded the same
 * whether or not anyone is signed in.
 */
export function ArtOverridesLoader(): null {
  const { client } = useAuth();
  useEffect(() => startArtOverrides(client, { store: deviceStore, appState: AppState }), [client]);
  return null;
}
