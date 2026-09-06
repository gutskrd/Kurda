import { describe, expect, it } from 'vitest';
import sharp, { type Region } from 'sharp';
import { renderSignature, signPicture, signaturePlacement } from './signature.js';

const picture = (width: number, height: number, rgb = { r: 40, g: 90, b: 60 }): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: rgb } }).webp().toBuffer();

/** How many subpixels differ between the same region of two pictures. */
async function changed(a: Buffer, b: Buffer, box: Region): Promise<number> {
  const [x, y] = await Promise.all([
    sharp(a).extract(box).raw().toBuffer(),
    sharp(b).extract(box).raw().toBuffer(),
  ]);
  let n = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]! - y[i]!) > 8) n++;
  return n;
}

describe('signaturePlacement', () => {
  it('sits inside the bottom-right corner, not against it', () => {
    const at = signaturePlacement({ width: 1000, height: 800 }, { width: 200, height: 40 });
    expect(at.left).toBeLessThan(1000 - 200);
    expect(at.top).toBeLessThan(800 - 40);
    // an inset proportional to the picture, so it reads the same at any size
    expect(1000 - 200 - at.left).toBeGreaterThan(10);
  });

  it('never places it off the picture, however odd the shape', () => {
    const at = signaturePlacement({ width: 100, height: 90 }, { width: 400, height: 60 });
    expect(at.left).toBeGreaterThanOrEqual(0);
    expect(at.top).toBeGreaterThanOrEqual(0);
  });
});

describe('renderSignature', () => {
  it('scales with the picture, within readable bounds', async () => {
    const small = await sharp(await renderSignature({ username: 'ada', width: 300, height: 300 })).metadata();
    const large = await sharp(await renderSignature({ username: 'ada', width: 3000, height: 3000 })).metadata();
    expect(large.height!).toBeGreaterThan(small.height!);
    // a mark too small to read is decoration; one too large is graffiti
    expect(small.height!).toBeGreaterThanOrEqual(22);
    expect(large.height!).toBeLessThanOrEqual(56);
  });

  it('grows wider for a longer handle so the name is not clipped', async () => {
    const short = await sharp(await renderSignature({ username: 'ap', width: 900, height: 700 })).metadata();
    const long = await sharp(await renderSignature({ username: 'averylonghandle', width: 900, height: 700 })).metadata();
    expect(long.width!).toBeGreaterThan(short.width!);
  });

  it('cannot be broken out of by a hostile handle', async () => {
    // usernames are validated on the way in, but a mark that trusts its input is
    // one schema change away from being an injection point
    const png = await renderSignature({ username: '"><script>x</script>', width: 900, height: 700 });
    expect(png.length).toBeGreaterThan(0);
    expect((await sharp(png).metadata()).format).toBe('png');
  });
});

describe('signPicture', () => {
  it('marks the bottom-right and leaves the rest of the picture alone', async () => {
    const base = await picture(900, 700);
    const res = await signPicture(base, 'hamude');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(await changed(base, res.signed, { left: 620, top: 600, width: 260, height: 90 })).toBeGreaterThan(500);
    // the picture is the point; the mark is a corner of it
    expect(await changed(base, res.signed, { left: 0, top: 0, width: 300, height: 300 })).toBe(0);
  });

  it('keeps the size and format of the picture', async () => {
    const res = await signPicture(await picture(640, 480), 'ada');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const meta = await sharp(res.signed).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
    expect(meta.format).toBe('webp');
  });

  it('signs a dark picture and a bright one alike', async () => {
    // a plain white handle disappears into half the photos people post, which is
    // why the mark carries its own plate
    for (const rgb of [{ r: 5, g: 5, b: 5 }, { r: 250, g: 250, b: 250 }]) {
      const base = await picture(800, 600, rgb);
      const res = await signPicture(base, 'ada');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(await changed(base, res.signed, { left: 540, top: 510, width: 250, height: 80 })).toBeGreaterThan(500);
    }
  });

  it('leaves a picture too small to mark unsigned rather than covering it', async () => {
    const res = await signPicture(await picture(40, 30), 'ada');
    expect(res.ok).toBe(false);
  });

  it('says why rather than throwing when it cannot sign', async () => {
    const res = await signPicture(Buffer.from('not an image'), 'ada');
    // an upload must not fail because the mark could not be drawn
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(typeof res.reason).toBe('string');
  });
});
