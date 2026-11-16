import { useState } from 'react';
import { storyCoverFor } from '@kurda/shared';

/**
 * A story's cover (design notes §7): the picture its editor chose from the
 * shared list of covers (shared `STORY_COVERS` — the legends' own paintings
 * and the shop's scenes and kilims, the same list the admin offers), or, for
 * a story without one, one of the seven painted kilims. Which kilim is the
 * story's own for good: the shared `storyCoverFor` takes it from the slug, so
 * the library, the story's page and the phone all lay a story on the same
 * rug, and a shelf of stories without pictures is a row of different rugs.
 *
 * Under the picture is a plain ground in the rug's main colour: what the box
 * shows while the picture is on its way, and all it shows if the picture will
 * not load — never a broken image. A key the list does not know (a picture
 * taken out since) is no cover, and the story gets its rug. Decorative
 * throughout: the title beside it is what names the story.
 *
 * Fills whatever box it is given (`.story-cover`), so the card and the page's
 * wide band share one drawing. A card's picture waits until it is near the
 * screen; the story page's own (`eager`) is the first thing on it, so it is
 * asked for at once.
 *
 * `ref` reaches the cover's box: a card's cover is what travels to the
 * story's page when the card is pressed, and back again
 * (lib/viewTransition.tsx).
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
  // the picture that would not load, so the plain ground is left until the story is given another
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
