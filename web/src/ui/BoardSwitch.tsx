import { useId, useRef } from 'react';
import { useSlidingCapsule } from '../lib/motion';
import { CoinIcon, XpIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** What a leaderboard ranks. The ids are the API's (`GET /leaderboards/:type`). */
export type BoardType = 'weekly_xp' | 'all_time_xp' | 'zer';

/** What the Rankings page ranks by: XP (this week or all time) or Zêr. */
export type RankKind = 'xp' | 'zer';

/** Over what span the XP board counts. */
export type XpSpan = 'week' | 'all';

interface KindMeta {
  key: RankKind;
  labelKey: MessageKey;
}

/** In the order the switch offers them, XP first. */
export const RANK_KINDS: readonly KindMeta[] = [
  { key: 'xp', labelKey: 'rankings.board.xp' },
  { key: 'zer', labelKey: 'rankings.board.zer' },
];

export function isRankKind(value: string | null): value is RankKind {
  return RANK_KINDS.some((k) => k.key === value);
}

/** The board behind a choice: XP is this week's or all time's, the balances are their own. */
export function boardFor(kind: RankKind, span: XpSpan): BoardType {
  if (kind === 'xp') return span === 'all' ? 'all_time_xp' : 'weekly_xp';
  return kind;
}

/** Each board's name, as its list is called for a screen reader. */
export const BOARD_NAME: Readonly<Record<BoardType, MessageKey>> = {
  weekly_xp: 'rankings.board.weeklyXp',
  all_time_xp: 'rankings.board.allTimeXp',
  zer: 'rankings.board.zer',
};

/** Each kind's icon: the XP bolt or the coin. */
function KindIcon({ kind, size }: { kind: RankKind; size: number }): React.JSX.Element {
  if (kind === 'zer') return <CoinIcon size={size} />;
  return <XpIcon size={size} className="rank-by-xp" />;
}

/**
 * What the page ranks by: a segmented control over real radios, so arrow keys and screen readers work, whose chosen
 * ground slides to the option chosen as on the phone. It is segmented
 * rather than chips because the chips below already filter who is compared.
 */
export function BoardSwitch({ value, onChange }: { value: RankKind; onChange: (next: RankKind) => void }): React.JSX.Element {
  const t = useT();
  // One radio group per switch on the page.
  const name = `rank-by${useId()}`;
  const box = useRef<HTMLFieldSetElement>(null);
  const capsule = useRef<HTMLSpanElement>(null);
  useSlidingCapsule(box, capsule, '.is-active', value);
  return (
    <fieldset ref={box} className="seg rank-by">
      <legend className="sr-only">{t('rankings.rankBy')}</legend>
      {/* The chosen ground, one for the switch, which slides to the option chosen (lib/motion.ts useSlidingCapsule). */}
      <span ref={capsule} className="seg-capsule" aria-hidden="true" />
      {RANK_KINDS.map((k) => (
        <label key={k.key} className={`seg-btn rank-by-btn${k.key === value ? ' is-active' : ''}`}>
          <input type="radio" name={name} value={k.key} checked={k.key === value} onChange={() => onChange(k.key)} />
          <KindIcon kind={k.key} size={16} />
          <span className="seg-btn-label">{t(k.labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
}

const SPANS: ReadonlyArray<{ key: XpSpan; labelKey: MessageKey }> = [
  { key: 'week', labelKey: 'rankings.span.week' },
  { key: 'all', labelKey: 'rankings.span.all' },
];

/** This week or all time, for XP: the same radios, drawn a size down and quieter than what it sits under. */
export function SpanSwitch({ value, onChange }: { value: XpSpan; onChange: (next: XpSpan) => void }): React.JSX.Element {
  const t = useT();
  const name = `rank-span${useId()}`;
  const box = useRef<HTMLFieldSetElement>(null);
  const capsule = useRef<HTMLSpanElement>(null);
  useSlidingCapsule(box, capsule, '.is-on', value);
  return (
    <fieldset ref={box} className="seg rank-span">
      <legend className="sr-only">{t('rankings.span')}</legend>
      <span ref={capsule} className="seg-capsule" aria-hidden="true" />
      {SPANS.map((s) => (
        <label key={s.key} className={`seg-btn rank-span-btn${s.key === value ? ' is-on' : ''}`}>
          <input type="radio" name={name} value={s.key} checked={s.key === value} onChange={() => onChange(s.key)} />
          <span className="seg-btn-label">{t(s.labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * An amount on a board: XP as a number and unit, Zêr as a number beside the coin, as in the purse. The icon is
 * decorative; screen readers hear the number and the currency's name.
 */
export function BoardAmount({ type, amount }: { type: BoardType; amount: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = amount.toLocaleString(locale);
  if (type === 'weekly_xp' || type === 'all_time_xp') return <>{`${number} ${t('rankings.unit.xp')}`}</>;
  return (
    <span className="rank-amount">
      <KindIcon kind={type} size={16} />
      <span>{number}</span>
      <span className="sr-only">{t('rankings.board.zer')}</span>
    </span>
  );
}
