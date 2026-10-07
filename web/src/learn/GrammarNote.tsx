import { parseMarkdown, type Span } from '@kurda/shared';

function Inline({ spans }: { spans: Span[] }): React.JSX.Element {
  return (
    <>
      {spans.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : s.code ? <code key={i}>{s.text}</code> : <span key={i}>{s.text}</span>))}
    </>
  );
}

/**
 * A skill's grammar note — its "Tips" (KUR-038) — drawn from the markdown the
 * course editors write, with the parser the phone uses (@kurda/shared). The
 * note becomes React elements, never markup, so nothing an editor types can
 * run. Headings start at h3: the note always sits under a heading of its own.
 *
 * Notes mix the interface language with Kurdish, so the note as a whole is not
 * marked as either; `dir="auto"` lets a Soranî line run right to left.
 */
export function GrammarNote({ source }: { source: string }): React.JSX.Element {
  return (
    <div className="grammar-note" dir="auto">
      {parseMarkdown(source).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return block.level === 1 ? (
              <h3 key={i}>
                <Inline spans={block.spans} />
              </h3>
            ) : (
              <h4 key={i}>
                <Inline spans={block.spans} />
              </h4>
            );
          case 'paragraph':
            return (
              <p key={i}>
                <Inline spans={block.spans} />
              </p>
            );
          case 'bullets':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline spans={item} />
                  </li>
                ))}
              </ul>
            );
          case 'code':
            return (
              <pre key={i}>
                <code>{block.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
