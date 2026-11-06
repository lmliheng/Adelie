/**
 * The composer's microphone, reduced to the one thing the server can send upstream: raw
 * little-endian PCM16, mono, 16 kHz.
 *
 * The browser records whatever the platform gives it — usually Opus in a WebM container at the
 * audio device's own rate — so the recording is decoded and converted here, in the page, rather
 * than on the server: the server then needs no audio decoder, and the conversion is testable
 * without a microphone or a browser.
 *
 * Everything below is pure. `use-asr-recorder.ts` is the part that touches MediaRecorder.
 */

/** The rate the server sends upstream and tells the provider to expect. */
export const ASR_SAMPLE_RATE = 16_000;

/** How long one recording may run, matching the server's own cap (60 s of 16 kHz PCM16). */
export const ASR_MAX_SECONDS = 60;

/**
 * Average every channel into one. A microphone's channels are near-identical, so this is a
 * formality — but a decoder may hand back stereo, and the provider is told "mono", so the
 * samples have to actually be one channel rather than a second one ignored.
 */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (first === undefined) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mono = new Float32Array(first.length);
  for (let i = 0; i < mono.length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    mono[i] = sum / channels.length;
  }
  return mono;
}

/**
 * Resample by linear interpolation. Not the highest-quality resampler there is, but a speech
 * recognizer is insensitive to the difference and this one is a handful of lines: each output
 * sample is read at its exact position in the input and blended from the two neighbours.
 */
export function resampleMono(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[i] = (input[left] ?? 0) * (1 - weight) + (input[right] ?? 0) * weight;
  }
  return output;
}

/**
 * Float samples to PCM16. Clamped before scaling: a decoder may hand back values outside
 * [-1, 1], and Int16Array truncation would wrap those around into a loud click.
 */
export function toPcm16Le(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, Math.round(sample * 32767), true);
  }
  return bytes;
}

/**
 * The whole conversion: decoded channels at `fromRate` and `toRate` (the device's rate) become
 * the bytes the transcribe route takes.
 */
export function toAsrPcm(
  channels: readonly Float32Array[],
  fromRate: number,
  toRate: number = ASR_SAMPLE_RATE,
): Uint8Array {
  return toPcm16Le(resampleMono(mixToMono(channels), fromRate, toRate));
}

/**
 * base64, in chunks. `String.fromCharCode(...bytes)` on a whole recording would blow the
 * argument limit, so the bytes go through in 32k slices — which is also why this does not use
 * a one-line `btoa(String.fromCharCode(...))`.
 */
export function encodeBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}
