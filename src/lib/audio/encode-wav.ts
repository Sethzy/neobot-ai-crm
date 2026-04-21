/**
 * Client-side audio transcoder: decodes any browser-recorded audio blob
 * (webm/opus, mp4, ogg, etc.) and re-encodes it as a 16-bit PCM WAV at
 * 16 kHz mono. WAV remains the most interoperable speech-to-text
 * interchange format, so this step removes provider-specific codec
 * handling from the rest of the pipeline.
 *
 * @module lib/audio/encode-wav
 */

const TARGET_SAMPLE_RATE = 16_000;
const WAV_HEADER_SIZE_BYTES = 44;
const PCM_BYTES_PER_SAMPLE = 2;
const MONO_CHANNEL_COUNT = 1;

/** Averages all channels of an AudioBuffer into a single Float32 mono track. */
function mixdownToMono(audioBuffer: AudioBuffer): Float32Array {
  const channelCount = audioBuffer.numberOfChannels;
  const frameCount = audioBuffer.length;
  const mono = new Float32Array(frameCount);

  for (let channel = 0; channel < channelCount; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      mono[i] += channelData[i];
    }
  }

  if (channelCount > 1) {
    for (let i = 0; i < frameCount; i++) {
      mono[i] /= channelCount;
    }
  }

  return mono;
}

/**
 * Linear-interpolation resampler. Quality is lower than a windowed-sinc
 * filter but fully adequate for speech recognition, which only cares
 * about frequencies well below 8 kHz (the Nyquist of our 16 kHz target).
 */
function resampleLinear(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) {
    return samples;
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.floor(samples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const lowerIndex = Math.floor(sourceIndex);
    const upperIndex = Math.min(lowerIndex + 1, samples.length - 1);
    const fraction = sourceIndex - lowerIndex;
    output[i] = samples[lowerIndex] * (1 - fraction) + samples[upperIndex] * fraction;
  }

  return output;
}

/** Writes an ASCII string into a DataView, byte-by-byte. */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Wraps 16-bit PCM sample data in a canonical RIFF/WAVE header.
 * Matches the layout most STT providers sniff for: RIFF, fmt (PCM 1),
 * sample rate, byte rate, data chunk.
 */
function buildWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const dataByteLength = samples.length * PCM_BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE_BYTES + dataByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, MONO_CHANNEL_COUNT, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * MONO_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(32, MONO_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = WAV_HEADER_SIZE_BYTES;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Estimates the final 16 kHz mono PCM WAV size for a given recording length. */
export function estimatePcmWavSizeBytes(durationSeconds: number): number {
  const safeDurationSeconds = Math.max(0, durationSeconds);
  return WAV_HEADER_SIZE_BYTES
    + Math.ceil(
      safeDurationSeconds * TARGET_SAMPLE_RATE * MONO_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE,
    );
}

/**
 * Decodes an arbitrary browser-produced audio blob and returns a new
 * 16 kHz mono 16-bit PCM WAV blob. The source AudioContext is closed
 * before returning so it doesn't leak resources between recordings.
 */
export async function encodeWavFromAudioBlob(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext
    ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx) {
    throw new Error("AudioContext is not available in this environment");
  }

  const audioContext = new AudioCtx();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const mono = mixdownToMono(audioBuffer);
    const resampled = resampleLinear(mono, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
    return buildWavBlob(resampled, TARGET_SAMPLE_RATE);
  } finally {
    await audioContext.close();
  }
}
