import { HAND_PHONE_SCREEN, HAND_PHONE_VIEW, handPhoneSvg } from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';

/**
 * The phone section's picture: a hand holding a phone, and Hevalo on its screen looking out, blinking and glancing about
 * now and then. The hand and phone are two drawn layers with the live screen laid on the glass between them, so the
 * fingers and thumb rest over it. The section's stylesheet floats the whole picture slowly, still under Reduce Motion.
 */
const BACK = { __html: handPhoneSvg({ part: 'back', idPrefix: 'fpPhoneBack' }) };
const FRONT = { __html: handPhoneSvg({ part: 'front', idPrefix: 'fpPhoneFront' }) };

/** The glass, placed and turned on the panel in shares of its size, so it stays on the drawing at any width. */
const share = (v: number, of: number): string => `${(v / of) * 100}%`;
const S = HAND_PHONE_SCREEN;
const SCREEN: React.CSSProperties = {
  left: share(S.cx - S.w / 2, HAND_PHONE_VIEW.w),
  top: share(S.cy - S.h / 2, HAND_PHONE_VIEW.h),
  width: share(S.w, HAND_PHONE_VIEW.w),
  height: share(S.h, HAND_PHONE_VIEW.h),
  borderRadius: `${share(S.r, S.w)} / ${share(S.r, S.h)}`,
  transform: `rotate(${S.turn}deg)`,
};

export function PhoneArt(): React.JSX.Element {
  return (
    <div className="fp-phone-hold" aria-hidden="true">
      <span className="fp-phone-layer" dangerouslySetInnerHTML={BACK} />
      <span className="fp-phone-screen" style={SCREEN}>
        <SpeakingCharacter speaker="hevalo" audio={null} crop="bust" decorative />
      </span>
      <span className="fp-phone-layer" dangerouslySetInnerHTML={FRONT} />
    </div>
  );
}
