/**
 * What goes into the head of a shared post.
 *
 * The risky half of this file is `attr`: a post is user-written text on its way
 * into an HTML attribute, so a miss there is a stored XSS that fires in every
 * chat app that unfurls the link. The rest is about a preview reading well —
 * ending on a word, naming the author, not claiming a picture it does not have.
 */
import { describe, expect, it } from 'vitest';
import { __test } from './worker';

const { routeFor, attr, trim, previewOf } = __test;

describe('which paths get a preview', () => {
  it('recognises a post and a picture', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(routeFor(`/app/library/${id}`)).toEqual({ api: `/library/posts/${id}`, kind: 'library' });
    expect(routeFor(`/app/dimen/${id}`)).toEqual({ api: `/images/${id}`, kind: 'image' });
    expect(routeFor(`/app/library/${id}/`)).not.toBeNull();
  });

  it('looks nothing up for a path that is not a post', () => {
    // the worker is not a proxy for whatever someone puts in the URL
    for (const path of ['/', '/app/civak', '/app/users/x', '/assets/index.js', '/app/library']) {
      expect(routeFor(path), path).toBeNull();
    }
  });

  it('refuses an id that is not a UUID, however it is dressed up', () => {
    for (const bad of [
      '../../etc/passwd',
      'not-a-uuid',
      '11111111-2222-4333-8444-555555555555%20extra',
      '..%2f..%2fadmin',
      '11111111222243338444555555555555',
    ]) {
      expect(routeFor(`/app/library/${bad}`), bad).toBeNull();
    }
  });
});

describe('escaping', () => {
  it('closes every way out of an attribute', () => {
    expect(attr('"><script>alert(1)</script>')).toBe(
      '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(attr("' onmouseover='alert(1)")).toBe('&#39; onmouseover=&#39;alert(1)');
    // & first, or the escapes themselves become a way back out
    expect(attr('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('leaves ordinary Kurdish text alone', () => {
    expect(attr('Çîrokek bi kurdî — helbest û gotin')).toBe('Çîrokek bi kurdî — helbest û gotin');
    expect(attr('چیرۆکێک بە کوردی')).toBe('چیرۆکێک بە کوردی');
  });
});

describe('trimming', () => {
  it('leaves a short line as it is', () => {
    expect(trim('A short title', 70)).toBe('A short title');
  });

  it('collapses the line breaks a poem is full of', () => {
    expect(trim('Lines break\n  where the poet\n\nput them', 70)).toBe('Lines break where the poet put them');
  });

  it('ends on a whole word, not mid-word', () => {
    const source = 'the quick brown fox jumps over the lazy dog';
    const out = trim(source, 20);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);

    // what is left must be a run of whole words from the start of the source —
    // "the quick brown fox", never "the quick brown f"
    const kept = out.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length]).toBe(' ');
  });

  it('still cuts when there is no word boundary to cut on', () => {
    const out = trim('a'.repeat(60), 20);
    expect(out).toHaveLength(21); // 20 + the ellipsis
  });
});

describe('what a preview says', () => {
  const author = { username: 'rojîn' };

  it('names the post and who wrote it', () => {
    const p = previewOf({ title: 'Helbesta çiya', body: 'Çiya bilind in.', author }, 'library')!;
    expect(p.title).toBe('Helbesta çiya · @rojîn');
    expect(p.description).toBe('Çiya bilind in.');
  });

  it('falls back to the byline for a picture, which usually has no title', () => {
    const p = previewOf({ caption: 'Li Hewlêrê', author, imageUrl: 'https://cdn.test/a.webp' }, 'image')!;
    expect(p.title).toBe('A picture on MyKurda · @rojîn');
    expect(p.description).toBe('Li Hewlêrê');
    expect(p.image).toBe('https://cdn.test/a.webp');
  });

  it('says something rather than nothing when a post has no words', () => {
    const p = previewOf({ title: 'Wêne', author }, 'image')!;
    expect(p.description).toContain('MyKurda');
  });

  it('claims no picture it cannot vouch for', () => {
    // an http:// or javascript: value in og:image is not a picture, it is a
    // request made by whoever opens the preview
    for (const bad of ['http://cdn.test/a.webp', 'javascript:alert(1)', '/relative.webp', '']) {
      expect(previewOf({ title: 'x', author, imageUrl: bad }, 'image')!.image, bad).toBeNull();
    }
  });

  it('survives a post that is missing everything', () => {
    const p = previewOf({}, 'library')!;
    expect(p.title).toBe('A post on MyKurda');
    expect(p.description).toContain('MyKurda');
    expect(p.image).toBeNull();
  });

  it('keeps a long title inside what a card will show', () => {
    const p = previewOf({ title: 'x'.repeat(200), author }, 'library')!;
    // the ellipsis and the byline are the only things past the cut
    expect(p.title.length).toBeLessThan(90);
    expect(p.title.endsWith('· @rojîn')).toBe(true);
  });
});
