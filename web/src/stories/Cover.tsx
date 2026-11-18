import { useState } from 'react';
import { storyCoverFor } from '@kurda/shared';

/**
 * A story's cover: the editor's choice from shared `STORY_COVERS` (the same list the admin offers), or one of the seven
 * painted kilims, picked from the slug by shared `storyCoverFor` so a story has the same rug everywhere. A plain ground
 * in the rug's colour shows while loading and if the picture fails; an unknown key falls back to the rug. Decorative;
 * the title names the story. It fills its box (`.story-cover`); cards load lazily and the story page's (`eager`) at once.
 * `ref` reaches the box, which travels between card and page (lib/viewTransition.tsx).
 */
export function StoryCover({
  slug,
  cover,
  className,
  eager = false,
  ref,
}: {
  slug: string;
  cover: string | null;
  className?: string;
  eager?: boolean;
  ref?: React.Ref<HTMLSpanElement>;
}): React.JSX.Element {
  const art = storyCoverFor({ slug, cover });
  // The picture that failed, so the plain ground stays until the story changes.
  const [failed, setFailed] = useState<string | null>(null);
  const shown = failed !== art.path;
  return (
    <span ref={ref} className={`story-cover${className ? ` ${className}` : ''}`} style={{ backgroundColor: art.ground }} aria-hidden="true">
      {shown && (
        <img src={art.path} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={() => setFailed(art.path)} />
      )}
    </span>
  );
}
