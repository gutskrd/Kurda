/**
 * The book's SVG converter (svg-to-pdf.ts): a clip-path of one plain shape becomes a real PDF clipping path, placed
 * where the shape is and moved by its transform and the clip path's units; anything a clipping path cannot express
 * keeps the converter's default soft mask.
 */
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { svgToPdf } from './svg-to-pdf.js';

/** The page's own drawing, as the PDF writes it, for an SVG drawn at its size on a page of its own. */
async function drawn(body: string): Promise<string> {
  const doc = new PDFDocument({ size: [100, 100], margin: 0, compress: false });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));
  svgToPdf(doc, `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${body}</svg>`, 0, 0, { width: 100, height: 100 });
  doc.end();
  await done;
  return Buffer.concat(chunks).toString('latin1');
}

const red = '<path d="M0,0H100V100H0z" fill="#ff0000"/>';

describe('the book’s SVG converter', () => {
  it('clips to one plain shape with a clipping path, and no soft mask', async () => {
    const pdf = await drawn(`<defs><clipPath id="c"><path d="M10,20H40V50H10z"/></clipPath></defs><g clip-path="url(#c)">${red}</g>`);
    expect(pdf).not.toContain('/SMask');
    expect(pdf).toMatch(/10 20 m\s+40 20 l\s+40 50 l\s+10 50 l\s+h\s+W n/);
    // the clipped drawing follows its clip, inside the same saved state
    expect(pdf).toMatch(/10 50 l\s+h\s+W n\s+q\s+\/DeviceRGB cs\s+1 0 0 scn/);
  });

  it('clips a single shape the same way, and honours the clip rule', async () => {
    const pdf = await drawn(`<defs><clipPath id="c"><path d="M0,0H50V50H0zM10,10H40V40H10z" clip-rule="evenodd"/></clipPath></defs><path clip-path="url(#c)" d="M0,0H100V100H0z" fill="#ff0000"/>`);
    expect(pdf).not.toContain('/SMask');
    expect(pdf).toContain('W* n');
  });

  it('moves the clip by its shape’s own transform and by the clip path’s units', async () => {
    const moved = await drawn(`<defs><clipPath id="c"><rect x="0" y="0" width="10" height="10" transform="translate(30 40)"/></clipPath></defs><g clip-path="url(#c)">${red}</g>`);
    expect(moved).toMatch(/30 40 m\s+40 40 l\s+40 50 l\s+30 50 l\s+h\s+W n/);
    // a box of the clipped drawing's own size: its top-left quarter
    const boxed = await drawn(
      `<defs><clipPath id="c" clipPathUnits="objectBoundingBox"><rect x="0" y="0" width="0.5" height="0.5"/></clipPath></defs><path clip-path="url(#c)" d="M20,20H80V80H20z" fill="#ff0000"/>`,
    );
    expect(boxed).toMatch(/20 20 m\s+50 20 l\s+50 50 l\s+20 50 l\s+h\s+W n/);
  });

  it('keeps the soft mask where one clipping path cannot say the clip', async () => {
    const two = await drawn(`<defs><clipPath id="c"><rect x="0" y="0" width="10" height="10"/><rect x="50" y="50" width="10" height="10"/></clipPath></defs><g clip-path="url(#c)">${red}</g>`);
    expect(two).toContain('/S /Luminosity');
    // the one clipping path is the drawing's own viewport, which every SVG gets
    expect(two.match(/W\*? n/g)).toHaveLength(1);
    const nested = await drawn(
      `<defs><clipPath id="o"><rect x="0" y="0" width="5" height="5"/></clipPath><clipPath id="c" clip-path="url(#o)"><rect x="0" y="0" width="10" height="10"/></clipPath></defs><g clip-path="url(#c)">${red}</g>`,
    );
    expect(nested).toContain('/S /Luminosity');
    // the clip path's own clip, one shape, is a clipping path inside the mask: the viewport's and that one
    expect(nested.match(/W\*? n/g)).toHaveLength(2);
    expect(nested).toMatch(/5 0 l\s+5 5 l\s+0 5 l\s+h\s+W n/);
  });
});
