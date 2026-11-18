import { useId } from 'react';
import { CoinIcon, GemIcon, XpIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** What a leaderboard ranks: this week's XP, or the Zêr or Gewher held now. The ids are the API's (`GET /leaderboards/:type`). */
export type BoardType = 'weekly_xp' | 'zer' | 'gewher';

interface BoardKind {
  key: BoardType;
  labelKey: MessageKey;
  blurbKey: MessageKey;
}

/** In the order the switch offers them, weekly first. */
export const BOARD_KINDS: readonly BoardKind[] = [
  { key: 'weekly_xp', labelKey: 'rankings.board.weeklyXp', blurbKey: 'rankings.board.weeklyXpBlurb' },
  { key: 'zer', labelKey: 'rankings.board.zer', blurbKey: 'rankings.board.zerBlurb' },
  { key: 'gewher', labelKey: 'rankings.board.gewher', blurbKey: 'rankings.board.gewherBlurb' },
];

export function isBoardType(value: string | null): value is BoardType {
  return BOARD_KINDS.some((k) => k.key === value);
}

/** Each board's icon: the XP bolt, the coin or the gem. */
function KindIcon({ type, size }: { type: BoardType; size: number }): React.JSX.Element {
  if (type === 'zer') return <CoinIcon size={size} />;
  if (type === 'gewher') return <GemIcon size={size} />;
  return <XpIcon size={size} className="rank-by-xp" />;
}

/**
 * The switch between the three boards: a segmented control over real radios, so arrow keys and screen readers work.
 * It is segmented rather than chips because the chips below already filter who is compared.
 */
export function BoardSwitch({ value, onChange }: { value: BoardType; onChange: (next: BoardType) => void }): React.JSX.Element {
  const t = useT();
  // One radio group per switch on the page.
  const name = `rank-by${useId()}`;
  return (
    <fieldset className="seg rank-by">
      <legend className="sr-only">{t('rankings.rankBy')}</legend>
      {BOARD_KINDS.map((k) => (
        <label key={k.key} className={`seg-btn rank-by-btn${k.key === value ? ' is-active' : ''}`}>
          <input type="radio" name={name} value={k.key} checked={k.key === value} onChange={() => onChange(k.key)} />
          <KindIcon type={k.key} size={16} />
          <span className="seg-btn-label">{t(k.labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * An amount on a board: XP as a number and unit, Zêr and Gewher as a number beside the currency's icon, as in the
 * purse. The icon is decorative; screen readers hear the number and the currency's name.
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
