/**
 * Just enough of a WAV reader to check an admin upload: that it is plain PCM, and how long it lasts. The panel
 * trims every recording first, so anything long or not PCM did not come from it.
 */
export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  durationMs: number;
}

const text = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/** The format and where the samples are: the samples run to the data chunk's end or the file's, whichever is first. */
function parseWav(bytes: Uint8Array): (Omit<WavInfo, 'durationMs'> & { dataStart: number; dataLength: number }) | null {
  if (bytes.length < 44 || text(bytes, 0) !== 'RIFF' || text(bytes, 8) !== 'WAVE') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt: Omit<WavInfo, 'durationMs'> | null = null;
  // walk the chunks: "fmt " says what the samples are, "data" how many there are
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = text(bytes, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ' && size >= 16 && body + 16 <= bytes.length) {
      const format = view.getUint16(body, true);
      if (format !== 1) return null; // PCM only
      fmt = { channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bitsPerSample: view.getUint16(body + 14, true) };
    } else if (id === 'data') {
      if (!fmt || fmt.channels < 1 || fmt.sampleRate < 8000 || fmt.bitsPerSample % 8 !== 0 || fmt.bitsPerSample === 0) return null;
      return { ...fmt, dataStart: body, dataLength: Math.min(size, bytes.length - body) };
    }
    at = body + size + (size % 2);
  }
  return null;
}

export function readWav(bytes: Uint8Array): WavInfo | null {
  const wav = parseWav(bytes);
  if (!wav) return null;
  const { channels, sampleRate, bitsPerSample } = wav;
  const frames = wav.dataLength / (channels * (bitsPerSample / 8));
  return { channels, sampleRate, bitsPerSample, durationMs: Math.round((frames / sampleRate) * 1000) };
}

/**
 * The same recording written as nothing but its format and whole sample frames, so no other chunk, and nothing after
 * the samples, is kept. Null for what `readWav` refuses.
 */
export function plainWav(bytes: Uint8Array): { bytes: Buffer; durationMs: number } | null {
  const wav = parseWav(bytes);
  if (!wav) return null;
  const frame = wav.channels * (wav.bitsPerSample / 8);
  const length = wav.dataLength - (wav.dataLength % frame);
  const out = Buffer.alloc(44 + length);
  out.write('RIFF', 0, 'latin1');
  out.writeUInt32LE(36 + length, 4);
  out.write('WAVEfmt ', 8, 'latin1');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(wav.channels, 22);
  out.writeUInt32LE(wav.sampleRate, 24);
  out.writeUInt32LE(wav.sampleRate * frame, 28);
  out.writeUInt16LE(frame, 32);
  out.writeUInt16LE(wav.bitsPerSample, 34);
  out.write('data', 36, 'latin1');
  out.writeUInt32LE(length, 40);
  out.set(bytes.subarray(wav.dataStart, wav.dataStart + length), 44);
  return { bytes: out, durationMs: ((length / frame) / wav.sampleRate) * 1000 };
}
