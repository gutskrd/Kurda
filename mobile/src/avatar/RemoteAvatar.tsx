import { SvgUri } from 'react-native-svg';
import { apiBaseUrl } from '../api/env';

/**
 * Avatar for OTHER users in lists (leaderboards, games, chat — KUR-079).
 * Loads the server-cached composite SVG; the response carries ETag +
 * cache headers so repeat renders are cheap. Own-avatar surfaces render
 * locally via <KurdishAvatar/> instead.
 */
export function RemoteAvatar({
  userId,
  size = 40,
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? apiBaseUrl('development'),
}: {
  userId: string;
  size?: number;
  baseUrl?: string;
}) {
  return <SvgUri uri={`${baseUrl}/users/${userId}/avatar.svg`} width={size} height={size} />;
}
