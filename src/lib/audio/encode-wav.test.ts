/**
 * Tests for browser-side WAV encoding.
 * @module lib/audio/encode-wav.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeWavFromAudioBlob } from "./encode-wav";

interface MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData: (channel: number) => Float32Array;
}

const mockDecodeAudioData = vi.fn<() => Promise<MockAudioBuffer>>();
const mockClose = vi.fn<() => Promise<void>>();
const OriginalBlob = globalThis.Blob;

class MockAudioContext {
  decodeAudioData = mockDecodeAudioData;
  close = mockClose;
}

class MockBlob {
  readonly type: string;
  private readonly bytes: Uint8Array;

  constructor(parts: Array<ArrayBuffer | ArrayBufferView>, options?: { type?: string }) {
    this.type = options?.type ?? "";
    const chunks = parts.map((part) => {
      if (part instanceof ArrayBuffer) {
        return new Uint8Array(part);
      }

      return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
    });
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

    this.bytes = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      this.bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.slice().buffer;
  }
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function createSourceBlob(): Blob {
  return {
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  } as Blob;
}

describe("encodeWavFromAudioBlob", () => {
  beforeEach(() => {
    mockDecodeAudioData.mockReset();
    mockClose.mockReset();
    mockClose.mockResolvedValue(undefined);
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: MockAudioContext,
    });
    Object.defineProperty(globalThis, "Blob", {
      configurable: true,
      writable: true,
      value: MockBlob,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "Blob", {
      configurable: true,
      writable: true,
      value: OriginalBlob,
    });
    vi.restoreAllMocks();
  });

  it("writes a canonical 16 kHz mono PCM WAV header and resampled samples", async () => {
    mockDecodeAudioData.mockResolvedValue({
      numberOfChannels: 1,
      length: 6,
      sampleRate: 24_000,
      getChannelData: () => new Float32Array([0, 0.5, 1, -1, -0.5, 0]),
    });

    const wavBlob = await encodeWavFromAudioBlob(createSourceBlob());
    const arrayBuffer = await wavBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    expect(wavBlob.type).toBe("audio/wav");
    expect(readAscii(bytes, 0, 4)).toBe("RIFF");
    expect(readAscii(bytes, 8, 12)).toBe("WAVE");
    expect(readAscii(bytes, 12, 16)).toBe("fmt ");
    expect(readAscii(bytes, 36, 40)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(24_575);
    expect(view.getInt16(48, true)).toBe(-32_768);
    expect(view.getInt16(50, true)).toBe(-8_192);
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("mixes stereo to mono and clamps out-of-range floats before PCM conversion", async () => {
    const channelA = new Float32Array([2, -2]);
    const channelB = new Float32Array([0, 0]);

    mockDecodeAudioData.mockResolvedValue({
      numberOfChannels: 2,
      length: 2,
      sampleRate: 16_000,
      getChannelData: (channel) => channel === 0 ? channelA : channelB,
    });

    const wavBlob = await encodeWavFromAudioBlob(createSourceBlob());
    const arrayBuffer = await wavBlob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(-32_768);
  });
});
