import { GiftArrivals } from '../gifts/GiftArrivals';
import { BagNews } from '../gifts/BagNews';
import { WarningDialog } from './WarningDialog';

/**
 * What can appear over any screen once signed in: a gift just arrived somewhere else, a small gift that landed in the
 * gift bag, and a warning to read once.
 * Mounted once, after the navigator, so it sits above every screen.
 */
export function SocialOverlays(): React.JSX.Element {
  return (
    <>
      <GiftArrivals />
      <BagNews />
      <WarningDialog />
    </>
  );
}
