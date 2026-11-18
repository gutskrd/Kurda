import { parseMarkdown, type Span } from '@kurda/shared';

function Inline({ spans }: { spans: Span[] }): React.JSX.Element {
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? <strong key={i}>{s.text}</strong> : s.italic ? <em key={i}>{s.text}</em> : s.code ? <code key={i}>{s.text}</code> : <span key={i}>{s.text}</span>,
      )}
    </>
  );
}

/**
 * A skill's grammar note (its "Tips"), rendered from the editors' markdown with the phone's parser (@kurda/shared) into
 * React elements, never markup, so nothing typed can run. Headings sit one level under the surrounding heading
 * (`headingLevel`). Notes mix languages, so each block gets `dir="auto"` rather than one direction for the whole note.
 */
export function GrammarNote({ source, headingLevel = 3 }: { source: string; headingLevel?: 3 | 4 }): React.JSX.Element {
  const Head = headingLevel === 3 ? 'h3' : 'h4';
  const Sub = headingLevel === 3 ? 'h4' : 'h5';
  return (
    <div className="grammar-note">
      {parseMarkdown(source).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return block.level === 1 ? (
              <Head key={i} className="grammar-head" dir="auto">
                <Inline spans={block.spans} />
              </Head>
            ) : (
              <Sub key={i} className="grammar-subhead" dir="auto">
                <Inline spans={block.spans} />
              </Sub>
            );
          case 'paragraph':
            return (
              <p key={i} dir="auto">
                <Inline spans={block.spans} />
              </p>
            );
          case 'bullets':
            // The list takes its first item's direction, so bullets sit on the side it starts from.
            return (
              <ul key={i} dir="auto">
                {block.items.map((item, j) => (
                  <li key={j} dir="auto">
                    <Inline spans={item} />
                  </li>
                ))}
              </ul>
            );
          case 'code':
            return (
              <pre key={i} dir="auto">
                <code>{block.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
