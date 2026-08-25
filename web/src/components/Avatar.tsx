import { PersonGlyph } from './icons';

/**
 * A small circular user avatar: shows the resolved image when present, otherwise
 * a person silhouette. The URL is already resolved server-side (uploaded photo →
 * default avatar → null), so this is presentation only. When `online` is true a
 * green presence dot is shown.
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
  return (
    <span className="avatar-wrap">
      <span className="friend-avatar" aria-hidden="true">
        {url ? <img src={url} alt="" loading="lazy" /> : <PersonGlyph size={glyphSize} />}
      </span>
      {online && <span className="presence-dot" title="Online" aria-label="Online" role="img" />}
    </span>
  );
}
