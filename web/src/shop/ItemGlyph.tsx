import { itemCategory } from '@kurda/shared';
import { FrameIcon, GiftIcon, PhotoIcon, SparkleIcon, TagIcon } from '../components/icons';

/** The stand-in for an item without a picture: a tag, a frame, or otherwise a parcel. Decorative, since its name is beside it. */
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
