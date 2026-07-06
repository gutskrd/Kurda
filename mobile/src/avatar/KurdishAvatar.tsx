import { SvgXml } from 'react-native-svg';
import { kurdishAvatarSvg, DEFAULT_AVATAR, type AvatarConfig } from '@kurda/shared';

/**
 * Renders a Kurdish avatar from its config (KUR-075). The renderer
 * falls back per-layer for unknown item ids, so stale configs from an
 * older app version still draw a complete avatar.
 */
export function KurdishAvatar({
  config,
  size = 96,
}: {
  config?: AvatarConfig | null;
  size?: number;
}) {
  const svg = kurdishAvatarSvg(config ?? DEFAULT_AVATAR, size);
  return <SvgXml xml={svg} width={size} height={size} />;
}
