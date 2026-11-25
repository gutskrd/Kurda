import { MembersIcon } from './icons';

/**
 * Hevalo+'s call to join: the one button styled apart from the colour theme, in a rich gold with the crown and larger
 * than any other, with what membership gives in a line beneath it and a way to say no that is just as plain to see
 * where the offer stands alone.
 * It shines once as it arrives, never under Reduce Motion, and nothing about it counts down or comes already chosen.
 */
export function PlusButton({
  label,
  value,
  decline,
  onJoin,
}: {
  label: string;
  /** What membership gives, in one short line, where the offer stands alone. */
  value?: string;
  /** The way to say no, beside an offer that stands alone; a page of its own has its close button instead. */
  decline?: { label: string; onPress: () => void };
  onJoin: () => void;
}): React.JSX.Element {
  return (
    <div className="plus-cta">
      <button type="button" className="btn btn-plus" onClick={onJoin}>
        <MembersIcon size={22} />
        <span>{label}</span>
      </button>
      {value ? <p className="plus-cta-value">{value}</p> : null}
      {decline ? (
        <button type="button" className="btn btn-ghost plus-cta-decline" onClick={decline.onPress}>
          {decline.label}
        </button>
      ) : null}
    </div>
  );
}
