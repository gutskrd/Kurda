import { PODIUM_ART_BLOCKS, PODIUM_ART_NUMERAL, PODIUM_ART_NUMERALS, PODIUM_ART_STAR, TICKET_ART_BOX, podiumBlockPath } from '@kurda/shared';

/**
 * The rankings card's podium (shared ticket.ts): three paper blocks with their places in ink and a star over the first,
 * on the ticket's canvas and in its paper and ink (styles/play.css `.paper-art`), so the two cards on the games page
 * read as a pair. It is decoration; the card says what it is.
 */
export function PodiumArt({ className }: { className?: string }): React.JSX.Element {
  const { width, height } = PODIUM_ART_NUMERAL;
  return (
    <svg
      className={`podium-art paper-art${className ? ` ${className}` : ''}`}
      viewBox={`-3 -6 ${TICKET_ART_BOX.width + 6} ${TICKET_ART_BOX.height + 12}`}
      width="64"
      height="44"
      aria-hidden="true"
      focusable="false"
    >
      {PODIUM_ART_BLOCKS.map((block) => (
        <g key={block.place}>
          <path className="podium-art-block" d={podiumBlockPath(block)} />
          <path
            className="podium-art-place"
            d={PODIUM_ART_NUMERALS[block.place]}
            transform={`translate(${block.x + (block.width - width) / 2} ${block.y + (block.height - height) / 2})`}
          />
        </g>
      ))}
      <path className="podium-art-star" d={PODIUM_ART_STAR} />
    </svg>
  );
}
