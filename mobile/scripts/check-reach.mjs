/**
 * Every control answers a finger a little off the mark, and no two take each
 * other's taps.
 *
 * The app's Pressable (src/theme/Pressable.tsx) works out how far past what
 * it draws a control answers, from the size its style already states, up to
 * `MIN_REACH`. That only holds while the ways around it stay few, and each of
 * them is a habit somebody had before it existed:
 *
 *   a hitSlop written in numbers  a reach tuned once, by eye, that nothing keeps right
 *   <Text onPress>                a link that cannot take a reach at all
 *   a bare <Toggle>               a 31pt switch beside the words that should turn it
 *   a <Modal> without ReachReset  a sheet whose controls are capped by the screen under it
 *   a horizontal scroller         which cuts off the reach of every chip it holds,
 *     without reachRoom           unless it leaves room for it
 *   pressDelay={0}                a press with no reach and no wait, for the two
 *                                 places that set their own
 *
 * Each is counted per file and the counts are kept in reach-baseline.json. A
 * count may fall and may not rise, so the habits go as files are touched and
 * do not come back; `--update` lowers the baseline to what is there now and
 * never raises it. Once a habit has gone from every file it is a rule with no
 * baseline (`HARD`): a bare switch, a sheet without ReachReset or a list
 * that drops taps under the keyboard now fails wherever it appears, since
 * there is no old code left to excuse it.
 *
 * That last one: a list in a file with a text field keeps a tap that lands on
 * it while the keyboard is up (`keyboardShouldPersistTaps`). Without it the
 * first tap on a button under a search field only closes the keyboard, and a
 * person taps again thinking they missed.
 *
 * `--report` prints every pressable with where it is, the size its style
 * declares, where its reach comes from (auto, open, explicit, group, none)
 * and what that reach is: the work list for making every control reachable.
 *
 * Runs inside `npm run lint --workspace @kurda/mobile`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, 'scripts', 'reach-baseline.json');

/** The numbers `src/a11y/a11y.ts` exports: this file is .mjs and cannot import a .ts module, so they are written once more here. */
const MIN_REACH = 48;
const REACH_OPEN = 8;

/** The habits counted, in the order they are reported. */
const RATCHETS = {
  hitSlop: 'a hitSlop written in numbers — say the size (reachSize) or the neighbours (ReachGroup) instead',
  textOnPress: '<Text onPress> — a Text cannot take a reach; make the link a Pressable',
  bareToggle: 'a bare <Toggle> — use ToggleRow, so the words turn it too',
  modal: '<Modal> without ReachReset inside — the screen underneath caps its controls',
  scroller: 'a horizontal scroller without reachRoom — it cuts off the reach of what it holds',
  pressDelayZero: 'pressDelay={0} — a press with no wait and no reach',
  persistTaps: 'a list in a file with a text field without keyboardShouldPersistTaps — its first tap only closes the keyboard',
};

/** The habits no file has any more: each is allowed nowhere, whatever the baseline says, and `--update` never writes them. */
const HARD = new Set(['bareToggle', 'modal', 'persistTaps']);

/** Where a habit is the point rather than a slip, and why. */
const EXEMPT = {
  // the switch itself, and the settings row that turns it from its words
  bareToggle: new Set(['theme/Toggle.tsx', 'settings/list.tsx']),
  // the tab bar answers the moment it is touched and sets its own reach; the couch card is held to be read
  pressDelayZero: new Set(['navigation/TabBar.tsx', 'impostor/CouchGame.tsx']),
  // a pager holds whole pages, not a row of controls with reach to keep
  scroller: new Set(['theme/SwipePager.tsx']),
};

const PRESSABLE_TAGS = new Set(['Pressable', 'PressableScale', 'AnimatedPressable']);
const LIST_TAGS = new Set(['ScrollView', 'FlatList', 'SectionList']);
const SCROLLER_TAGS = new Set(['ScrollView', 'FlatList']);

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const rel = (f) => relative(SRC, f).split(sep).join('/');

/** `Foo` or `Animated.Foo` → `Foo`, the last part of a tag's name. */
function tagName(node) {
  const tag = node.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  return '';
}

function attributes(node) {
  return node.attributes.properties;
}

function attr(node, name) {
  return attributes(node).find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
}

/** What an attribute holds: the expression inside `{…}`, the string literal itself, or null for a bare `horizontal`. */
function attrValue(a) {
  if (!a.initializer) return null;
  if (ts.isJsxExpression(a.initializer)) return a.initializer.expression ?? null;
  return a.initializer;
}

function unwrap(e) {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e))) {
    e = e.expression;
  }
  return e;
}

/** Every JSX element in a file, opening and self-closing alike, with the element node that holds its children. */
function jsxElements(sf) {
  const out = [];
  const visit = (n) => {
    if (ts.isJsxSelfClosingElement(n)) out.push({ open: n, element: n });
    else if (ts.isJsxElement(n)) out.push({ open: n.openingElement, element: n });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/*
 * Numbers a style or a reach can be written in: literals, the token scales
 * (spacing, radii, layout), the a11y constants, and a file's own constants,
 * with the arithmetic between them. Anything else is not known, and a size
 * that is not known gets no reach, exactly as the Pressable does.
 */
function constantTable(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const table = new Map();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) table.set(d.name.text, d.initializer);
  }
  return { sf, table };
}

const SHARED = (() => {
  const out = new Map();
  for (const f of ['theme/tokens.ts', 'a11y/a11y.ts']) {
    const { table } = constantTable(join(SRC, f));
    for (const [name, init] of table) out.set(name, init);
  }
  return out;
})();

/** A file's own top-level constants, and the names it imports. */
function scopeOf(sf) {
  const own = new Map();
  const imported = new Set();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Const) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) own.set(d.name.text, d.initializer);
    }
    if (ts.isImportDeclaration(st) && st.importClause) {
      const c = st.importClause;
      if (c.name) imported.add(c.name.text);
      if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) imported.add(el.name.text);
      if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) imported.add(c.namedBindings.name.text);
    }
  }
  return { own, imported };
}

/** The value of an expression that is a number or an object of numbers, or undefined when it cannot be known here. */
function evaluate(e, scope, depth = 0) {
  e = unwrap(e);
  if (!e || depth > 12) return undefined;
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e)) {
    const v = evaluate(e.operand, scope, depth + 1);
    if (typeof v !== 'number') return undefined;
    return e.operator === ts.SyntaxKind.MinusToken ? -v : e.operator === ts.SyntaxKind.PlusToken ? v : undefined;
  }
  if (ts.isBinaryExpression(e)) {
    const a = evaluate(e.left, scope, depth + 1);
    const b = evaluate(e.right, scope, depth + 1);
    if (typeof a !== 'number' || typeof b !== 'number') return undefined;
    switch (e.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken: return a + b;
      case ts.SyntaxKind.MinusToken: return a - b;
      case ts.SyntaxKind.AsteriskToken: return a * b;
      case ts.SyntaxKind.SlashToken: return a / b;
      default: return undefined;
    }
  }
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'reachSlop') {
    // the helper in src/a11y/a11y.ts, for its plain two-number form
    const [w, h] = e.arguments.map((x) => evaluate(x, scope, depth + 1));
    if (typeof w !== 'number' || typeof h !== 'number' || e.arguments.length > 2) return undefined;
    return reachSlop(w, h);
  }
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.expression.getText() === 'Math') {
    const fn = e.expression.name.text;
    const args = e.arguments.map((x) => evaluate(x, scope, depth + 1));
    if (!args.every((x) => typeof x === 'number')) return undefined;
    if (fn === 'max') return Math.max(...args);
    if (fn === 'min') return Math.min(...args);
    if (fn === 'round') return Math.round(args[0]);
    return undefined;
  }
  if (ts.isIdentifier(e)) {
    const init = scope.own.get(e.text) ?? (scope.imported.has(e.text) ? SHARED.get(e.text) : undefined);
    return init ? evaluate(init, scope, depth + 1) : undefined;
  }
  if (ts.isPropertyAccessExpression(e)) {
    const obj = evaluate(e.expression, scope, depth + 1);
    return obj && typeof obj === 'object' ? obj[e.name.text] : undefined;
  }
  if (ts.isObjectLiteralExpression(e)) {
    const out = {};
    for (const p of e.properties) {
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) out[p.name.text] = evaluate(p.initializer, scope, depth + 1);
      else if (ts.isShorthandPropertyAssignment(p)) out[p.name.text] = evaluate(p.name, scope, depth + 1);
      else if (ts.isSpreadAssignment(p)) {
        const s = evaluate(p.expression, scope, depth + 1);
        if (s && typeof s === 'object') Object.assign(out, s);
      }
    }
    return out;
  }
  return undefined;
}

/**
 * A hitSlop written by hand: one that can be worked out without running the
 * app — numbers, constants and the arithmetic between them, or such a value
 * as one branch of a condition. One computed from a size, a measurement or
 * `reachSlop` is not counted; that is the reach being said, not guessed.
 */
function handWritten(e, scope) {
  e = unwrap(e);
  if (!e) return false;
  if (ts.isConditionalExpression(e)) return handWritten(e.whenTrue, scope) || handWritten(e.whenFalse, scope);
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
    return handWritten(e.right, scope) || (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken && handWritten(e.left, scope));
  }
  if (ts.isIdentifier(e) && (e.text === 'undefined' || e.text === 'null')) return false;
  if (e.kind === ts.SyntaxKind.NullKeyword) return false;
  return fullyConstant(e, scope);
}

function fullyConstant(e, scope, depth = 0) {
  e = unwrap(e);
  if (!e || depth > 12) return false;
  if (ts.isNumericLiteral(e)) return true;
  if (ts.isPrefixUnaryExpression(e)) return fullyConstant(e.operand, scope, depth + 1);
  if (ts.isBinaryExpression(e)) return fullyConstant(e.left, scope, depth + 1) && fullyConstant(e.right, scope, depth + 1);
  if (ts.isObjectLiteralExpression(e)) {
    return (
      e.properties.length > 0 &&
      e.properties.every(
        (p) =>
          (ts.isPropertyAssignment(p) && fullyConstant(p.initializer, scope, depth + 1)) ||
          (ts.isShorthandPropertyAssignment(p) && fullyConstant(p.name, scope, depth + 1)) ||
          (ts.isSpreadAssignment(p) && fullyConstant(p.expression, scope, depth + 1)),
      )
    );
  }
  if (ts.isIdentifier(e)) {
    // an imported name is a token or a constant: a module does not export a measurement
    if (scope.imported.has(e.text)) return true;
    const init = scope.own.get(e.text);
    return init ? fullyConstant(init, scope, depth + 1) : false;
  }
  if (ts.isPropertyAccessExpression(e)) return fullyConstant(e.expression, scope, depth + 1);
  return false;
}

/** Every `StyleSheet.create({…})` in a file, by the name it is kept under: key → the object it holds. */
function styleSheets(sf) {
  const sheets = new Map();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const init = unwrap(d.initializer);
      if (!ts.isIdentifier(d.name) || !init || !ts.isCallExpression(init)) continue;
      if (init.expression.getText() !== 'StyleSheet.create') continue;
      const arg = unwrap(init.arguments[0]);
      if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
      const keys = new Map();
      for (const p of arg.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) keys.set(p.name.text, p.initializer);
      sheets.set(d.name.text, keys);
    }
  }
  return sheets;
}

const SIZE_KEYS = ['width', 'height', 'minWidth', 'minHeight'];

/**
 * The sizes a style declares, merged in order as React Native flattens them:
 * a number where it is known, null where it is set to something that is not
 * (a percentage, a prop). A function style is read at rest, as the Pressable
 * reads it. Both branches of a condition count; where they disagree it is not known.
 */
function declaredSize(e, ctx, depth = 0) {
  e = unwrap(e);
  const out = {};
  if (!e || depth > 10) return out;
  const merge = (s) => Object.assign(out, s);
  if (ts.isArrayLiteralExpression(e)) {
    for (const el of e.elements) merge(declaredSize(el, ctx, depth + 1));
  } else if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
    if (ts.isBlock(e.body)) {
      const ret = e.body.statements.find(ts.isReturnStatement);
      if (ret?.expression) merge(declaredSize(ret.expression, ctx, depth + 1));
    } else {
      merge(declaredSize(e.body, ctx, depth + 1));
    }
  } else if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    merge(declaredSize(e.right, ctx, depth + 1));
  } else if (ts.isConditionalExpression(e)) {
    const a = declaredSize(e.whenTrue, ctx, depth + 1);
    const b = declaredSize(e.whenFalse, ctx, depth + 1);
    for (const k of SIZE_KEYS) {
      if (!(k in a) && !(k in b)) continue;
      out[k] = a[k] === b[k] ? a[k] : null;
    }
  } else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && ctx.sheets.has(e.expression.text)) {
    const obj = ctx.sheets.get(e.expression.text).get(e.name.text);
    if (obj) merge(declaredSize(obj, ctx, depth + 1));
  } else if (ts.isObjectLiteralExpression(e)) {
    for (const p of e.properties) {
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && SIZE_KEYS.includes(p.name.text)) {
        const v = evaluate(p.initializer, ctx.scope);
        out[p.name.text] = typeof v === 'number' ? v : null;
      } else if (ts.isSpreadAssignment(p)) {
        merge(declaredSize(p.expression, ctx, depth + 1));
      }
    }
  } else if (ts.isIdentifier(e) && ctx.scope.own.has(e.text)) {
    merge(declaredSize(ctx.scope.own.get(e.text), ctx, depth + 1));
  }
  return out;
}

/** reachSlop from src/a11y/a11y.ts, the same arithmetic. */
function reachSlop(width, height, { edge = 0, limit = null } = {}) {
  const grow = (size) => Math.max(edge, size === null ? 0 : (MIN_REACH - size) / 2, 0);
  const dx = grow(width);
  const dy = grow(height);
  const cap = (v, side) => Math.max(0, Math.min(v, limit?.[side] ?? Infinity));
  return { top: cap(dy, 'top'), bottom: cap(dy, 'bottom'), left: cap(dx, 'left'), right: cap(dx, 'right') };
}

/** The tighter of two caps, side by side, as ReachGroup combines a group inside another. */
function tighter(a, b) {
  if (!a) return b;
  if (!b) return a;
  const side = (x, y) => (x === undefined ? y : y === undefined ? x : Math.min(x, y));
  return { top: side(a.top, b.top), bottom: side(a.bottom, b.bottom), left: side(a.left, b.left), right: side(a.right, b.right) };
}

/**
 * The caps of the ReachGroups around a JSX element in the same file, or null:
 * the nearest ReachReset ends the search, as it ends the groups' reach.
 */
function groupLimit(element, scope) {
  let limit = null;
  for (let n = element.parent; n; n = n.parent) {
    if (!ts.isJsxElement(n)) continue;
    const name = tagName(n.openingElement);
    if (name === 'ReachReset') break;
    if (name !== 'ReachGroup') continue;
    const half = (prop) => {
      const a = attr(n.openingElement, prop);
      const v = a ? evaluate(attrValue(a), scope) : undefined;
      return typeof v === 'number' ? v / 2 : undefined;
    };
    limit = tighter(limit, { top: half('rowGap'), bottom: half('rowGap'), left: half('gap'), right: half('gap') });
  }
  return limit;
}

/** One pressable, as the report shows it and as the Pressable would resolve it. */
function describePressable(open, element, ctx) {
  const at = `${ctx.where}:${lineOf(ctx.sf, open)}`;
  const tag = tagName(open);
  const style = attr(open, 'style');
  const size = style ? declaredSize(attrValue(style), ctx) : {};
  const sizeAttr = attr(open, 'reachSize');
  const given = sizeAttr ? evaluate(attrValue(sizeAttr), ctx.scope) : undefined;
  const num = (v) => (typeof v === 'number' ? v : null);
  const w = num(given?.width) ?? num(size.width) ?? num(size.minWidth);
  const h = num(given?.height) ?? num(size.height) ?? num(size.minHeight);
  const drawn = `${w ?? '?'}×${h ?? '?'}`;
  if (tag === 'Pressable' && ctx.rawPressable) return { at, tag, drawn, source: 'raw', reach: '-' };
  const slopAttr = attr(open, 'hitSlop');
  if (slopAttr) {
    const v = evaluate(attrValue(slopAttr), ctx.scope);
    const reach = typeof v === 'number' ? `${v}` : v && typeof v === 'object' ? `${v.top ?? 0}/${v.right ?? 0}/${v.bottom ?? 0}/${v.left ?? 0}` : 'computed';
    return { at, tag, drawn, source: 'explicit', reach };
  }
  const reachAttr = attr(open, 'reach');
  const reachValue = reachAttr ? unwrap(attrValue(reachAttr)) : null;
  const reach = !reachAttr ? 'auto' : reachValue && ts.isStringLiteral(reachValue) ? reachValue.text : 'dynamic';
  if (reach === 'none') return { at, tag, drawn, source: 'none', reach: '-' };
  const spread = attributes(open).some((a) => ts.isJsxSpreadAttribute(a));
  const delay = attr(open, 'pressDelay');
  const instant = delay && evaluate(attrValue(delay), ctx.scope) === 0;
  const pressable = attr(open, 'onPress') || spread;
  if (reach !== 'open' && (instant || !pressable)) return { at, tag, drawn, source: 'none', reach: '-' };
  const limit = groupLimit(element, ctx.scope);
  const slop = reachSlop(w, h, { edge: reach === 'open' ? REACH_OPEN : 0, limit });
  const any = slop.top || slop.bottom || slop.left || slop.right;
  const source = limit ? 'group' : reach === 'open' ? 'open' : reach === 'dynamic' ? 'dynamic' : 'auto';
  const round = (v) => Math.round(v * 10) / 10;
  return { at, tag, drawn, source, reach: any ? `${round(slop.top)}/${round(slop.right)}/${round(slop.bottom)}/${round(slop.left)}` : '-' };
}

/** What one file holds: its count of each habit, the lines they are on, and its pressables for the report. */
function scan(file) {
  const where = rel(file);
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const scope = scopeOf(sf);
  const counts = Object.fromEntries(Object.keys(RATCHETS).map((k) => [k, 0]));
  const lines = Object.fromEntries(Object.keys(RATCHETS).map((k) => [k, []]));
  const count = (k, node) => {
    counts[k]++;
    lines[k].push(lineOf(sf, node));
  };
  const elements = jsxElements(sf);

  // the names a reachRoom(…) is kept under, so `rr.content` counts as room
  const roomNames = new Set();
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf);
      if (callee === 'reachRoom' && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) roomNames.add(n.parent.name.text);
    }
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'hitSlop' && handWritten(n.initializer, scope)) count('hitSlop', n);
    ts.forEachChild(n, visit);
  };
  visit(sf);

  const rawPressable = sf.statements.some(
    (st) =>
      ts.isImportDeclaration(st) &&
      st.moduleSpecifier.text === 'react-native' &&
      st.importClause?.namedBindings &&
      ts.isNamedImports(st.importClause.namedBindings) &&
      st.importClause.namedBindings.elements.some((el) => el.name.text === 'Pressable'),
  );
  const rendersPressables = elements.some(({ open }) => attr(open, 'onPress'));
  const hasField = elements.some(({ open }) => ['TextInput', 'SearchField'].includes(tagName(open)));
  const ctx = { sf, where, scope, sheets: styleSheets(sf), rawPressable };
  const pressables = [];

  for (const { open, element } of elements) {
    const tag = tagName(open);
    const slop = attr(open, 'hitSlop');
    if (slop && handWritten(attrValue(slop), scope)) count('hitSlop', open);
    if (tag === 'Text' && attr(open, 'onPress')) count('textOnPress', open);
    // a switch that nothing turns (a loading row's stand-in, drawn unseen for its size) is no control, and has no words to be turned by
    const turnable = attr(open, 'onValueChange') || attributes(open).some((a) => ts.isJsxSpreadAttribute(a));
    if (tag === 'Toggle' && turnable && !EXEMPT.bareToggle.has(where)) count('bareToggle', open);
    if (tag === 'Modal') {
      let reset = false;
      const look = (n) => {
        if (reset) return;
        if ((ts.isJsxElement(n) && tagName(n.openingElement) === 'ReachReset') || (ts.isJsxSelfClosingElement(n) && tagName(n) === 'ReachReset')) reset = true;
        else ts.forEachChild(n, look);
      };
      if (ts.isJsxElement(element)) element.children.forEach(look);
      if (!reset) count('modal', open);
    }
    if (SCROLLER_TAGS.has(tag) && rendersPressables && !EXEMPT.scroller.has(where)) {
      const horizontal = attr(open, 'horizontal');
      const off = horizontal && horizontal.initializer && attrValue(horizontal)?.kind === ts.SyntaxKind.FalseKeyword;
      if (horizontal && !off) {
        const said = attributes(open).map((a) => a.getText(sf)).join(' ');
        const room = /\breachRoom\(/.test(said) || [...roomNames].some((name) => new RegExp(`\\b${name}\\b`).test(said));
        if (!room) count('scroller', open);
      }
    }
    const delay = attr(open, 'pressDelay');
    if (delay && evaluate(attrValue(delay), scope) === 0 && !EXEMPT.pressDelayZero.has(where)) count('pressDelayZero', open);
    if (LIST_TAGS.has(tag) && hasField && !attr(open, 'keyboardShouldPersistTaps')) count('persistTaps', open);
    if (PRESSABLE_TAGS.has(tag)) pressables.push(describePressable(open, element, ctx));
  }
  return { where, counts, lines, pressables };
}

const args = new Set(process.argv.slice(2));
const files = sources(SRC).map(scan);

if (args.has('--report')) {
  const rows = files.flatMap((f) => f.pressables);
  const width = (k) => Math.max(...rows.map((r) => String(r[k]).length), k.length);
  const cols = ['at', 'tag', 'drawn', 'source', 'reach'];
  const line = (r) => cols.map((k) => String(r[k]).padEnd(width(k))).join('  ');
  console.log(line({ at: 'where', tag: 'control', drawn: 'drawn', source: 'source', reach: 'reach t/r/b/l' }));
  for (const r of rows) console.log(line(r));
  const by = rows.reduce((m, r) => m.set(r.source, (m.get(r.source) ?? 0) + 1), new Map());
  console.log(`\n${rows.length} pressables: ${[...by].map(([k, v]) => `${v} ${k}`).join(', ')}`);
  process.exit(0);
}

const current = {};
for (const f of files) {
  const nonzero = Object.entries(f.counts).filter(([, v]) => v > 0);
  if (nonzero.length > 0) current[f.where] = Object.fromEntries(nonzero);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

if (args.has('--update')) {
  // lower only: a count above the baseline stays a failure until the code is fixed
  const next = {};
  for (const where of Object.keys(current).sort()) {
    const was = baseline ? (baseline[where] ?? {}) : current[where];
    const kept = Object.entries(current[where])
      .filter(([k]) => !HARD.has(k))
      .map(([k, v]) => [k, Math.min(v, was[k] ?? 0)])
      .filter(([, v]) => v > 0);
    if (kept.length > 0) next[where] = Object.fromEntries(kept);
  }
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`reach: baseline written, ${Object.keys(next).length} files with habits still counted.`);
  process.exit(0);
}

const problems = [];
let lowerable = 0;
for (const f of files) {
  const was = baseline?.[f.where] ?? {};
  for (const [k, v] of Object.entries(f.counts)) {
    const allowed = HARD.has(k) ? 0 : (was[k] ?? 0);
    if (v > allowed) problems.push(`${f.where}:${f.lines[k].join(',')}  ${v} × ${RATCHETS[k]} (${HARD.has(k) ? 'allowed nowhere' : `was ${allowed}`})`);
    else if (v < allowed) lowerable++;
  }
}

if (problems.length > 0) {
  console.error(`\nreach: ${problems.length} counts rose above scripts/reach-baseline.json, or break a rule allowed nowhere:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nA control states its size and the Pressable works out its reach; neighbours share their gap through');
  console.error('ReachGroup, a sheet starts afresh with ReachReset, and a scroller leaves reachRoom. `--report` lists every control.\n');
  process.exit(1);
}

console.log(
  `reach: no habit has grown back.${lowerable > 0 ? ` (${lowerable} counts have fallen; \`node scripts/check-reach.mjs --update\` lowers the baseline.)` : ''}`,
);
