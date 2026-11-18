import { PersonGlyph } from './icons';
import { avatarSrc } from '../lib/cosmetics';
import { useArtOverrides } from '../art/overrides';

/** Up to three overlapping thumbnails and a "+N" chip for the rest, from resolved URLs and the true total. */
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
  /** Rounded squares (icons, badges) instead of circles (friends). */
  square?: boolean;
  emptyGlyph?: boolean;
}): React.JSX.Element | null {
  const overrides = useArtOverrides();
  const shown = urls.slice(0, max);
  const overflow = total - shown.length;
  if (total <= 0) return null;
  return (
    <div className={`avatar-stack${square ? ' avatar-stack-square' : ''}`}>
      {shown.map((url, i) => {
        const src = avatarSrc(url, overrides);
        return (
          <span className="avatar-stack-item" key={i} style={{ zIndex: max - i }}>
            {src ? <img src={src} alt="" loading="lazy" /> : emptyGlyph ? <PersonGlyph size={16} /> : null}
          </span>
        );
      })}
      {overflow > 0 && <span className="avatar-stack-more">+{overflow}</span>}
    </div>
  );
}
