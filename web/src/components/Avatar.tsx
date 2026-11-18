import { PersonGlyph } from './icons';
import { useT } from '../i18n/I18nProvider';
import { useAvatarSrc } from '../art/overrides';

/**
 * A small round avatar: the server-resolved image, or a silhouette. An admin's replacement for a default avatar is drawn
 * instead (art/overrides.ts). `online` adds a green presence dot.
 */
export function Avatar({
  url,
  glyphSize = 22,
  online,
}: {
  url?: string | null;
  glyphSize?: number;
  online?: boolean;
}): React.JSX.Element {
  const t = useT();
  const src = useAvatarSrc(url);
  return (
    <span className="avatar-wrap">
      <span className="friend-avatar" aria-hidden="true">
        {src ? <img src={src} alt="" loading="lazy" /> : <PersonGlyph size={glyphSize} />}
      </span>
      {online && <span className="presence-dot" title={t('profile.online')} aria-label={t('profile.online')} role="img" />}
    </span>
  );
}
