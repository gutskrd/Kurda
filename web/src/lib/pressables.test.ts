import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { HAND_TUNED, LARGE_ENOUGH, REACH_CONTROLS, STANDALONE_LINKS } from './reach';

/*
 * Counts every clickable not yet reviewed for its touch reach, file by file. A clickable is reviewed when its classes
 * name a control in one of reach.ts's lists, or it is a shared button that always draws one. Counts are kept in
 * reach-unreviewed.json and may fall but never rise; `REACH_UPDATE=1` writes lower counts back.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
  writeFileSync(file: URL, data: string): void;
  existsSync(file: URL): boolean;
  readdirSync(dir: URL, options: { recursive: true }): string[];
}
const fileSystem = 'node:fs';
const { readFileSync, writeFileSync, existsSync, readdirSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// The app's sources wherever the suite runs from; kept in a variable so the build does not treat it as an asset.
const here = import.meta.url;
const src = new URL('../', here);
const countsFile = new URL('reach-unreviewed.json', here);
const update = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.REACH_UPDATE === '1';

/** Shared buttons that always draw a reviewed class (components/Button.tsx, CloseButton.tsx, learn/Tile.tsx, Settings' rows). */
const REVIEWED_COMPONENTS = new Set(['Button', 'LinkButton', 'CloseButton', 'Tile', 'SettingsRow']);
/** Elements that are clickable by what they are. */
const CLICKABLE_TAGS = new Set(['button', 'a', 'summary', 'Link', 'NavLink', 'ConfirmButton', ...REVIEWED_COMPONENTS]);
/** Roles that make anything clickable. */
const CLICKABLE_ROLES = new Set(['button', 'tab', 'link']);

/** One compound of a list entry: `.request-name.is-link` is two classes, `a` a tag. */
interface Want {
  tag: string | null;
  classes: string[];
}
const parseEntry = (entry: string): Want[] =>
  entry.split(/\s+/).map((part) => ({ tag: /^[a-z][\w-]*/i.exec(part)?.[0] ?? null, classes: [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!) }));
const ENTRIES = ([...REACH_CONTROLS, ...STANDALONE_LINKS, ...HAND_TUNED, ...LARGE_ENOUGH] as string[]).map(parseEntry);

/** A clickable that has not been reviewed: where it is, and what it is. */
interface Unreviewed {
  line: number;
  what: string;
}

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;
const opening = (node: Jsx): ts.JsxOpeningElement | ts.JsxSelfClosingElement => (ts.isJsxElement(node) ? node.openingElement : node);
const tagName = (node: Jsx): string => opening(node).tagName.getText();
const attribute = (node: Jsx, name: string): ts.JsxAttribute | undefined =>
  opening(node).attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);

/** Every word written into a class name: strings, template text, or any branch of an expression. */
function classTokens(node: Jsx): string[] {
  const value = attribute(node, 'className')?.initializer;
  if (!value) return [];
  const texts: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) texts.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      texts.push(n.head.text);
      for (const span of n.templateSpans) {
        visit(span.expression);
        texts.push(span.literal.text);
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(value);
  return texts.flatMap((t) => t.split(/\s+/)).filter(Boolean);
}

/** The literal role an element is given, if it is written out. */
function roleOf(node: Jsx): string | null {
  const value = attribute(node, 'role')?.initializer;
  if (!value) return null;
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression)) return value.expression.text;
  return null;
}

/** A label wrapping a field, which presses the field. */
function labelsAField(node: Jsx): boolean {
  if (!ts.isJsxElement(node)) return false;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && tagName(n) === 'input') found = true;
    else ts.forEachChild(n, visit);
  };
  node.children.forEach(visit);
  return found;
}

function isClickable(node: Jsx): boolean {
  const tag = tagName(node);
  if (CLICKABLE_TAGS.has(tag)) return true;
  if (tag === 'label' && labelsAField(node)) return true;
  if (attribute(node, 'onClick')) return true;
  const role = roleOf(node);
  return role !== null && CLICKABLE_ROLES.has(role);
}

/** The JSX elements that hold this one, nearest first. */
function holders(node: ts.Node): Jsx[] {
  const out: Jsx[] = [];
  for (let p = node.parent; p; p = p.parent) if (ts.isJsxElement(p)) out.push(p);
  return out;
}

/** Whether a list names this element, by its own classes and tag and by its holders where the entry asks. */
function isReviewed(node: Jsx): boolean {
  if (REVIEWED_COMPONENTS.has(tagName(node))) return true;
  const own = classTokens(node);
  const fits = (w: Want, el: Jsx, classes: string[]): boolean => (w.tag === null || w.tag === tagName(el)) && w.classes.every((c) => classes.includes(c));
  return ENTRIES.some((want) => {
    if (!fits(want[want.length - 1]!, node, own)) return false;
    const up = holders(node);
    return want.slice(0, -1).every((w) => up.some((el) => fits(w, el, classTokens(el))));
  });
}

/** The clickables in one source file that no list has reviewed. */
function unreviewedIn(text: string, file = 'file.tsx'): Unreviewed[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Unreviewed[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && isClickable(n) && !isReviewed(n)) {
      found.push({ line: source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1, what: `<${tagName(n)}${classTokens(n).length ? ` ${classTokens(n).join(' ')}` : ''}>` });
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  return found;
}

const files = readdirSync(src, { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => p.endsWith('.tsx') && !p.endsWith('.test.tsx') && !p.startsWith('test/'))
  .sort();
const found = new Map(files.map((p) => [p, unreviewedIn(readFileSync(new URL(p, src), 'utf8'), p)] as const));
const counts = Object.fromEntries([...found].filter(([, list]) => list.length > 0).map(([p, list]) => [p, list.length]));
const kept = existsSync(countsFile) ? (JSON.parse(readFileSync(countsFile, 'utf8')) as Record<string, number>) : null;

describe('how the clickables are found and judged', () => {
  it('finds what can be clicked, and passes what a list has reviewed', () => {
    const text = [
      'export const A = () => (<div>',
      '  <button className="btn btn-sm">reviewed</button>',
      '  <button className={`chip${on ? \' is-on\' : \'\'}`}>reviewed</button>',
      '  <button className="ghost">not yet</button>',
      '  <div onClick={go}>not yet</div>',
      '  <span role="button" className="request-name">not yet: half of a listed pair</span>',
      '  <span className="request-name is-link" role="link">reviewed</span>',
      '  <p className="auth-alt"><a href="/x">reviewed, by what holds it</a></p>',
      '  <a href="/y">not yet</a>',
      '  <label className="pick"><input type="radio" />not yet</label>',
      '  <label className="pick">only words, not clickable</label>',
      '  <Button variant="ghost">reviewed</Button>',
      '  <ConfirmButton className="user-menu-item" title="t" label="l" onConfirm={go} />',
      '  <div className="card">not clickable</div>',
      '</div>);',
    ].join('\n');
    expect(unreviewedIn(text).map((u) => `${u.line} ${u.what}`)).toEqual([
      '4 <button ghost>',
      '5 <div>',
      '6 <span request-name>',
      '9 <a>',
      '10 <label pick>',
      '13 <ConfirmButton user-menu-item>',
    ]);
  });
});

describe('the clickables on the website', () => {
  it('has the counts of what is not yet reviewed written down', () => {
    if (update && !kept) writeFileSync(countsFile, `${JSON.stringify(counts, null, 2)}\n`);
    expect(kept ?? (update ? counts : null), 'reach-unreviewed.json').not.toBeNull();
  });

  it('never has more unreviewed clickables in a file than were counted', () => {
    const base = kept ?? counts;
    const rose = Object.entries(counts)
      .filter(([p, n]) => n > (base[p] ?? 0))
      .map(([p, n]) => `${p}: ${n}, counted ${base[p] ?? 0}: ${found.get(p)!.map((u) => `${u.line} ${u.what}`).join(', ')}`);
    expect(rose).toEqual([]);
    if (update && kept) {
      // Fewer than counted: write the lower numbers back and drop files with none.
      const lower = Object.fromEntries(
        Object.keys(kept)
          .filter((p) => (counts[p] ?? 0) > 0)
          .sort()
          .map((p) => [p, Math.min(kept[p]!, counts[p]!)]),
      );
      writeFileSync(countsFile, `${JSON.stringify(lower, null, 2)}\n`);
    }
  });
});
