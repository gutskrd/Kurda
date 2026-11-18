/**
 * Recordings for tests of the audio guard (media/audioCheck.ts): a few written by a real encoder, and builders for small
 * complete files of each container whose parts a test can change. Each builds a file the guard accepts as it is.
 */

/** A box (an ISO base media file's unit): its size, its type and what it holds. */
export function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

/** A full box: version and flags before what it holds. */
const fullBox = (type: string, version: number, flags: number, ...parts: Buffer[]): Buffer => {
  const vf = Buffer.alloc(4);
  vf.writeUInt32BE(((version << 24) | flags) >>> 0, 0);
  return box(type, vf, ...parts);
};

const u32 = (...values: number[]): Buffer => {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeUInt32BE(v >>> 0, i * 4));
  return b;
};

/** Bytes that vary with `seed`, standing in for coded sound. */
const noise = (length: number, seed: number): Buffer => {
  const b = Buffer.alloc(length);
  let x = (seed * 2654435761 + 1) >>> 0;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    b[i] = (x >>> 16) & 0xff;
  }
  return b;
};

/** An MP3 of `frames` MPEG-1 layer III frames, 128 kbit/s at 44.1 kHz: 417 bytes and about 26 ms each. */
export function mp3(frames = 40, seed = 0): Buffer {
  return Buffer.concat(
    Array.from({ length: frames }, (_, i) => {
      const frame = noise(417, seed * 1000 + i);
      frame.set([0xff, 0xfb, 0x90, 0xc4]);
      return frame;
    }),
  );
}

/** An ID3v2.3 tag holding these frames (`[id, body]`), the kind of tag an MP3 starts with. */
export function id3(...frames: Array<[string, Buffer]>): Buffer {
  const body = Buffer.concat(
    frames.map(([id, data]) => {
      const head = Buffer.alloc(10);
      head.write(id, 0, 'latin1');
      head.writeUInt32BE(data.length, 4);
      return Buffer.concat([head, data]);
    }),
  );
  const n = body.length;
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, (n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]), body]);
}

export interface M4aOptions {
  /** about how long it lasts */
  seconds?: number;
  seed?: number;
  /** the track's handler: 'soun' for sound, 'vide' for a video */
  handler?: string;
  /** the movie box before the media data, as a file prepared for streaming has it */
  moovFirst?: boolean;
  /** boxes added to the movie box, such as tags */
  moovExtra?: Buffer[];
  /** bytes in the media data after the samples */
  mdatExtra?: Buffer;
}

/** An m4a of one AAC track at 44.1 kHz in one chunk: ftyp, then the media data and movie in either order. */
export function m4a(opts: M4aOptions = {}): Buffer {
  const { seconds = 1, seed = 0, handler = 'soun', moovFirst = false, moovExtra = [], mdatExtra = Buffer.alloc(0) } = opts;
  const count = Math.max(1, Math.round((seconds * 44100) / 1024));
  const size = 64;
  const ticks = count * 1024;
  const ftyp = box('ftyp', Buffer.from('M4A '), u32(0), Buffer.from('M4A isom'));
  const mdat = box('mdat', noise(count * size, seed), mdatExtra);

  const moov = (chunkOffset: number): Buffer => {
    const ms = Math.round((ticks / 44100) * 1000);
    const matrix = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);
    const mvhd = fullBox('mvhd', 0, 0, u32(0, 0, 1000, ms, 0x00010000), Buffer.from([1, 0]), Buffer.alloc(10), matrix, Buffer.alloc(24), u32(2));
    const tkhd = fullBox('tkhd', 0, 7, u32(0, 0, 1, 0, ms, 0, 0), Buffer.from([0, 0, 0, 0, 1, 0, 0, 0]), matrix, u32(0, 0));
    const mdhd = fullBox('mdhd', 0, 0, u32(0, 0, 44100, ticks), Buffer.from([0x55, 0xc4, 0, 0]));
    const hdlr = fullBox('hdlr', 0, 0, u32(0), Buffer.from(handler, 'latin1'), Buffer.alloc(12), Buffer.from('Sound\0'));
    const esds = fullBox('esds', 0, 0, Buffer.from([3, 25, 0, 1, 0, 4, 17, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 2, 0x12, 0x08, 6, 1, 2]));
    const mp4a = box('mp4a', Buffer.alloc(6), Buffer.from([0, 1]), Buffer.alloc(8), Buffer.from([0, 1, 0, 16, 0, 0, 0, 0]), u32(44100 << 16), esds);
    const stbl = box(
      'stbl',
      fullBox('stsd', 0, 0, u32(1), mp4a),
      fullBox('stts', 0, 0, u32(1, count, 1024)),
      fullBox('stsc', 0, 0, u32(1, 1, count, 1)),
      fullBox('stsz', 0, 0, u32(size, count)),
      fullBox('stco', 0, 0, u32(1, chunkOffset)),
    );
    const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
    const minf = box('minf', fullBox('smhd', 0, 0, u32(0)), dinf, stbl);
    return box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd, hdlr, minf)), ...moovExtra);
  };

  if (!moovFirst) return Buffer.concat([ftyp, mdat, moov(ftyp.length + 8)]);
  const length = moov(0).length;
  return Buffer.concat([ftyp, moov(ftyp.length + length + 8), mdat]);
}

/** An EBML element: its id, its size in as few bytes as it takes, and what it holds. */
export function ebml(id: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const idBytes = Buffer.from(id.toString(16).padStart(id > 0xffffff ? 8 : id > 0xffff ? 6 : id > 0xff ? 4 : 2, '0'), 'hex');
  let size: Buffer;
  if (body.length < 0x7f) size = Buffer.from([0x80 | body.length]);
  else if (body.length < 0x3fff) size = Buffer.from([0x40 | (body.length >> 8), body.length & 0xff]);
  else {
    size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(body.length) | (1n << 56n));
  }
  return Buffer.concat([idBytes, size, body]);
}

/** An element of unknown size, as a recorder streaming its file writes a segment or cluster. */
export function ebmlOpen(id: number, ...parts: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from(id.toString(16), 'hex'), Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), ...parts]);
}

const uintEl = (id: number, value: number): Buffer => ebml(id, u32(value));

export interface WebmOptions {
  seconds?: number;
  seed?: number;
  /** 2 for audio, 1 for video */
  trackType?: number;
  codec?: string;
  /** a segment and clusters of unknown size, as a browser records */
  streamed?: boolean;
  /** elements added to the segment, such as tags */
  segmentExtra?: Buffer[];
}

/** A WebM of one Opus track: 20 ms blocks in clusters of a second. */
export function webm(opts: WebmOptions = {}): Buffer {
  const { seconds = 1, seed = 0, trackType = 2, codec = 'A_OPUS', streamed = false, segmentExtra = [] } = opts;
  const versions = [uintEl(0x4286, 1), uintEl(0x42f7, 1), uintEl(0x42f2, 4), uintEl(0x42f3, 8)];
  const header = ebml(0x1a45dfa3, ...versions, ebml(0x4282, Buffer.from('webm')), uintEl(0x4287, 4), uintEl(0x4285, 2));
  const info = ebml(0x1549a966, uintEl(0x2ad7b1, 1_000_000));
  const opusHead = ebml(0x63a2, Buffer.from('OpusHead'), Buffer.from([1, 1, 0x38, 1, 0x80, 0xbb, 0, 0, 0, 0, 0]));
  const tracks = ebml(0x1654ae6b, ebml(0xae, uintEl(0xd7, 1), uintEl(0x73c5, 1), uintEl(0x83, trackType), ebml(0x86, Buffer.from(codec)), opusHead));
  const blocks = Math.max(1, Math.round((seconds * 1000) / 20));
  const clusters: Buffer[] = [];
  for (let first = 0; first < blocks; first += 50) {
    const parts = [uintEl(0xe7, first * 20)];
    for (let i = first; i < Math.min(blocks, first + 50); i++) {
      const block = Buffer.concat([Buffer.from([0x81]), Buffer.from([((i - first) * 20) >> 8, ((i - first) * 20) & 0xff, 0x80]), noise(40, seed * 1000 + i)]);
      parts.push(ebml(0xa3, block));
    }
    clusters.push(streamed ? ebmlOpen(0x1f43b675, ...parts) : ebml(0x1f43b675, ...parts));
  }
  const segment = [info, tracks, ...segmentExtra, ...clusters];
  return Buffer.concat([header, streamed ? ebmlOpen(0x18538067, ...segment) : ebml(0x18538067, ...segment)]);
}

/** A mono 16-bit PCM WAV of `seconds` of a quiet hum. */
export function wav(seconds = 1, rate = 22050): Buffer {
  const data = Math.round(seconds * rate) * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(data, 40);
  for (let i = 0; i < data / 2; i++) b.writeInt16LE(Math.round(800 * Math.sin(i / 8)), 44 + i * 2);
  return b;
}

const decode = (lines: string[]): Buffer => Buffer.from(lines.join(''), 'base64');

/** Recordings as an encoder wrote them: 0.3 seconds of a tone, mono at 8 kHz. */
export const RECORDED = {
  /** AAC in an m4a, the movie box after the media data */
  m4a: decode([
      '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',
  ]),
  /** AAC in movie fragments, as a recorder streaming its file writes it */
  fragmented: decode([
      'AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAAAphtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAA',
      'AAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAABv3RyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAA',
      'AAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAVttZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAB9AAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAA',
      'AFNvdW5kSGFuZGxlcgAAAAEGbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAADKc3RibAAAAH5zdHNkAAAAAAAAAAEAAABubXA0',
      'YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAB9AAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAC7gAAAu4AWAgIAFFYhW5QAGgICAAQIAAAAUYnRydAAAAAAAAC7gAAAu4AAA',
      'ABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAA',
      'AAAAAD11ZHRhAAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAACEbW9vZgAAABBtZmhkAAAAAAAAAAEAAABsdHJhZgAAABx0ZmhkAAIA',
      'OAAAAAEAAAQAAAABHwIAAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAADR0cnVuAAADAQAAAAQAAACMAAAEAAAAAR8AAAQAAAABDQAABAAAAAEOAAABYAAAAAUAAANHbWRhdAEcUq1UVkI5',
      '1k57Zn5+/lMlEkjmIkSRBbVs21bNtWz+e+y/nvvv57773V2r3V2r3V2r+S/I/kvsv577LmLRujtG6O2LFoLForForPUwz1MNNYTFp5mKnbKxGYrZxbNPb3lsdakyuHe+Nbfcf5cxy6Rr',
      'XQeNbztWs4q42Kw1qdrVhrUbWo2OfY5SqUqlKoyu7dHbo1Y6sZJpJpJpJpJpJpJpGkaRnZ2eZ5nZ2kmkmkmeZ2kmkmkmkaRpJpJpJpJpJt63repZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZeAAPSc2alwKjhENoxiguzGLh/TP/w/9r9r64lyPt+n/p/5/iNX',
      'qXT9Pt/8f+36kvqtS/6/n/6f/P6k40smXRijwMujEnHLoxR4eHtQUlL6cRoooNRRuoooo3URssvyLboF7ix7Au0bqJdwNgdAdxD38PHv39GRbkTwW8S3Yq2CyCyGwHpgw8GFplnllr2z',
      'Z2Xvs2Rb2zZsI76RcI2iXF9k9hHZs2RX5Fd3LOeZcp9ShsMO9Jsk7CHeh3vHf8Z/GamCWqSq7kWeCxlJoQwIwdU888886p5551CdSlTzzz7J1G+jfRRS/OpetKHY58bXYN8T7j+qk3Qb',
      'LCaiLJpIpfL5Tz80/N8lTkSEHf+WyocBAp2xqXAqy0LkTehpbycvtz/8f+2vOur4knX/0z/8P/bXXHWtS2/+mf9P/IAv/3//Z48hLktDLowR5y76OeRhjhjJMTEwsVL0u3Kq3hbwkaRt',
      'SQwxc3GLmHERF8h8ouMXMriRI+Xy+Xy+XHYeKeriiIt9T0asTTpXQoVWF6n32xgfM+1ap5OFBQEGYaBnLgHA+HBOCaUiiiiiiiiiKIoooooiyxRREiKKKKKJ+IgQiJBVHUeqKqKIIhCp',
      '6NVrgEN3hydvguq88bMlMB5ZmcdgZchevkYmGfAxC2raSxEsw2w2w2wfMHzB8lnuWkuPYpyw3DrLdLepPCXpa+e8ENFDRUIqGKGKGKGJKiSokvABGIG0cAAAAENtZnJhAAAAK3RmcmEB',
      'AAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAACtAEBAQAAABBtZnJvAAAAAAAAAEM=',
  ]),
  /** Opus in a WebM whose segment and clusters have unknown sizes, as a browser records */
  webm: decode([
      'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmlSrXsYMPQkBNgIR0ZXN0V0GEdGVzdBZUrmvlrgEAAAAAAABc14EBc8WIAAAA',
      'AAAAAAGcgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4EC4ZGfgQG1iEC/QAAAAAAAYmSBEGOik09wdXNIZWFkAQE4AUAfAAAAAAASVMNnrXNzqmPAi2PFiAAAAAAAAAAB',
      'Z8iZRaOHRU5DT0RFUkSHjHRlc3QgZW5jb2Rlch9DtnUB/////////+eBAKORgQAAgAiDyiTjwiBoNB6qTeijm4EAFYAIpxpdipguX1rKUSvVPvkp16ixEKUrgKOTgQApgAihLxDkXfvc',
      'Btr7YpjRrKOXgQA9gAihONB3MqpWucFAgeY0bzYeHdKjlYEAUYAIoTjQdzKqXlKRxccuaQsDwKOVgQBlgAihSANG1VJz2oSWjfwmLnvQo5eBAHmACKE4zvwGRjhPTXryD4jHSahlHKOT',
      'gQCNgAihONB3MqpeTa4bXgbEyKOUgQChgAihONB3MqpWme+NHTNGG5SjlIEAtYAIoTjQdzKqXlFD7ztc3K57o5SBAMmACKE40HcvR3logzf5qcO9rKOUgQDdgAihONB3MqpWRgUwTxn3',
      '+qyjkoEA8YAIoS8Q5F373AbPAggy1KOTgQEFgAihTMA963GxDtVYVAGmkaOVgQEZgAihONB3Mqpej9RCURXiinYYoJuhkoEBLQAIg/ikhaHLxuEjjTW3gHWihADN/mA=',
  ]),
  /** MP3 frames alone, with no tag */
  mp3: decode([
      '/+MYxAAK8AbVuUEAAv9HcNtgBg+D4PvUCAIHIPg+fxOD4PoggcRB8H34IOu/wxwG/SGOXfznT7ulJoc4WcQ3/GVEJRyhC3+D/+MYxA8QmUKQAZRQAG8H6ge5ABlxEnAPiYDmR1gd6mHv',
      'gGgCQCorCKC6//IR6KpEPh8ab//5CgNCUJA1/4lOg0r//////////+MYxAcOaKY8Ad4AAP/////40iEYA4ASSQXAKMCsF4wfwajCHFKMQulwxvhNjDbBaMD0D4FAXiEAMDAKoSW07dP/',
      '/vgSpVAg/+MYxAgNqKYsAFa8YCmJFGfQGycnl9GIANucd+h5p+CpmGqC8YJQC5QA8gRBoACAVL6x////3+U///9azz/8MMMMM8/1hhzV/+MYxAwPUL5oAVwQAEl9vWGFeNzTKEU1rgQM',
      'GJB4d8rpuE3mLQiDgfTWXLf+N555552MBofg4c1ghyjuGOUqJEkxwEslUl49/+MYxAkO2OqYAZRYAIzA8CxrMkl+GKAt8A1rgBheUjJNHxmGgI5uTCejUz//7zQ3eCYkb/C4JiQLiv/i',
      'wuKi1UxBTUUzLjEw/+MYxAgAAANIAcAAADBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
  ]),
};
