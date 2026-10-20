// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { artSrc, checkFile, checkSize, skuFrom, uploadProblem } from './art';

describe('where art is drawn from', () => {
  it('resolves the art that ships against the website, and leaves an uploaded picture’s URL alone', () => {
    expect(artSrc('/cosmetics/icons/made-08-caydan.png')).toBe('https://hevalo.app/cosmetics/icons/made-08-caydan.png');
    expect(artSrc('cosmetics/icons/x.png')).toBe('https://hevalo.app/cosmetics/icons/x.png');
    expect(artSrc('https://media.hevalo.app/cosmetic/icon/a.png')).toBe('https://media.hevalo.app/cosmetic/icon/a.png');
    expect(artSrc('blob:http://admin.test/1')).toBe('blob:http://admin.test/1');
    expect(artSrc(null)).toBeNull();
  });
});

describe('the checks before a picture is sent', () => {
  it('takes PNG, WebP and JPEG under 5 MB, and says why it will not take the rest', () => {
    expect(checkFile({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(checkFile({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(checkFile({ name: 'a.svg', type: 'image/svg+xml', size: 1000 })).toMatch(/SVG files can’t be used/);
    expect(checkFile({ name: 'a.gif', type: 'image/gif', size: 1000 })).toBe('That file isn’t a PNG, WebP or JPEG picture.');
    expect(checkFile({ name: 'a.png', type: 'image/png', size: 7.5 * 1024 * 1024 })).toBe(
      'That file is 7.5 MB; the limit is 5 MB. Export it smaller and try again.',
    );
  });

  it('wants a background 16:9 and an icon square, trimming only a sliver', () => {
    expect(checkSize('background', 1920, 1080)).toBeNull();
    expect(checkSize('background', 1940, 1080)).toBeNull();
    expect(checkSize('background', 1600, 1200)).toBe('A background must be 16:9, like 1920×1080. This picture is 1600×1200.');
    expect(checkSize('icon', 512, 512)).toBeNull();
    expect(checkSize('icon', 600, 400)).toBe('An icon must be square, like 512×512. This picture is 600×400.');
  });

  it('wants it big enough to look sharp', () => {
    expect(checkSize('background', 960, 540)).toMatch(/at least 1280×720/);
    expect(checkSize('icon', 128, 128)).toMatch(/at least 256×256/);
  });
});

describe('the server’s refusals', () => {
  it('are said in words an admin can act on', () => {
    expect(uploadProblem('icon', new ApiError(503, 'STORAGE_UNAVAILABLE', 'x'))).toMatch(/storage isn’t set up/);
    expect(uploadProblem('background', new ApiError(413, 'FST_ERR_CTP_BODY_TOO_LARGE', 'x'))).toMatch(/over the 5 MB limit/);
    expect(uploadProblem('background', new ApiError(422, 'WRONG_SHAPE', 'x', { width: 800, height: 800 }))).toMatch(/must be 16:9/);
    expect(uploadProblem('background', new ApiError(422, 'IMAGE_TOO_DETAILED', 'x'))).toMatch(/fit in 120 KB/);
    expect(uploadProblem('icon', new ApiError(415, 'INVALID_IMAGE', 'x'))).toBe('That file isn’t a PNG, WebP or JPEG picture.');
  });
});

describe('a new item’s SKU', () => {
  it('is made from its name, without the letters’ marks', () => {
    expect(skuFrom('background', 'Şeva Sor')).toBe('bg-seva-sor');
    expect(skuFrom('icon', 'Îstîkan!')).toBe('icon-istikan');
    expect(skuFrom('icon', '  ')).toBe('');
  });
});
