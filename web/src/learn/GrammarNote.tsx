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
 * run.
 *
 * Its headings sit one level under the heading the note is shown beneath:
 * h3 under the lesson's "Tips" (an h2), h4 under a skill's own h3 on the
 * course map (`headingLevel`). They look the same either way.
 *
 * Notes mix the interface language with Kurdish, so the note as a whole is not
 * marked as either, and each line takes its own direction (`dir="auto"` on
 * every block, not on the note): a direction set once on the note would be
 * the first line's, and a Soranî line under an English one would then be laid
 * out left to right, its punctuation at the wrong end.
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
            // the list takes the direction of its first item, so its bullets
            // sit on the side that item starts from
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
