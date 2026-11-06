/**
 * The composer's microphone: record, hand the utterance to the server, get a transcript back.
 *
 * MediaRecorder does the recording (it needs no worklet and no deprecated node), and the page
 * decodes what it produced with `decodeAudioData` and converts it to the PCM the server takes
 * (lib/asr-audio.ts, which is where the conversion and its tests live). The server does the
 * recognizing, so nothing here talks to a provider and no key ever reaches the page.
 *
 * Two things the browser will not do for us:
 *
 *   - `getUserMedia` is refused outright on an insecure origin, and a refused one is
 *     indistinguishable from a permission the user denied. Both read as "no microphone", which
 *     is what the notice says.
 *   - A recording of silence transcribes to the empty string. That is a legitimate answer from
 *     the provider, not a failure, so it is reported as "nothing was heard" rather than as an
 *     error — and the draft is left exactly as it was.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api/endpoints";
import { ASR_SAMPLE_RATE, encodeBase64, toAsrPcm } from "../../lib/asr-audio";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** Which half of the round trip is running, if either. */
export type DictationState = "idle" | "recording" | "transcribing";

/**
 * What the composer has to say about the last attempt. `failed` is the difference between a
 * refusal (something went wrong) and a recording that simply came back empty — both need saying,
 * and only the first is a failure.
 */
export interface DictationNotice {
  text: string;
  failed: boolean;
}

export interface Dictation {
  state: DictationState;
  /** The last outcome worth saying (a refusal, or a recording that came back empty); null otherwise. */
  notice: DictationNotice | null;
  /** Drops `notice` — the composer calls this when the draft changes under it. */
  clearNotice(): void;
  /** Starts a recording, or ends the running one and transcribes it. Never rejects. */
  toggle(): void;
}

/**
 * `onTranscript` receives a non-empty transcript to put in the draft. It is held in a ref so
 * that a re-render mid-recording cannot detach the recording from the draft it belongs to.
 */
export function useDictation(onTranscript: (text: string) => void): Dictation {
  const [state, setState] = useState<DictationState>("idle");
  const [notice, setNotice] = useState<DictationNotice | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef(onTranscript);
  useEffect(() => {
    transcriptRef.current = onTranscript;
  }, [onTranscript]);

  const finish = useCallback(async (blob: Blob) => {
    setState("transcribing");
    try {
      const decoded = await decode(blob);
      const pcm = toAsrPcm(decoded.channels, decoded.sampleRate, ASR_SAMPLE_RATE);
      const res = await api.asrTranscribe({
        dataBase64: encodeBase64(pcm),
        sampleRate: ASR_SAMPLE_RATE,
      });
      if (res.text.trim() === "") setNotice({ text: S.chat.dictateHeardNothing, failed: false });
      else transcriptRef.current(res.text);
    } catch (e) {
      setNotice({ text: refusalText(e), failed: true });
    } finally {
      setState("idle");
    }
  }, []);

  const start = useCallback(() => {
    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setNotice({ text: S.chat.dictateUnavailable, failed: true });
        return;
      }
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        // The device stays open until every track is stopped; a mic left live shows as a
        // recording indicator the user cannot get rid of.
        for (const track of stream.getTracks()) track.stop();
        recorderRef.current = null;
        void finish(new Blob(chunksRef.current, { type: recorder.mimeType }));
        chunksRef.current = [];
      };
      recorderRef.current = recorder;
      setNotice(null);
      recorder.start();
      setState("recording");
    })();
  }, [finish]);

  const toggle = useCallback(() => {
    const recorder = recorderRef.current;
    // A second click ends the recording; `onstop` is what starts the transcription, so the
    // state only reaches "transcribing" once the device has actually let go.
    if (recorder !== null && recorder.state === "recording") recorder.stop();
    else start();
  }, [start]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { state, notice, clearNotice, toggle };
}

/** The decoded recording, as the channels themselves — what the PCM conversion consumes. */
async function decode(blob: Blob): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const bytes = await blob.arrayBuffer();
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(bytes);
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      channels.push(buffer.getChannelData(channel));
    }
    return { channels, sampleRate: buffer.sampleRate };
  } finally {
    void context.close();
  }
}
