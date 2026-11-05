import { useId } from 'react';
import { CoinIcon, GemIcon, XpIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * What a leaderboard ranks: this week's XP, or the Zêr or Gewher each person
 * holds now. The ids are the API's (`GET /leaderboards/:type`).
 */
export type BoardType = 'weekly_xp' | 'zer' | 'gewher';

export interface BoardKind {
  key: BoardType;
  labelKey: MessageKey;
  blurbKey: MessageKey;
}

/** In the order the switch offers them: the weekly board first, as it was the only one. */
export const BOARD_KINDS: readonly BoardKind[] = [
  { key: 'weekly_xp', labelKey: 'rankings.board.weeklyXp', blurbKey: 'rankings.board.weeklyXpBlurb' },
  { key: 'zer', labelKey: 'rankings.board.zer', blurbKey: 'rankings.board.zerBlurb' },
  { key: 'gewher', labelKey: 'rankings.board.gewher', blurbKey: 'rankings.board.gewherBlurb' },
];

export function isBoardType(value: string | null): value is BoardType {
  return BOARD_KINDS.some((k) => k.key === value);
}

/** Each board's own picture: the XP bolt, and the app's coin and gem, drawn as everywhere else. */
function KindIcon({ type, size }: { type: BoardType; size: number }): React.JSX.Element {
  if (type === 'zer') return <CoinIcon size={size} />;
  if (type === 'gewher') return <GemIcon size={size} />;
  return <XpIcon size={size} className="rank-by-xp" />;
}

/**
 * The switch between the three boards: a segmented control over real radios,
 * so the arrow keys move it and a screen reader hears one choice of three.
 *
 * A segmented control rather than another row of chips: the chips under it
 * already choose who the board compares you with, and two rows of the same
 * control would read as one long filter. This one changes what the whole
 * board is, as the League | Leaderboard tabs above it change the page, so it
 * looks like them, a size down. All three are always in view, a tap apart;
 * there are too few for a menu to be worth opening.
 */
export function BoardSwitch({ value, onChange }: { value: BoardType; onChange: (next: BoardType) => void }): React.JSX.Element {
  const t = useT();
  // one radio group per switch on the page, whatever else is on it
  const name = `rank-by${useId()}`;
  return (
    <fieldset className="seg rank-by">
      <legend className="sr-only">{t('rankings.rankBy')}</legend>
      {BOARD_KINDS.map((k) => (
        <label key={k.key} className={`seg-btn rank-by-btn${k.key === value ? ' is-active' : ''}`}>
          <input type="radio" name={name} value={k.key} checked={k.key === value} onChange={() => onChange(k.key)} />
          <KindIcon type={k.key} size={16} />
          <span>{t(k.labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * An amount on a board: XP as a number and its unit, as it always was, and
 * Zêr and Gewher as the number beside the currency's own picture, which is
 * how the purse in the bar shows them. The picture is decorative; a screen
 * reader hears the number and the currency's name.
 */
export function BoardAmount({ type, amount }: { type: BoardType; amount: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = amount.toLocaleString(locale);
  if (type === 'weekly_xp') return <>{`${number} ${t('rankings.unit.xp')}`}</>;
  return (
    <span className="rank-amount">
      <KindIcon type={type} size={16} />
      <span>{number}</span>
      <span className="sr-only">{t(type === 'zer' ? 'rankings.board.zer' : 'rankings.board.gewher')}</span>
    </span>
  );
}
