/**
 * The composer's recording, converted to what the transcribe route takes.
 *
 * These are the steps between the decoder's float channels and the PCM16 bytes the server
 * forwards: down-mixing, resampling and quantising. They are pure, which is the point — a
 * microphone is not needed to know that a 48 kHz recording arrives as half as many samples, or
 * that a stereo pair becomes one channel, or that a sample outside [-1, 1] is clamped rather
 * than wrapped around into a click.
 */
import { describe, expect, it } from "vitest";
import {
  ASR_SAMPLE_RATE,
  encodeBase64,
  mixToMono,
  resampleMono,
  toAsrPcm,
  toPcm16Le,
} from "../src/lib/asr-audio";

/** Read one little-endian 16-bit sample back out of the bytes. */
const sampleAt = (bytes: Uint8Array, index: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset).getInt16(index * 2, true);

describe("the recording's conversion to PCM16", () => {
  it("averages every channel into one", () => {
    const mono = mixToMono([Float32Array.of(1, 0, -1), Float32Array.of(0, 0, 1)]);
    expect(Array.from(mono)).toEqual([0.5, 0, 0]);
  });

  it("leaves a single channel exactly as it is", () => {
    const only = Float32Array.of(0.25, -0.5);
    expect(mixToMono([only])).toBe(only);
    expect(mixToMono([]).length).toBe(0);
  });

  it("resamples to the count the rate ratio asks for, holding a constant signal", () => {
    const input = new Float32Array(300).fill(0.5);
    const output = resampleMono(input, 48_000, ASR_SAMPLE_RATE);
    expect(output.length).toBe(100);
    expect(output.every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
  });

  it("returns the input unchanged at the same rate, or when there is nothing to convert", () => {
    const input = Float32Array.of(0.1, 0.2);
    expect(resampleMono(input, ASR_SAMPLE_RATE, ASR_SAMPLE_RATE)).toBe(input);
    expect(resampleMono(new Float32Array(0), 48_000, ASR_SAMPLE_RATE).length).toBe(0);
  });

  it("writes little-endian 16-bit samples, clamped to the range Int16 has", () => {
    const bytes = toPcm16Le(Float32Array.of(0, 1, -1, 2, -2));
    expect(sampleAt(bytes, 0)).toBe(0);
    expect(sampleAt(bytes, 1)).toBe(32767);
    expect(sampleAt(bytes, 2)).toBe(-32767);
    // Beyond the range: clamped, not wrapped — a wrap is the loud click this guards against.
    expect(sampleAt(bytes, 3)).toBe(32767);
    expect(sampleAt(bytes, 4)).toBe(-32767);
    expect(bytes.length).toBe(10);
  });

  it("converts a decoded recording end to end", () => {
    // Two channels of a 48 kHz recording, one second long: 48 000 frames become 16 000 samples
    // of one channel, which is 32 000 bytes.
    const pcm = toAsrPcm([new Float32Array(48_000).fill(0.5), new Float32Array(48_000)], 48_000);
    expect(pcm.length).toBe(ASR_SAMPLE_RATE * 2);
    expect(sampleAt(pcm, 0)).toBe(Math.round(0.25 * 32767));
  });

  it("base64-encodes a whole recording, not just the first chunk", () => {
    // Longer than the encoder's internal slice (0x8000), so a one-shot implementation would
    // either throw on the argument limit or quietly encode only the beginning.
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    expect(encodeBase64(new Uint8Array(0))).toBe("");
  });
});
