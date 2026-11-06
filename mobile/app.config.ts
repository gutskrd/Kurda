import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The phone app's build configuration: app.json, plus the one part that
 * depends on the build environment.
 *
 * app.json stays the whole of the static configuration, and is what the app
 * itself reads its version and store addresses from. This file only adds the
 * Google sign-in config plugin, with the reversed iOS client id as the URL
 * scheme Google returns to, and only when the build environment has that id.
 * The app offers Google on iOS only when the same variable is in its bundle
 * (src/auth/googleClientIds.ts), and both are read in the same build, so a
 * binary has the scheme and the button or neither.
 *
 * Self-contained on purpose: the build evaluates this file on its own, and a
 * TypeScript file it imports would not be compiled.
 */

/** Where the build reads the iOS client id; Expo also inlines `EXPO_PUBLIC_*` into the app's bundle. */
export const GOOGLE_IOS_CLIENT_ID_ENV = 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID';

/** The package whose config plugin registers the URL scheme in the iOS project. */
export const GOOGLE_SIGNIN_PLUGIN = '@react-native-google-signin/google-signin';

/** A Google OAuth client id: the project number and a key, then Google's fixed domain. */
const CLIENT_ID = /^([a-z0-9-]+)\.apps\.googleusercontent\.com$/i;

/**
 * The iOS URL scheme for a client id: the id reversed. Null when there is no
 * id, or when what is there is not shaped like one.
 */
export function googleIosUrlScheme(clientId: string | null | undefined): string | null {
  const match = CLIENT_ID.exec(clientId?.trim() ?? '');
  return match ? `com.googleusercontent.apps.${match[1]}` : null;
}

/**
 * The config plugin entry to add, or null when the build has no iOS client id.
 * An id that is set but malformed stops the build with a message saying so: the
 * app would offer Google on the strength of it, and the sign-in could not come
 * back.
 */
export function googleSignInPlugin(iosClientId: string | null | undefined): [string, { iosUrlScheme: string }] | null {
  if (!iosClientId?.trim()) return null;
  const iosUrlScheme = googleIosUrlScheme(iosClientId);
  if (!iosUrlScheme) {
    throw new Error(`${GOOGLE_IOS_CLIENT_ID_ENV} is set but is not a Google OAuth client id (expected <id>.apps.googleusercontent.com).`);
  }
  return [GOOGLE_SIGNIN_PLUGIN, { iosUrlScheme }];
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const google = googleSignInPlugin(process.env[GOOGLE_IOS_CLIENT_ID_ENV]);
  const plugins = [...(config.plugins ?? []), ...(google ? [google] : [])];
  // app.json supplies the name and the slug, which is all that separates a partial config from a whole one
  return { ...config, plugins } as ExpoConfig;
}
