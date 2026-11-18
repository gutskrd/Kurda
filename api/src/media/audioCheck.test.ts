import { describe, expect, it } from 'vitest';
import { checkAudio, type AudioCheck } from './audioCheck.js';
import { RECORDED, box, ebml, id3, m4a, mp3, wav, webm } from '../test/audio-files.js';

const opts = { allowedTypes: new Set(['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav']), maxSeconds: 120 };
const HTML = Buffer.from('<html><body><script>alert(document.domain)</script></body></html>');
/** The start of a zip archive followed by a page, as a polyglot would carry it. */
const ZIP = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(26), HTML, Buffer.from('PK\x05\x06'), Buffer.alloc(18)]);

const check = (bytes: Buffer, over: Partial<typeof opts> = {}): AudioCheck => checkAudio(bytes, { ...opts, ...over });
const reason = (res: AudioCheck): string => (res.ok ? 'ok' : res.reason);
/** What the stored file must never hold once checked. */
const carried = (bytes: Buffer): string[] => ['<script', '<html', 'PK\x03\x04', 'PK\x05\x06', 'alert('].filter((m) => bytes.includes(m));

describe('checkAudio', () => {
  it('takes what recorders write, and changes nothing when nothing rides along', () => {
    for (const [name, file] of Object.entries(RECORDED)) {
      const res = check(file);
      expect(res.ok, name).toBe(true);
      if (!res.ok) continue;
      expect(res.durationMs, name).toBeGreaterThan(250);
      expect(res.durationMs, name).toBeLessThan(700);
    }
    for (const file of [m4a(), m4a({ moovFirst: true }), webm(), webm({ streamed: true }), mp3()]) {
      const res = check(file);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.bytes.equals(file)).toBe(true);
    }
    expect(check(RECORDED.m4a)).toMatchObject({ ok: true, type: 'audio/mp4' });
    expect(check(RECORDED.fragmented)).toMatchObject({ ok: true, type: 'audio/mp4' });
    expect(check(RECORDED.webm)).toMatchObject({ ok: true, type: 'audio/webm' });
    expect(check(RECORDED.mp3)).toMatchObject({ ok: true, type: 'audio/mpeg' });
  });

  it('measures the recording from its own container', () => {
    expect(check(m4a({ seconds: 3 }))).toMatchObject({ ok: true, durationMs: expect.closeTo(3000, -2) });
    expect(check(webm({ seconds: 3 }))).toMatchObject({ ok: true, durationMs: expect.closeTo(2980, -2) });
    expect(check(mp3(115))).toMatchObject({ ok: true, durationMs: expect.closeTo(3004, -1) });
  });

  it('refuses a file that only starts like audio', () => {
    expect(reason(check(Buffer.concat([Buffer.from('ID3'), HTML])))).toBe('malformed');
    expect(reason(check(Buffer.concat([Buffer.from([0xff, 0xfb]), HTML])))).toBe('malformed');
    expect(reason(check(Buffer.concat([Buffer.from('ID3\x03\0\0\0\0\x11\x11'), Buffer.alloc(512, 0x11)])))).toBe('malformed');
    expect(reason(check(Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypM4A \0\0\0\0M4A '), HTML])))).toBe('malformed');
    const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84]);
    expect(reason(check(Buffer.concat([ebmlHeader, Buffer.from('webm'), Buffer.alloc(512, 0x22)])))).toBe('malformed');
    expect(reason(check(HTML))).toBe('invalid-type');
    expect(reason(check(Buffer.alloc(0)))).toBe('invalid-type');
  });

  it('refuses anything appended after the container', () => {
    for (const file of [RECORDED.m4a, RECORDED.fragmented, RECORDED.webm, RECORDED.mp3, m4a(), webm()]) {
      expect(reason(check(Buffer.concat([file, HTML])))).toBe('malformed');
      expect(reason(check(Buffer.concat([file, ZIP])))).toBe('malformed');
    }
  });

  it('empties the places in an MP4 where another file could ride along', () => {
    const tagged = m4a({ moovExtra: [box('udta', box('meta', Buffer.alloc(4), box('ilst', box('covr', HTML))))] });
    const files = [
      tagged,
      Buffer.concat([m4a(), box('uuid', Buffer.alloc(16, 0xab), HTML)]),
      Buffer.concat([m4a(), box('free', ZIP)]),
      Buffer.concat([m4a({ moovFirst: true }), box('skip', ZIP)]),
      // bytes in the media data that no sample uses
      m4a({ moovFirst: true, mdatExtra: ZIP }),
      m4a({ mdatExtra: HTML }),
    ];
    for (const file of files) {
      expect(carried(file).length).toBeGreaterThan(0);
      const res = check(file);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(carried(res.bytes)).toEqual([]);
      // same length, so every offset in the file still points where it did
      expect(res.bytes.length).toBe(file.length);
    }
  });

  it('empties tags, attachments and padding in a WebM', () => {
    const tags = ebml(0x1254c367, ebml(0x7373, ebml(0x67c8, ebml(0x45a3, Buffer.from('COMMENT')), ebml(0x4487, HTML))));
    const attachment = ebml(0x1941a469, ebml(0x61a7, ebml(0x466e, Buffer.from('page.html')), ebml(0x465c, ZIP)));
    for (const file of [webm({ segmentExtra: [tags] }), webm({ segmentExtra: [attachment], streamed: true }), webm({ segmentExtra: [ebml(0xec, ZIP)] })]) {
      const res = check(file);
      expect(res.ok).toBe(true);
      if (res.ok) expect(carried(res.bytes)).toEqual([]);
    }
  });

  it('keeps only the frames of an MP3, dropping its tags', () => {
    const frames = mp3(20);
    const geob = Buffer.concat([Buffer.from([0]), Buffer.from('application/zip\0p.zip\0payload\0'), ZIP]);
    const v1 = Buffer.concat([Buffer.from('TAG'), Buffer.alloc(125, 0x20)]);
    const res = check(Buffer.concat([id3(['GEOB', geob], ['COMM', Buffer.concat([Buffer.from([0]), Buffer.from('eng\0'), HTML])]), frames, v1]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bytes.equals(frames)).toBe(true);
  });

  it('writes a WAV as its format and samples alone', () => {
    const plain = wav(0.5);
    const extra = Buffer.concat([plain, Buffer.from('LIST'), Buffer.from([HTML.length, 0, 0, 0]), HTML]);
    extra.writeUInt32LE(extra.length - 8, 4);
    for (const file of [extra, Buffer.concat([plain, ZIP])]) {
      const res = check(file);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.bytes.equals(plain)).toBe(true);
    }
  });

  it('refuses a video, a picture track or any other kind of track', () => {
    expect(reason(check(m4a({ handler: 'vide' })))).toBe('not-sound');
    expect(reason(check(m4a({ handler: 'subt' })))).toBe('not-sound');
    expect(reason(check(webm({ trackType: 1, codec: 'V_VP8' })))).toBe('not-sound');
    expect(reason(check(webm({ codec: 'S_TEXT/UTF8' })))).toBe('not-sound');
  });

  it('refuses a recording longer than the limit, allowing a recorder’s overshoot', () => {
    const limit = { maxSeconds: 10 };
    expect(reason(check(m4a({ seconds: 12 }), limit))).toBe('ok');
    expect(reason(check(m4a({ seconds: 16 }), limit))).toBe('too-long');
    expect(reason(check(webm({ seconds: 16, streamed: true }), limit))).toBe('too-long');
    expect(reason(check(mp3(620), limit))).toBe('too-long');
    expect(reason(check(wav(16), limit))).toBe('too-long');
  });

  it('refuses script written into the sound itself', () => {
    const frames = mp3(20);
    frames.write('<script>alert(1)</script>', 600, 'latin1');
    expect(reason(check(frames))).toBe('not-sound');
    const page = webm();
    page.write('<!DOCTYPE html>', page.length - 20, 'latin1');
    expect(reason(check(page))).toBe('not-sound');
  });

  it('refuses a damaged file', () => {
    const file = m4a();
    expect(reason(check(file.subarray(0, file.length - 40)))).toBe('malformed');
    expect(reason(check(RECORDED.fragmented.subarray(0, 900)))).toBe('malformed');
    expect(reason(check(webm().subarray(0, 700)))).toBe('malformed');
    // a sample said to be outside the media data
    const moved = m4a();
    moved.writeUInt32BE(10, moved.length - 4);
    expect(reason(check(moved))).toBe('malformed');
    // junk between frames
    const frames = mp3(20);
    expect(reason(check(Buffer.concat([frames.subarray(0, 417 * 5), Buffer.alloc(30, 0x41), frames.subarray(417 * 5)])))).toBe('malformed');
  });

  it('refuses a type the caller does not take', () => {
    expect(reason(check(wav(1), { allowedTypes: new Set(['audio/mp4']) }))).toBe('invalid-type');
  });
});
