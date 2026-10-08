export const WAV_MIME_TYPE = "audio/wav";
export const WAV_HEADER_BYTES = 44;

export type WavErrorCode =
  | "not_riff"
  | "not_wave"
  | "missing_format"
  | "missing_data"
  | "unsupported_format"
  | "invalid_format";

export class WavError extends Error {
  constructor(readonly code: WavErrorCode) {
    super(`wav: ${code}`);
    this.name = "WavError";
  }
}

export interface DecodedWav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  encoding: "pcm" | "float";
  samples: Float32Array;
  durationSeconds: number;
}

interface FormatChunk {
  encoding: "pcm" | "float";
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;
const SUPPORTED_PCM_BITS = [8, 16, 24, 32];
const SUPPORTED_FLOAT_BITS = [32, 64];

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}

export function encodeWav(samples: ArrayLike<number>, sampleRate: number): ArrayBuffer {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new WavError("invalid_format");
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, FORMAT_PCM, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index += 1) {
    const raw = samples[index] as number;
    const value = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
    view.setInt16(
      WAV_HEADER_BYTES + index * 2,
      value < 0 ? Math.round(value * 0x8000) : Math.round(value * 0x7fff),
      true,
    );
  }
  return buffer;
}

function parseFormat(view: DataView, offset: number, size: number): FormatChunk {
  if (size < 16) throw new WavError("invalid_format");
  let code = view.getUint16(offset, true);
  const channels = view.getUint16(offset + 2, true);
  const sampleRate = view.getUint32(offset + 4, true);
  const blockAlign = view.getUint16(offset + 12, true);
  const bitsPerSample = view.getUint16(offset + 14, true);
  if (code === FORMAT_EXTENSIBLE) {
    if (size < 26) throw new WavError("invalid_format");
    code = view.getUint16(offset + 24, true);
  }
  if (channels < 1 || sampleRate < 1 || blockAlign < 1) throw new WavError("invalid_format");
  if (code === FORMAT_PCM && SUPPORTED_PCM_BITS.includes(bitsPerSample)) {
    return { encoding: "pcm", channels, sampleRate, bitsPerSample, blockAlign };
  }
  if (code === FORMAT_FLOAT && SUPPORTED_FLOAT_BITS.includes(bitsPerSample)) {
    return { encoding: "float", channels, sampleRate, bitsPerSample, blockAlign };
  }
  throw new WavError("unsupported_format");
}

function sampleReader(format: FormatChunk): (view: DataView, offset: number) => number {
  if (format.encoding === "float") {
    return format.bitsPerSample === 32
      ? (view, offset) => view.getFloat32(offset, true)
      : (view, offset) => view.getFloat64(offset, true);
  }
  switch (format.bitsPerSample) {
    case 8:
      return (view, offset) => (view.getUint8(offset) - 128) / 128;
    case 16:
      return (view, offset) => view.getInt16(offset, true) / 0x8000;
    case 24:
      return (view, offset) => {
        const value =
          view.getUint8(offset) |
          (view.getUint8(offset + 1) << 8) |
          (view.getInt8(offset + 2) << 16);
        return value / 0x800000;
      };
    default:
      return (view, offset) => view.getInt32(offset, true) / 0x80000000;
  }
}

function toView(input: ArrayBuffer | ArrayBufferView): DataView {
  return input instanceof ArrayBuffer
    ? new DataView(input)
    : new DataView(input.buffer, input.byteOffset, input.byteLength);
}

export function decodeWav(input: ArrayBuffer | ArrayBufferView): DecodedWav {
  const view = toView(input);
  if (view.byteLength < 12 || readAscii(view, 0, 4) !== "RIFF") throw new WavError("not_riff");
  if (readAscii(view, 8, 4) !== "WAVE") throw new WavError("not_wave");
  let format: FormatChunk | null = null;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = parseFormat(view, body, Math.min(size, view.byteLength - body));
    } else if (id === "data") {
      dataOffset = body;
      dataSize = Math.min(size, view.byteLength - body);
      if (format) break;
    }
    offset = body + size + (size % 2);
  }
  if (!format) throw new WavError("missing_format");
  if (dataOffset < 0) throw new WavError("missing_data");
  const bytesPerSample = format.bitsPerSample / 8;
  if (format.blockAlign < bytesPerSample * format.channels) throw new WavError("invalid_format");
  const frames = Math.floor(dataSize / format.blockAlign);
  const read = sampleReader(format);
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const frameOffset = dataOffset + frame * format.blockAlign;
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      sum += read(view, frameOffset + channel * bytesPerSample);
    }
    samples[frame] = sum / format.channels;
  }
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    encoding: format.encoding,
    samples,
    durationSeconds: frames / format.sampleRate,
  };
}
