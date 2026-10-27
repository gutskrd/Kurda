import { PersonGlyph } from './icons';
import { useT } from '../i18n/I18nProvider';
import { useAvatarSrc } from '../art/overrides';

/**
 * A small circular user avatar: shows the resolved image when present, otherwise
 * a person silhouette. The URL is already resolved server-side (uploaded photo →
 * default avatar → null), so this is presentation only — but for a default
 * avatar an admin has replaced, whose new picture is drawn instead
 * (art/overrides.ts). When `online` is true a green presence dot is shown.
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
