/**
 * The book's drawings, from SVG into the PDF: the svg-to-pdfkit converter
 * with one change to how it clips.
 *
 * The converter draws every SVG clip-path as a soft mask, a group of white
 * shapes the viewer has to composite under whatever it clips. Not every PDF
 * viewer does that composite, and one that skips it drops what lies under the
 * mask: Hamo's moustache, drawn as two clipped halves so its end can lift,
 * went missing from the downloaded book that way, and every iris and every
 * set of teeth was drawn the same way. A real PDF clipping path is honoured by every
 * viewer, and is smaller and quicker to draw besides, so a clip-path made of
 * one plain shape (a path, a rectangle, a circle, an ellipse, a line, a
 * polygon) is laid down as one here. Anything the clipping path cannot say
 * alone (several shapes, text, a clip-path on the clip-path itself) keeps the
 * soft mask, as before.
 *
 * The converter keeps its drawing code private, inside the one function it
 * exports, so the change is made to its source as it is loaded: each piece is
 * found by its exact text and replaced, and if the package ever changes under
 * us the book refuses to print rather than printing without its clips. The
 * package is MIT-licensed, and is used unchanged apart from these lines.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';

/** The converter's one call: an SVG drawn into the document at `x`, `y`, fitted to `width` by `height`. */
export type SvgToPdf = (doc: PDFKit.PDFDocument, svg: string, x: number, y: number, options?: { width?: number; height?: number; preserveAspectRatio?: string }) => void;

/** Where a clip-path is applied: the clip path is asked first whether it can clip natively, and only then falls back to its mask. */
const CLIP_AT = `          let clipPath = new SvgElemClipPath(this.get('clip-path'), null);
          clipPath.useMask(this.getBoundingBox());
          return true;`;
const CLIP_TO = `          let clipPath = new SvgElemClipPath(this.get('clip-path'), null),
              bBox = this.getBoundingBox();
          if (clipPath.useClip(bBox)) {return false;}
          clipPath.useMask(bBox);
          return true;`;

/**
 * The clip path's own native clip, beside its mask. It answers false, drawing
 * nothing, unless it is one visible plain shape with no clip of its own; then
 * it sets that shape, moved by its own transform and the clip path's units,
 * as the clipping path of the current graphics state. Returning false from
 * the element's clip also spares it the transparency group a mask needs.
 */
const PATH_AT = `    var SvgElemClipPath = function(obj, inherits) {
      SvgElemHasChildren.call(this, obj, inherits);
`;
const PATH_TO = `${PATH_AT}      this.useClip = function(bBox) {
        if (this.get('clip-path') !== 'none') {return false;}
        let children = this.getChildren().filter(function(child) {return child.get('display') !== 'none';});
        if (children.length !== 1) {return false;}
        let child = children[0];
        if (!(child.shape instanceof SvgShape) || !child.shape.pathCommands.length) {return false;}
        if (child.get('visibility') === 'hidden' || child.get('clip-path') !== 'none') {return false;}
        let shape = child.shape.clone().transform(child.getTransformation());
        if (this.attr('clipPathUnits') === 'objectBoundingBox') {
          shape.transform([bBox[2] - bBox[0], 0, 0, bBox[3] - bBox[1], bBox[0], bBox[1]]);
        }
        shape.insertInDocument();
        doc.clip(child.get('clip-rule'));
        return true;
      };
`;

function load(): SvgToPdf {
  const require = createRequire(import.meta.url);
  const file = require.resolve('svg-to-pdfkit');
  // the package is written with Windows line ends; read as plain new lines, the pieces below are found as written
  let source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const changes: [string, string][] = [
    [CLIP_AT, CLIP_TO],
    [PATH_AT, PATH_TO],
  ];
  for (const [at, to] of changes) {
    const found = source.split(at).length - 1;
    if (found !== 1) throw new Error(`books: the SVG converter at ${file} is not the one its clipping change was written for (a piece was found ${found} times)`);
    source = source.replace(at, () => to);
  }
  const factory = runInThisContext(`(function (module) {${source}\n})`, { filename: file }) as (module: { exports: unknown }) => void;
  const module: { exports: unknown } = { exports: {} };
  factory(module);
  if (typeof module.exports !== 'function') throw new Error(`books: the SVG converter at ${file} exported no function`);
  return module.exports as SvgToPdf;
}

/** The converter, with clip-paths drawn as clipping paths wherever one shape says them. */
export const svgToPdf: SvgToPdf = load();
