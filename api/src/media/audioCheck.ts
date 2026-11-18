/**
 * The guard for audio uploads, which are stored as sent rather than re-encoded. The container is read from end to end:
 * every byte must belong to it, every track must be sound, and the recording must be within the length limit. The
 * places where another file could ride along are emptied: MP4 and WebM tags, cover art, attachments and padding are
 * blanked in place, keeping every offset in the file true, MP4 media bytes no sample uses are zeroed, MP3 tags are
 * dropped, and a WAV is rewritten as its format and samples alone. The declared type plays no part.
 */
import { sniffAudioType, type SniffedAudioType } from './mimeSniff.js';
import { plainWav } from './wav.js';

export type AudioReject = 'invalid-type' | 'malformed' | 'not-sound' | 'too-long';

export type AudioCheck =
  | { ok: true; type: SniffedAudioType; bytes: Buffer; durationMs: number }
  | { ok: false; reason: AudioReject };

export interface AudioCheckOptions {
  allowedTypes: ReadonlySet<string>;
  maxSeconds: number;
}

/** How far past the limit a recording may run, since a recorder stopped by a timer overshoots a little. */
const LENGTH_SLACK_MS = 5_000;

/**
 * Text that marks a web page or script inside what claims to be sound. Each is long enough that compressed audio
 * spells it by chance far less than once in a billion uploads.
 */
const MARKUP = ['<script', '<iframe', '<object', '<!doctype', 'javascript:'];

class Rejected extends Error {
  constructor(readonly reason: 'malformed' | 'not-sound') {
    super(reason);
  }
}

function need(ok: boolean): void {
  if (!ok) throw new Rejected('malformed');
}

interface Read {
  bytes: Buffer;
  durationMs: number;
}

export function checkAudio(raw: Buffer, opts: AudioCheckOptions): AudioCheck {
  const type = sniffAudioType(raw);
  if (!type || !opts.allowedTypes.has(type)) return { ok: false, reason: 'invalid-type' };
  let read: Read;
  try {
    read = READERS[type](raw);
  } catch (err) {
    if (err instanceof Rejected) return { ok: false, reason: err.reason };
    // a length or offset pointing past the end of the file
    if (err instanceof RangeError) return { ok: false, reason: 'malformed' };
    throw err;
  }
  if (!(read.durationMs > 0)) return { ok: false, reason: 'malformed' };
  if (read.durationMs > opts.maxSeconds * 1000 + LENGTH_SLACK_MS) return { ok: false, reason: 'too-long' };
  const text = read.bytes.toString('latin1').toLowerCase();
  if (MARKUP.some((m) => text.includes(m))) return { ok: false, reason: 'not-sound' };
  return { ok: true, type, bytes: read.bytes, durationMs: Math.round(read.durationMs) };
}

const READERS: Record<SniffedAudioType, (raw: Buffer) => Read> = {
  'audio/mp4': readMp4,
  'audio/webm': readWebm,
  'audio/mpeg': readMp3,
  'audio/wav': (raw) => {
    const wav = plainWav(raw);
    need(wav !== null);
    return wav!;
  },
};

// ───────────────────────────────────────────────────────────── MP4 (ISO base media)

interface Box {
  type: string;
  start: number;
  /** where the size field and type end, before any extended type */
  sizeEnd: number;
  body: number;
  end: number;
}

/** The boxes filling `from`–`to` exactly; a size of 0 (to the end of the file) only at the top. */
function boxesIn(b: Buffer, from: number, to: number, top = false): Box[] {
  const out: Box[] = [];
  for (let at = from; at < to; ) {
    need(to - at >= 8);
    let size = b.readUInt32BE(at);
    const type = b.toString('latin1', at + 4, at + 8);
    let sizeEnd = at + 8;
    if (size === 1) {
      need(to - at >= 16);
      const large = b.readBigUInt64BE(at + 8);
      need(large <= BigInt(to - at));
      size = Number(large);
      sizeEnd = at + 16;
    } else if (size === 0) {
      need(top);
      size = to - at;
    }
    const body = sizeEnd + (type === 'uuid' ? 16 : 0);
    need(at + size >= body && at + size <= to);
    out.push({ type, start: at, sizeEnd, body, end: at + size });
    at += size;
  }
  return out;
}

/** Turns a box into empty free space of the same length, so every offset after it stays true. */
function blank(b: Buffer, box: Box): void {
  b.write('free', box.start + 4, 'latin1');
  b.fill(0, box.sizeEnd, box.end);
}

/** What may stay in each box the reader opens; any other box there (tags, cover art, free space) is blanked. */
const KEEP: Record<string, ReadonlySet<string>> = {
  file: new Set(['ftyp', 'styp', 'moov', 'moof', 'mdat']),
  moov: new Set(['mvhd', 'trak', 'mvex', 'iods']),
  trak: new Set(['tkhd', 'mdia', 'edts']),
  edts: new Set(['elst']),
  mdia: new Set(['mdhd', 'hdlr', 'minf', 'elng']),
  minf: new Set(['smhd', 'dinf', 'stbl', 'hdlr']),
  stbl: new Set([
    ...['stsd', 'stts', 'ctts', 'cslg', 'stsc', 'stsz', 'stz2', 'stco', 'co64'],
    ...['stss', 'stps', 'sdtp', 'sbgp', 'sgpd', 'subs', 'saiz', 'saio', 'padb', 'stsh'],
  ]),
  mvex: new Set(['mehd', 'trex', 'leva']),
  moof: new Set(['mfhd', 'traf']),
  traf: new Set(['tfhd', 'trun', 'tfdt', 'sbgp', 'sgpd', 'subs', 'saiz', 'saio']),
};

/** The boxes kept inside `parent`, the others blanked. */
function open(b: Buffer, parent: Box, keep: ReadonlySet<string>): Map<string, Box[]> {
  const kept = new Map<string, Box[]>();
  for (const box of boxesIn(b, parent.body, parent.end)) {
    if (!keep.has(box.type)) {
      blank(b, box);
      continue;
    }
    kept.set(box.type, [...(kept.get(box.type) ?? []), box]);
  }
  return kept;
}

const one = (boxes: Map<string, Box[]>, type: string): Box | undefined => {
  const found = boxes.get(type) ?? [];
  need(found.length <= 1);
  return found[0];
};

/** The 3-byte flags of a full box. */
const flagsOf = (b: Buffer, box: Box): number => b.readUIntBE(box.body + 1, 3);

/** A header's timescale and duration (mvhd and mdhd share the layout). */
function timing(b: Buffer, box: Box): { timescale: number; duration: number } {
  return b[box.body] === 1
    ? { timescale: b.readUInt32BE(box.body + 20), duration: Number(b.readBigUInt64BE(box.body + 24)) }
    : { timescale: b.readUInt32BE(box.body + 12), duration: b.readUInt32BE(box.body + 16) };
}

interface Track {
  timescale: number;
  /** ticks of the track's timescale: the more of its header's and its sample table's */
  ticks: number;
  /** ticks its fragments add up to */
  fragmentTicks: number;
  /** defaults for fragments (trex) */
  sampleDuration: number;
  sampleSize: number;
}

interface Movie {
  timescale: number;
  /** ticks of the movie's timescale: its header, edit lists, fragment header */
  ticks: number;
  tracks: Map<number, Track>;
  /** byte ranges holding samples */
  samples: Array<[number, number]>;
}

function readMp4(raw: Buffer): Read {
  const b = Buffer.from(raw);
  const top = boxesIn(b, 0, b.length, true);
  // brands are 4 bytes each after the major brand and version; a long list is somewhere to hide things
  const brands = top[0]?.type === 'ftyp' ? top[0].end - top[0].body : 0;
  need(brands >= 8 && brands <= 128 && brands % 4 === 0);
  const moovs = top.filter((box) => box.type === 'moov');
  need(moovs.length === 1);
  for (const box of top) if (!KEEP.file!.has(box.type)) blank(b, box);

  const movie = readMovie(b, moovs[0]!);
  for (const moof of top.filter((box) => box.type === 'moof')) readFragment(b, moof, movie);
  clearUnusedMedia(b, top.filter((box) => box.type === 'mdat'), movie.samples);

  let seconds = movie.ticks / movie.timescale;
  for (const track of movie.tracks.values()) seconds = Math.max(seconds, Math.max(track.ticks, track.fragmentTicks) / track.timescale);
  return { bytes: b, durationMs: seconds * 1000 };
}

function readMovie(b: Buffer, moov: Box): Movie {
  const boxes = open(b, moov, KEEP.moov!);
  const mvhd = one(boxes, 'mvhd');
  need(mvhd !== undefined);
  const { timescale, duration } = timing(b, mvhd!);
  need(timescale > 0);
  const movie: Movie = { timescale, ticks: duration, tracks: new Map(), samples: [] };

  for (const trak of boxes.get('trak') ?? []) readTrack(b, trak, movie);
  need(movie.tracks.size > 0);

  const mvex = one(boxes, 'mvex');
  if (mvex) {
    const ext = open(b, mvex, KEEP.mvex!);
    const mehd = one(ext, 'mehd');
    if (mehd) movie.ticks = Math.max(movie.ticks, b[mehd.body] === 1 ? Number(b.readBigUInt64BE(mehd.body + 4)) : b.readUInt32BE(mehd.body + 4));
    for (const trex of ext.get('trex') ?? []) {
      const track = movie.tracks.get(b.readUInt32BE(trex.body + 4));
      need(track !== undefined);
      track!.sampleDuration = b.readUInt32BE(trex.body + 12);
      track!.sampleSize = b.readUInt32BE(trex.body + 16);
    }
  }
  return movie;
}

function readTrack(b: Buffer, trak: Box, movie: Movie): void {
  const boxes = open(b, trak, KEEP.trak!);
  const tkhd = one(boxes, 'tkhd');
  const mdia = one(boxes, 'mdia');
  need(tkhd !== undefined && mdia !== undefined);
  const id = b.readUInt32BE(tkhd!.body + (b[tkhd!.body] === 1 ? 20 : 12));
  need(!movie.tracks.has(id));

  const media = open(b, mdia!, KEEP.mdia!);
  const hdlr = one(media, 'hdlr');
  const mdhd = one(media, 'mdhd');
  const minf = one(media, 'minf');
  need(hdlr !== undefined && mdhd !== undefined && minf !== undefined);
  // a video, a picture, subtitles or anything else is not a voice recording
  if (b.toString('latin1', hdlr!.body + 8, hdlr!.body + 12) !== 'soun') throw new Rejected('not-sound');
  const { timescale, duration } = timing(b, mdhd!);
  need(timescale > 0);
  const track: Track = { timescale, ticks: duration, fragmentTicks: 0, sampleDuration: 0, sampleSize: 0 };
  movie.tracks.set(id, track);

  const edts = one(boxes, 'edts');
  const elst = edts ? one(open(b, edts, KEEP.edts!), 'elst') : undefined;
  if (elst) {
    const wide = b[elst.body] === 1;
    const count = b.readUInt32BE(elst.body + 4);
    const entry = wide ? 20 : 12;
    need(elst.body + 8 + count * entry <= elst.end);
    let edited = 0;
    for (let i = 0, at = elst.body + 8; i < count; i++, at += entry) edited += wide ? Number(b.readBigUInt64BE(at)) : b.readUInt32BE(at);
    movie.ticks = Math.max(movie.ticks, edited);
  }

  const stbl = one(open(b, minf!, KEEP.minf!), 'stbl');
  need(stbl !== undefined);
  readSampleTable(b, open(b, stbl!, KEEP.stbl!), track, movie);
}

/** Where a track's samples are (chunk offsets, samples per chunk, sample sizes) and how long they last. */
function readSampleTable(b: Buffer, table: Map<string, Box[]>, track: Track, movie: Movie): void {
  const stts = one(table, 'stts');
  if (stts) {
    const count = b.readUInt32BE(stts.body + 4);
    need(stts.body + 8 + count * 8 <= stts.end);
    let ticks = 0;
    for (let i = 0, at = stts.body + 8; i < count; i++, at += 8) ticks += b.readUInt32BE(at) * b.readUInt32BE(at + 4);
    track.ticks = Math.max(track.ticks, ticks);
  }

  const sizes = sampleSizes(b, one(table, 'stsz'), one(table, 'stz2'));
  const stco = one(table, 'stco');
  const co64 = one(table, 'co64');
  const stsc = one(table, 'stsc');
  need(!(stco && co64));
  const chunks = stco ?? co64;
  if (!chunks || !stsc || !sizes) {
    // a fragmented file keeps its samples in fragments, and its sample table empty
    need(!chunks && (!sizes || sizes.count === 0));
    return;
  }
  const chunkCount = b.readUInt32BE(chunks.body + 4);
  const wide = chunks === co64;
  need(chunks.body + 8 + chunkCount * (wide ? 8 : 4) <= chunks.end);
  const runs = b.readUInt32BE(stsc.body + 4);
  need(stsc.body + 8 + runs * 12 <= stsc.end);
  need(chunkCount === 0 || (runs > 0 && b.readUInt32BE(stsc.body + 8) === 1));

  let sample = 0;
  let run = 0;
  for (let chunk = 1; chunk <= chunkCount; chunk++) {
    // stsc lists runs of chunks by their first chunk's number, each with its samples per chunk
    while (run + 1 < runs && b.readUInt32BE(stsc.body + 8 + (run + 1) * 12) <= chunk) run++;
    const perChunk = b.readUInt32BE(stsc.body + 8 + run * 12 + 4);
    const at = chunks.body + 8 + (chunk - 1) * (wide ? 8 : 4);
    const offset = wide ? Number(b.readBigUInt64BE(at)) : b.readUInt32BE(at);
    need(sample + perChunk <= sizes.count);
    movie.samples.push([offset, offset + sizes.span(sample, perChunk)]);
    sample += perChunk;
  }
  need(sample === sizes.count);
}

/** A track's sample sizes: how many, and how many bytes a run of them takes. */
function sampleSizes(b: Buffer, stsz: Box | undefined, stz2: Box | undefined): { count: number; span: (first: number, n: number) => number } | null {
  need(!(stsz && stz2));
  if (stsz) {
    const uniform = b.readUInt32BE(stsz.body + 4);
    const count = b.readUInt32BE(stsz.body + 8);
    if (uniform > 0) return { count, span: (_first, n) => uniform * n };
    need(stsz.body + 12 + count * 4 <= stsz.end);
    return prefixed(count, (i) => b.readUInt32BE(stsz.body + 12 + i * 4));
  }
  if (stz2) {
    const bits = b[stz2.body + 7]!;
    const count = b.readUInt32BE(stz2.body + 8);
    need((bits === 4 || bits === 8 || bits === 16) && stz2.body + 12 + Math.ceil((count * bits) / 8) <= stz2.end);
    const at = stz2.body + 12;
    const size = (i: number): number =>
      bits === 16 ? b.readUInt16BE(at + i * 2) : bits === 8 ? b[at + i]! : (b[at + (i >> 1)]! >> (i % 2 ? 0 : 4)) & 0x0f;
    return prefixed(count, size);
  }
  return null;
}

function prefixed(count: number, size: (i: number) => number): { count: number; span: (first: number, n: number) => number } {
  const sums = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) sums[i + 1] = sums[i]! + size(i);
  return { count, span: (first, n) => sums[first + n]! - sums[first]! };
}

const TFHD_BASE_OFFSET = 0x01;
const TFHD_DESCRIPTION = 0x02;
const TFHD_DURATION = 0x08;
const TFHD_SIZE = 0x10;
const TFHD_BASE_IS_MOOF = 0x020000;
const TRUN_DATA_OFFSET = 0x01;
const TRUN_FIRST_FLAGS = 0x04;
const TRUN_DURATION = 0x100;
const TRUN_SIZE = 0x200;
const TRUN_FLAGS = 0x400;
const TRUN_COMPOSITION = 0x800;

/** A movie fragment's samples: where each run of them is (tfhd, trun) and how long they last. */
function readFragment(b: Buffer, moof: Box, movie: Movie): void {
  let dataEnd = moof.start;
  for (const traf of open(b, moof, KEEP.moof!).get('traf') ?? []) {
    const boxes = open(b, traf, KEEP.traf!);
    const tfhd = one(boxes, 'tfhd');
    need(tfhd !== undefined);
    const flags = flagsOf(b, tfhd!);
    const track = movie.tracks.get(b.readUInt32BE(tfhd!.body + 4));
    need(track !== undefined);
    let at = tfhd!.body + 8;
    let base = flags & TFHD_BASE_IS_MOOF ? moof.start : dataEnd;
    if (flags & TFHD_BASE_OFFSET) {
      base = Number(b.readBigUInt64BE(at));
      at += 8;
    }
    if (flags & TFHD_DESCRIPTION) at += 4;
    let duration = track!.sampleDuration;
    let size = track!.sampleSize;
    if (flags & TFHD_DURATION) {
      duration = b.readUInt32BE(at);
      at += 4;
    }
    if (flags & TFHD_SIZE) size = b.readUInt32BE(at);

    let next = base;
    for (const trun of boxes.get('trun') ?? []) {
      const runFlags = flagsOf(b, trun);
      const count = b.readUInt32BE(trun.body + 4);
      let field = trun.body + 8;
      if (runFlags & TRUN_DATA_OFFSET) {
        next = base + b.readInt32BE(field);
        field += 4;
      }
      if (runFlags & TRUN_FIRST_FLAGS) field += 4;
      const each = [TRUN_DURATION, TRUN_SIZE, TRUN_FLAGS, TRUN_COMPOSITION].filter((f) => runFlags & f).length * 4;
      need(field + count * each <= trun.end);
      let bytes = 0;
      let ticks = 0;
      if (each === 0) {
        bytes = count * size;
        ticks = count * duration;
      } else {
        for (let i = 0; i < count; i++, field += each) {
          let f = field;
          if (runFlags & TRUN_DURATION) {
            ticks += b.readUInt32BE(f);
            f += 4;
          } else ticks += duration;
          bytes += runFlags & TRUN_SIZE ? b.readUInt32BE(f) : size;
        }
      }
      movie.samples.push([next, next + bytes]);
      track!.fragmentTicks += ticks;
      next += bytes;
    }
    dataEnd = next;
  }
}

/**
 * Zeroes every byte of the media data that no sample uses, where a second file could otherwise sit unseen behind the
 * sound. A sample outside the media data is a broken file.
 */
function clearUnusedMedia(b: Buffer, mdats: Box[], samples: Array<[number, number]>): void {
  const used = new Uint8Array(b.length);
  for (const [from, to] of samples) {
    if (to === from) continue;
    need(mdats.some((m) => from >= m.body && to <= m.end));
    used.fill(1, from, to);
  }
  for (const m of mdats) {
    for (let i = m.body; i < m.end; i++) if (!used[i]) b[i] = 0;
  }
}

// ───────────────────────────────────────────────────────────── WebM (EBML)

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const SEEK_HEAD = 0x114d9b74;
const INFO = 0x1549a966;
const TRACKS = 0x1654ae6b;
const CLUSTER = 0x1f43b675;
const CUES = 0x1c53bb6b;
const VOID = 0xec;
const CRC32 = 0xbf;
const DOC_TYPE = 0x4282;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const TRACK_ENTRY = 0xae;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const TIMECODE = 0xe7;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const BLOCK_DURATION = 0x9b;

/** The EBML header's own fields. */
const HEADER_FIELDS = new Set([0x4286, 0x42f7, 0x42f2, 0x42f3, DOC_TYPE, 0x4287, 0x4285, VOID, CRC32]);
/** What a cluster holds: its timecode, blocks, and position hints. */
const CLUSTER_FIELDS = new Set([TIMECODE, SIMPLE_BLOCK, BLOCK_GROUP, 0xa7, 0xab, 0x5854, VOID, CRC32]);
/** A seek head's entries and a cue list's points. */
const SEEK_FIELDS = new Set([0x4dbb, VOID, CRC32]);
const CUE_FIELDS = new Set([0xbb, VOID, CRC32]);
/** A block group's block, its duration and references; anything else (block additions) is blanked. */
const BLOCK_GROUP_FIELDS = new Set([BLOCK, BLOCK_DURATION, 0xfb, 0xfa, 0x75a2]);
/** The codecs WebM carries sound in. */
const AUDIO_CODECS = new Set(['A_OPUS', 'A_VORBIS']);

interface Element {
  id: number;
  start: number;
  body: number;
  /** for an element of unknown size, the end of what holds it until its children are read */
  end: number;
  unknown: boolean;
}

function element(b: Buffer, at: number, limit: number): Element {
  need(at < limit);
  const first = b[at]!;
  const idLength = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  need(idLength > 0 && at + idLength < limit);
  const id = b.readUIntBE(at, idLength);
  const sizeAt = at + idLength;
  const lead = b[sizeAt]!;
  need(lead !== 0);
  const sizeLength = Math.clz32(lead) - 23;
  need(sizeAt + sizeLength <= limit);
  let value = lead & (0xff >> sizeLength);
  let allOnes = value === 0xff >> sizeLength;
  for (let i = 1; i < sizeLength; i++) {
    const byte = b[sizeAt + i]!;
    value = value * 256 + byte;
    allOnes &&= byte === 0xff;
  }
  const body = sizeAt + sizeLength;
  if (allOnes) return { id, start: at, body, end: limit, unknown: true };
  need(body + value <= limit);
  return { id, start: at, body, end: body + value, unknown: false };
}

/** The elements filling a known-size element, which must have no unknown sizes of their own. */
function* children(b: Buffer, parent: Element): Generator<Element> {
  for (let at = parent.body; at < parent.end; ) {
    const el = element(b, at, parent.end);
    need(!el.unknown);
    yield el;
    at = el.end;
  }
}

/** Overwrites an element with a Void element of the same length and nothing in it. */
function voidOut(b: Buffer, el: Element): void {
  need(!el.unknown);
  const total = el.end - el.start;
  const sizeLength = Math.min(8, total - 1);
  let value = total - 1 - sizeLength;
  b.fill(0, el.start, el.end);
  b[el.start] = VOID;
  for (let i = sizeLength; i >= 1; i--) {
    b[el.start + i] = value % 256;
    value = Math.floor(value / 256);
  }
  b[el.start + 1]! |= 0x80 >> (sizeLength - 1);
}

/** Blanks the children of `el` that are not in `ids`, and empties its Void elements. */
function keepOnly(b: Buffer, el: Element, ids: ReadonlySet<number>): void {
  for (const child of children(b, el)) {
    if (child.id === VOID) b.fill(0, child.body, child.end);
    else if (!ids.has(child.id)) voidOut(b, child);
  }
}

function uint(b: Buffer, el: Element): number {
  const length = el.end - el.body;
  need(length <= 8);
  let value = 0;
  for (let i = el.body; i < el.end; i++) value = value * 256 + b[i]!;
  return value;
}

const str = (b: Buffer, el: Element): string => b.toString('latin1', el.body, el.end).replace(/\0+$/, '');

function readWebm(raw: Buffer): Read {
  const b = Buffer.from(raw);
  const header = element(b, 0, b.length);
  need(header.id === EBML && !header.unknown);
  let docType = '';
  for (const el of children(b, header)) if (el.id === DOC_TYPE) docType = str(b, el);
  keepOnly(b, header, HEADER_FIELDS);
  need(docType === 'webm');

  const segment = element(b, header.end, b.length);
  need(segment.id === SEGMENT);
  // nothing may follow the segment
  need(segment.unknown || segment.end === b.length);

  const state = { scale: 1_000_000, duration: 0, last: 0, tracks: 0 };
  for (let at = segment.body; at < segment.end; ) {
    const el = element(b, at, segment.end);
    if (el.id === CLUSTER) {
      at = readCluster(b, el, state);
      continue;
    }
    need(!el.unknown);
    if (el.id === INFO) readInfo(b, el, state);
    else if (el.id === TRACKS) readTracks(b, el, state);
    else if (el.id === VOID) b.fill(0, el.body, el.end);
    else if (el.id === SEEK_HEAD) keepOnly(b, el, SEEK_FIELDS);
    else if (el.id === CUES) keepOnly(b, el, CUE_FIELDS);
    // tags, chapters, attachments and anything else go
    else if (el.id !== CRC32) voidOut(b, el);
    at = el.end;
  }
  need(state.tracks > 0);
  return { bytes: b, durationMs: (Math.max(state.duration, state.last) * state.scale) / 1e6 };
}

function readInfo(b: Buffer, info: Element, state: { scale: number; duration: number }): void {
  for (const el of children(b, info)) {
    if (el.id === TIMECODE_SCALE) state.scale = uint(b, el);
    if (el.id === DURATION) {
      const length = el.end - el.body;
      need(length === 0 || length === 4 || length === 8);
      state.duration = length === 4 ? b.readFloatBE(el.body) : length === 8 ? b.readDoubleBE(el.body) : 0;
      need(Number.isFinite(state.duration) && state.duration >= 0);
    }
  }
  need(state.scale > 0);
}

function readTracks(b: Buffer, tracks: Element, state: { tracks: number }): void {
  for (const entry of children(b, tracks)) {
    if (entry.id !== TRACK_ENTRY) {
      voidOut(b, entry);
      continue;
    }
    let type = 0;
    let codec = '';
    for (const el of children(b, entry)) {
      if (el.id === TRACK_TYPE) type = uint(b, el);
      if (el.id === CODEC_ID) codec = str(b, el);
    }
    // type 2 is audio; video, subtitles and the rest are not a voice recording
    if (type !== 2 || !AUDIO_CODECS.has(codec)) throw new Rejected('not-sound');
    state.tracks++;
  }
}

/**
 * Reads a cluster and returns where it ends. A recorder streaming its file leaves a cluster's size unknown; it then
 * ends where something that cannot be in a cluster begins.
 */
function readCluster(b: Buffer, cluster: Element, state: { last: number }): number {
  let time = 0;
  let at = cluster.body;
  while (at < cluster.end) {
    const el = element(b, at, cluster.end);
    if (cluster.unknown && !CLUSTER_FIELDS.has(el.id)) return at;
    need(!el.unknown);
    if (el.id === TIMECODE) time = uint(b, el);
    else if (el.id === SIMPLE_BLOCK) state.last = Math.max(state.last, time + blockTime(b, el));
    else if (el.id === BLOCK_GROUP) state.last = Math.max(state.last, time + readBlockGroup(b, el));
    else if (el.id === VOID) b.fill(0, el.body, el.end);
    else if (!CLUSTER_FIELDS.has(el.id)) voidOut(b, el);
    at = el.end;
  }
  return at;
}

/** A block's time within its cluster: after the track number, a signed 16-bit offset. */
function blockTime(b: Buffer, block: Element): number {
  const lead = b[block.body]!;
  need(lead !== 0);
  const trackLength = Math.clz32(lead) - 23;
  need(block.body + trackLength + 3 <= block.end);
  return b.readInt16BE(block.body + trackLength);
}

/** A block group's end within its cluster: its block's time plus its duration. */
function readBlockGroup(b: Buffer, group: Element): number {
  let start: number | null = null;
  let duration = 0;
  for (const el of children(b, group)) {
    if (!BLOCK_GROUP_FIELDS.has(el.id)) voidOut(b, el);
    else if (el.id === BLOCK) start = blockTime(b, el);
    else if (el.id === BLOCK_DURATION) duration = uint(b, el);
  }
  need(start !== null);
  return start! + duration;
}

// ───────────────────────────────────────────────────────────── MP3

/** Bitrates in kbit/s by index: MPEG-1 layers I–III, then MPEG-2 and 2.5 layer I, then their layers II and III. */
const BITRATES = {
  v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  v2l23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
/** Sample rates by index for MPEG-1, MPEG-2 and MPEG-2.5. */
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** An MPEG audio frame header at `at`: its length in bytes, samples and sample rate; null if there is none. */
function frameAt(b: Buffer, at: number): { length: number; samples: number; rate: number } | null {
  if (b.length - at < 4 || b[at] !== 0xff || (b[at + 1]! & 0xe0) !== 0xe0) return null;
  const version = (b[at + 1]! >> 3) & 3;
  const layer = (b[at + 1]! >> 1) & 3;
  const index = b[at + 2]! >> 4;
  const rateIndex = (b[at + 2]! >> 2) & 3;
  const padding = (b[at + 2]! >> 1) & 1;
  // version 1 and layer 0 are reserved; bitrate 0 (free format) and 15, and rate 3, are not allowed
  if (version === 1 || layer === 0 || index === 0 || index === 15 || rateIndex === 3) return null;
  const mpeg1 = version === 3;
  const table = layer === 3 ? (mpeg1 ? BITRATES.v1l1 : BITRATES.v2l1) : mpeg1 ? (layer === 2 ? BITRATES.v1l2 : BITRATES.v1l3) : BITRATES.v2l23;
  const bitrate = table[index]! * 1000;
  const rate = RATES[version]![rateIndex]!;
  if (layer === 3) return { length: (Math.floor((12 * bitrate) / rate) + padding) * 4, samples: 384, rate };
  const samples = layer === 2 ? 1152 : mpeg1 ? 1152 : 576;
  return { length: Math.floor(((samples / 8) * bitrate) / rate) + padding, samples, rate };
}

/** The MPEG frames alone: ID3 and APE tags go, which can hold pictures and whole files of any kind. */
function readMp3(raw: Buffer): Read {
  let at = 0;
  while (raw.length - at >= 10 && raw.toString('latin1', at, at + 3) === 'ID3') {
    const sizeBytes = raw.subarray(at + 6, at + 10);
    need(sizeBytes.every((x) => x < 0x80));
    const size = (sizeBytes[0]! << 21) | (sizeBytes[1]! << 14) | (sizeBytes[2]! << 7) | sizeBytes[3]!;
    at += 10 + size + (raw[at + 5]! & 0x10 ? 10 : 0);
    need(at <= raw.length);
  }
  // some writers pad a tag beyond the size it gives
  while (at < raw.length && raw[at] === 0) at++;

  const start = at;
  let samples = 0;
  let rate = 0;
  for (let frame = frameAt(raw, at); frame && at + frame.length <= raw.length; frame = frameAt(raw, at)) {
    // one stream: a change of sample rate part way is not one
    need(rate === 0 || frame.rate === rate);
    rate = frame.rate;
    samples += frame.samples;
    at += frame.length;
  }
  need(samples > 0);
  const end = at;

  // after the frames: an APE tag, an ID3v1 tag and a cut-off last frame may be left out; nothing else may be there
  let tail = raw.length;
  if (tail - end >= 128 && raw.toString('latin1', tail - 128, tail - 125) === 'TAG') tail -= 128;
  if (tail - end >= 32 && raw.toString('latin1', tail - 32, tail - 24) === 'APETAGEX') {
    const hasHeader = (raw.readUInt32LE(tail - 12) & 0x80000000) !== 0;
    tail -= raw.readUInt32LE(tail - 20) + (hasHeader ? 32 : 0);
    need(tail >= end);
  }
  const cut = frameAt(raw, end);
  need(tail === end || (cut !== null && end + cut.length > tail));
  return { bytes: Buffer.from(raw.subarray(start, end)), durationMs: (samples / rate) * 1000 };
}
