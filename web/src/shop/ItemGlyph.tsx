import { itemCategory } from '@kurda/shared';
import { FrameIcon, GiftIcon, PhotoIcon, SparkleIcon, TagIcon } from '../components/icons';

/**
 * What stands in for an item with no picture of its own, by its kind.
 *
 * The Kurdish tag is the one on sale today without art, and it drew as an
 * empty box — so a tag is drawn as a tag, a frame as a frame, and anything
 * else as a parcel. Decorative: the item's name is always written beside it.
 */
export function ItemGlyph({ category, size = 28 }: { category: string; size?: number }): React.JSX.Element {
  switch (itemCategory(category)) {
    case 'tag':
      return <TagIcon size={size} />;
    case 'frame':
      return <FrameIcon size={size} />;
    case 'background':
      return <PhotoIcon size={size} />;
    case 'icon':
      return <SparkleIcon size={size} weight="regular" />;
    default:
      return <GiftIcon size={size} />;
  }
}
