import { Suspense, lazy, useRef, useState, type ReactNode } from 'react';
import './soon.css';

/**
 * What a tap on "Download for iOS" or "Download for Android" opens while the phone apps are not out: the page blurs and
 * dims, a card rises from the button that was tapped, and the pen-pal pigeon flies in with a letter that unfolds to say
 * the apps are coming and that everything can start here today. It opens on the platform that was tapped, and a switch
 * at its top turns it to the other, the letter's words crossing over softly. Escape, a tap on the dim, a swipe down and
 * Close all put it away, focus stays inside it, and returns to the button. Under Reduce Motion it simply appears, with
 * the pigeon already perched and the letter open. It asks for nothing: no address, no list to join.
 */

export type AppPlatform = 'ios' | 'android';

/** The card and its pigeon, fetched once, the first time someone might open it (AppSoonCard.tsx). */
let card: Promise<typeof import('./AppSoonCard')> | null = null;
function preloadCard(): Promise<typeof import('./AppSoonCard')> {
  card ??= import('./AppSoonCard');
  card.catch(() => (card = null));
  return card;
}
const AppSoonCard = lazy(() => preloadCard().then((m) => ({ default: m.AppSoonCard })));

/**
 * A button that opens the card. Every iOS and Android link on the public pages is one of these: a dark store button
 * on the front page (`store`), or a line of the footer (`line`).
 */
export function AppSoonButton({ platform, look, children }: { platform: AppPlatform; look: 'store' | 'line'; children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={look === 'store' ? 'fp-store' : 'soon-footer reach-line'}
        aria-haspopup="dialog"
        onPointerEnter={() => void preloadCard()}
        onFocus={() => void preloadCard()}
        onTouchStart={() => void preloadCard()}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open && (
        <Suspense fallback={null}>
          <AppSoonCard platform={platform} opener={ref} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
