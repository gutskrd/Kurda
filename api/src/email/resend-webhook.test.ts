import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyResendSignature, WEBHOOK_TOLERANCE_SECONDS } from './resend-webhook.js';
import { headerLine, htmlToPreviewText, parseMailbox, replySubject, threadIdOf } from './support-inbox.js';

const KEY = Buffer.from('a-test-signing-key-of-some-length');
const SECRET = `whsec_${KEY.toString('base64')}`;
const NOW = 1_800_000_000;

/** A signature as Resend makes one. */
const sign = (body: string, id = 'msg_1', ts = NOW, key = KEY): string =>
  `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`;

describe('verifyResendSignature', () => {
  const body = '{"type":"email.received","data":{"email_id":"e1"}}';

  it('accepts what Resend signed with our secret', () => {
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: sign(body) }, body, NOW)).toBe(true);
  });

  it('accepts any one of several signatures, as while a secret is rotated', () => {
    const signature = `v1,bm90LWl0 ${sign(body)}`;
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(NOW), signature }, body, NOW)).toBe(true);
  });

  it('refuses another secret, another body, another id, and a missing header', () => {
    const other = sign(body, 'msg_1', NOW, Buffer.from('somebody-else'));
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: other }, body, NOW)).toBe(false);
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: sign(body) }, `${body} `, NOW)).toBe(false);
    expect(verifyResendSignature(SECRET, { id: 'msg_2', timestamp: String(NOW), signature: sign(body) }, body, NOW)).toBe(false);
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(NOW) }, body, NOW)).toBe(false);
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(NOW), signature: 'v2,abc' }, body, NOW)).toBe(false);
  });

  it('refuses a signature too old or from the future, which is how a replay looks', () => {
    const old = NOW - WEBHOOK_TOLERANCE_SECONDS - 1;
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(old), signature: sign(body, 'msg_1', old) }, body, NOW)).toBe(false);
    const ahead = NOW + WEBHOOK_TOLERANCE_SECONDS + 1;
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: String(ahead), signature: sign(body, 'msg_1', ahead) }, body, NOW)).toBe(
      false,
    );
    expect(verifyResendSignature(SECRET, { id: 'msg_1', timestamp: 'soon', signature: sign(body) }, body, NOW)).toBe(false);
  });
});

describe('support mail helpers', () => {
  it('reads an address and a name out of a From', () => {
    expect(parseMailbox('Rojda Kurd <Rojda@Example.com>')).toEqual({ address: 'rojda@example.com', name: 'Rojda Kurd' });
    expect(parseMailbox('"Baran, B." <b@x.test>')).toEqual({ address: 'b@x.test', name: 'Baran, B.' });
    expect(parseMailbox(' b@x.test ')).toEqual({ address: 'b@x.test', name: null });
    expect(parseMailbox('<b@x.test>')).toEqual({ address: 'b@x.test', name: null });
  });

  it('says Re: once', () => {
    expect(replySubject('Help with my account')).toBe('Re: Help with my account');
    expect(replySubject('RE: Help')).toBe('RE: Help');
    expect(replySubject('  ')).toBe('Re: (no subject)');
  });

  it('answers on one line, whatever line breaks the subject arrived with', () => {
    // an encoded line break in a received subject would start a header of the sender's choosing
    expect(replySubject('Help\r\nBcc: everyone@example.com')).toBe('Re: Help Bcc: everyone@example.com');
    expect(headerLine('a\u0000b\tc\n\nd\u0007')).toBe('ab c d');
  });

  it('threads an answer under a plain message id only', () => {
    expect(threadIdOf('<abc.123@mail.example.com>')).toBe('<abc.123@mail.example.com>');
    expect(threadIdOf('abc.123@mail.example.com')).toBe('<abc.123@mail.example.com>');
    expect(threadIdOf('<a@b>\r\nBcc: everyone@example.com')).toBeNull();
    expect(threadIdOf('<a@b> <c@d>')).toBeNull();
    expect(threadIdOf('')).toBeNull();
    expect(threadIdOf(null)).toBeNull();
  });

  it('turns HTML into a line of text, leaving out styles and scripts', () => {
    expect(htmlToPreviewText('<style>p{color:red}</style><p>Silav&nbsp;<b>heval</b> &amp; hi</p><script>x()</script>')).toBe(
      'Silav heval & hi',
    );
    expect(htmlToPreviewText('<html><HEAD><title>t</title></HEAD><body><p>Hello</p></body></html>')).toBe('Hello');
    // <header> is not <head>: what it holds is shown
    expect(htmlToPreviewText('<header>Top</header><p>Body</p>')).toBe('Top Body');
    // a block that never ends hides nothing after it
    expect(htmlToPreviewText('<style>p{} <p>Still here</p>')).toBe('p{} Still here');
    // an escaped entity is shown as written, not decoded twice
    expect(htmlToPreviewText('<p>&amp;lt;b&amp;gt;</p>')).toBe('&lt;b&gt;');
  });

  it('takes time in proportion to the mail, whatever the mail is made of', () => {
    // anyone can mail support, and every listed mail is previewed: bodies built
    // to make a pattern rescan to the end from each tag must not hold the server
    const size = 200_000;
    for (const unit of ['<style>', '<script ', '<head', '<', '<style><', '</style']) {
      const body = unit.repeat(Math.ceil(size / unit.length));
      const started = performance.now();
      htmlToPreviewText(body);
      expect(performance.now() - started, unit).toBeLessThan(250);
    }
  });
});
