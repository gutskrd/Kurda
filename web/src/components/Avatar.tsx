import { PersonGlyph } from './icons';

/**
 * A small circular user avatar: shows the resolved image when present, otherwise
 * a person silhouette. The URL is already resolved server-side (uploaded photo →
 * default avatar → null), so this is presentation only.
 */
export function Avatar({ url, glyphSize = 22 }: { url?: string | null; glyphSize?: number }): React.JSX.Element {
  return (
    <span className="friend-avatar" aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : <PersonGlyph size={glyphSize} />}
    </span>
  );
}
