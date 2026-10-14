import { GiftArrivals } from '../gifts/GiftArrivals';
import { WarningDialog } from './WarningDialog';

/**
 * What can appear over any screen once you are signed in: a gift that has
 * just arrived somewhere else, and a warning to read once. Mounted once, after
 * the navigator, so it sits above every screen.
 */
export function SocialOverlays(): React.JSX.Element {
  return (
    <>
      <GiftArrivals />
      <WarningDialog />
    </>
  );
}
