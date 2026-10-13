import { WarningDialog } from './WarningDialog';

/**
 * What can appear over any screen once you are signed in: a warning to read
 * once. Mounted once, after the navigator, so it sits above every screen.
 */
export function SocialOverlays(): React.JSX.Element {
  return <WarningDialog />;
}
