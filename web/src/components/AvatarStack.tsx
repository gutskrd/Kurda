import { PersonGlyph } from './icons';

/**
 * A MyKurda stack of up to 3 overlapping thumbnails with a "+N" chip for the
 * rest (e.g. the 3 most recent friends, then +N). Purely presentational — the
 * caller passes already-resolved image URLs and the true total count.
 */
export function AvatarStack({
  urls,
  total,
  max = 3,
  square = false,
  emptyGlyph = true,
}: {
  urls: Array<string | null | undefined>;
  total: number;
  max?: number;
  /** rounded-square thumbs (icons/badges) vs circles (friends) */
  square?: boolean;
  emptyGlyph?: boolean;
}): React.JSX.Element | null {
  const shown = urls.slice(0, max);
  const overflow = total - shown.length;
  if (total <= 0) return null;
  return (
    <div className={`avatar-stack${square ? ' avatar-stack-square' : ''}`}>
      {shown.map((url, i) => (
        <span className="avatar-stack-item" key={i} style={{ zIndex: max - i }}>
          {url ? <img src={url} alt="" loading="lazy" /> : emptyGlyph ? <PersonGlyph size={16} /> : null}
        </span>
      ))}
      {overflow > 0 && <span className="avatar-stack-more">+{overflow}</span>}
    </div>
  );
}
