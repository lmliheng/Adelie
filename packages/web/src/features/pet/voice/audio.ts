/**
 * The call's audio pipeline: the microphone in, the model's voice out.
 *
 * Two formats meet here and neither is the browser's own. Upward the provider wants 16 kHz mono
 * PCM16, base64 in a JSON frame; the microphone hands over whatever its context runs at (usually
 * 48 kHz float), so every frame is resampled and quantized on the way out. Downward the provider
 * answers in 24 kHz PCM16, which becomes an `AudioBuffer` each and is scheduled back to back on a
 * playhead so consecutive chunks are heard as one sentence rather than as clicks.
 *
 * Recording uses an `AudioWorklet` when the browser has one, and the deprecated script processor
 * when it does not — the same two paths the original call application used, kept because a
 * workstation's browser and a packaged desktop shell do not always offer the same set.
 */

/** The rate the provider accepts audio at, and the rate this file converts to. */
export const INPUT_RATE = 16_000;
/** The rate the provider answers in, and the rate this file interprets its chunks at. */
export const OUTPUT_RATE = 24_000;

/** One frame up: exactly 100 ms at {@link INPUT_RATE}, which is the chunk the protocol expects. */
const CHUNK_SAMPLES = 1_600;

/** Base64 of little-endian PCM16, the shape the protocol carries audio in. */
export function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Little-endian PCM16 out of a base64 chunk. */
export function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, binary.length >> 1);
}

/**
 * Linear-interpolation resampler that carries its tail between calls. Carrying it is the whole
 * point: each input buffer is resampled as if it continued the previous one, so no sample is lost
 * at a boundary and a sentence does not gain a click every 128 frames.
 */
class Resampler {
  private readonly ratio: number;
  private tail = new Float32Array(0);
  private position = 0;

  constructor(inputRate: number, outputRate: number) {
    this.ratio = inputRate / outputRate;
  }

  process(chunk: Float32Array): Float32Array {
    const data = new Float32Array(this.tail.length + chunk.length);
    data.set(this.tail, 0);
    data.set(chunk, this.tail.length);
    const out: number[] = [];
    let position = this.position;
    while (Math.floor(position) + 1 < data.length) {
      const index = Math.floor(position);
      const frac = position - index;
      out.push(data[index]! * (1 - frac) + data[index + 1]! * frac);
      position += this.ratio;
    }
    const consumed = Math.min(Math.floor(position), data.length);
    this.tail = data.slice(consumed);
    this.position = position - consumed;
    return Float32Array.from(out);
  }
}

/**
 * Collects the microphone's own rate into 100 ms chunks at the protocol's rate, and reports the
 * input level while it does. One instance per call.
 */
export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private resampler: Resampler | null = null;
  private pending: Float32Array[] = [];
  private pendingLength = 0;
  private muted = false;

  async start(options: {
    onAudio: (base64: string) => void;
    onLevel: (level: number) => void;
  }): Promise<void> {
    this.onAudio = options.onAudio;
    this.onLevel = options.onLevel;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(this.stream);
    // The microphone must not be played back through the speakers — that is a feedback loop. A
    // silent gain node is what keeps the graph connected and the worklet processing.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);
    this.source = source;
    this.sink = sink;
    this.resampler = new Resampler(ctx.sampleRate, INPUT_RATE);

    if (ctx.audioWorklet) {
      // The processor is a blob rather than a served file: it is a dozen lines, and a deployment
      // that has to ship an extra asset for it would be worse than one that builds it here.
      const url = URL.createObjectURL(
        new Blob(
          [
            `class MicCollector extends AudioWorkletProcessor {
               process(inputs) {
                 const channel = inputs[0] && inputs[0][0];
                 if (channel && channel.length) this.port.postMessage(channel.slice(0));
                 return true;
               }
             }
             registerProcessor('mic-collector', MicCollector);`,
          ],
          { type: "text/javascript" },
        ),
      );
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(ctx, "mic-collector");
      node.port.onmessage = (event: MessageEvent) => this.handleFrame(event.data as Float32Array);
      source.connect(node);
      node.connect(sink);
      this.node = node;
      return;
    }

    const node = ctx.createScriptProcessor(2048, 1, 1);
    node.onaudioprocess = (event: AudioProcessingEvent) =>
      this.handleFrame(event.inputBuffer.getChannelData(0).slice(0));
    source.connect(node);
    node.connect(sink);
    this.node = node;
  }

  private onAudio: (base64: string) => void = () => {};
  private onLevel: (level: number) => void = () => {};

  private handleFrame(frame: Float32Array): void {
    if (this.muted || frame.length === 0) return;
    // A coarse RMS over every fourth sample: enough to drive a level meter, cheap enough to run on
    // every frame of a live call.
    let sum = 0;
    for (let i = 0; i < frame.length; i += 4) sum += frame[i]! * frame[i]!;
    this.onLevel(Math.min(1, Math.sqrt(sum / (frame.length / 4)) * 7));

    const resampled = this.resampler?.process(frame);
    if (resampled === undefined || resampled.length === 0) return;
    this.pending.push(resampled);
    this.pendingLength += resampled.length;
    if (this.pendingLength < CHUNK_SAMPLES) return;

    const merged = new Float32Array(this.pendingLength);
    let offset = 0;
    for (const part of this.pending) {
      merged.set(part, offset);
      offset += part.length;
    }
    this.pending = [];
    this.pendingLength = 0;

    let cursor = 0;
    while (merged.length - cursor >= CHUNK_SAMPLES) {
      const slice = merged.subarray(cursor, cursor + CHUNK_SAMPLES);
      cursor += CHUNK_SAMPLES;
      this.onAudio(int16ToBase64(floatToPcm16(slice)));
    }
    if (cursor < merged.length) {
      const rest = merged.slice(cursor);
      this.pending = [rest];
      this.pendingLength = rest.length;
    }
  }

  /** Muting keeps the tracks open — the call is not over, it is only not being listened to. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    try {
      this.node?.disconnect();
      this.source?.disconnect();
      this.sink?.disconnect();
    } catch {
      // a node that was never connected, or was disconnected twice
    }
    void this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.source = null;
    this.sink = null;
    this.resampler = null;
    this.pending = [];
    this.pendingLength = 0;
  }
}

/** Float samples clamped and quantized to signed 16-bit. */
function floatToPcm16(slice: Float32Array): Int16Array {
  const int16 = new Int16Array(slice.length);
  for (let i = 0; i < slice.length; i += 1) {
    const value = Math.max(-1, Math.min(1, slice[i]!));
    int16[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return int16;
}

/**
 * The model's voice. Chunks are scheduled on a playhead a hair ahead of the clock, so they queue
 * into continuous speech; {@link flush} is the interruption, and it is what makes talking over the
 * pet feel like talking over a person rather than waiting for a buffer to drain.
 */
export class Player {
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly gain: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly samples: Uint8Array<ArrayBuffer>;
  private playhead = 0;

  constructor(private readonly ctx: AudioContext) {
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.gain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.samples = new Uint8Array(this.analyser.fftSize);
  }

  enqueue(base64: string): void {
    const int16 = base64ToInt16(base64);
    if (int16.length === 0) return;
    const buffer = this.ctx.createBuffer(1, int16.length, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i += 1) channel[i] = int16[i]! / 32768;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    // The small lead-in is what lets two chunks that arrive within one animation frame still be
    // heard in order; `max` with the playhead is what makes them continuous.
    const startAt = Math.max(this.ctx.currentTime + 0.06, this.playhead);
    source.start(startAt);
    this.playhead = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** Playback level, for the speaking meter. */
  level(): number {
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (let i = 0; i < this.samples.length; i += 1) {
      const value = (this.samples[i]! - 128) / 128;
      sum += value * value;
    }
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  /** Stop everything queued, now: the user started talking. */
  flush(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already finished
      }
    }
    this.sources.clear();
    this.playhead = 0;
  }
}
