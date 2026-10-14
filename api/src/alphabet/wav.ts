/**
 * Just enough of a WAV reader to check what the admin panel sends: that it is
 * plain PCM, and how long it lasts. The panel trims and levels every recording
 * before it uploads, so a file that is minutes long, or not PCM, did not come
 * from it.
 */
export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  durationMs: number;
}

const text = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

export function readWav(bytes: Uint8Array): WavInfo | null {
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
      const available = Math.min(size, bytes.length - body);
      const frames = available / (fmt.channels * (fmt.bitsPerSample / 8));
      return { ...fmt, durationMs: Math.round((frames / fmt.sampleRate) * 1000) };
    }
    at = body + size + (size % 2);
  }
  return null;
}
