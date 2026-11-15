/**
 * A message that did not get out of an existing conversation (src/features/chat/message-send-refusal.ts):
 * which words the composer draws above its card, and when it still draws them.
 *
 * The card keeps the text, the staged files and the send button, so the sentence is what says why
 * the press changed nothing — after six seconds a notification would have said nothing at all. Two
 * things it must get right: a server answer speaks the interface's language (with the model's name
 * where the copy needs it), and a send that never reached the route keeps what it knows instead of
 * flattening to the generic text (7.19's rule). And it belongs to one Session only: the composer
 * stays mounted while another conversation is opened. The same slot carries the two staged switches:
 * a refused `/agent` handoff, whose words name the Agent and say this conversation was not touched,
 * and a refused `/model` — a fork, which wrote nothing and says the same, or a desk, where the
 * employee's model may already be written, so its sentence points at the chart instead — and the one
 * press that posts nothing at all: a `/compact` the server would not start.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { sendRefused } from "../src/features/chat/first-send-refusal";
import {
  compactionRefusalLine,
  deskModelRefusalLine,
  handoffRefusalLine,
  modelSwitchRefusalLine,
  sendRefusalLine,
  sendRefusalShown,
} from "../src/features/chat/message-send-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("sendRefusalLine", () => {
  it("belongs to the Session that asked", () => {
    const line = sendRefusalLine("session-a", new ApiError(500, "internal", "boom"));
    expect(line.sessionId).toBe("session-a");
    expect(line.text).toBe(S.chat.sendRefused(S.errors.byCode.internal));
  });

  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = sendRefusalLine("s", new ApiError(400, "no_default_model", "RAW ENGLISH"));
    expect(line.text).toBe(S.chat.sendRefused(S.errors.noDefaultModel));
    expect(line.text).not.toContain("RAW ENGLISH");
  });

  it("names the model the message was aimed at when the key is missing", () => {
    // The body of `model_credential_missing` carries no model id; the Session's own model supplies it.
    const line = sendRefusalLine(
      "s",
      new ApiError(400, "model_credential_missing", "RAW ENGLISH"),
      "deepseek-flash",
    );
    expect(line.text).toBe(S.chat.sendRefused(S.errors.modelCredentialMissing("deepseek-flash")));
    expect(line.text).toContain("deepseek-flash");
  });

  it("keeps what a send that never reached the route has to say", () => {
    expect(sendRefusalLine("s", new Error("Failed to fetch")).text).toBe(
      S.chat.sendRefused("Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(sendRefusalLine("s", undefined).text).toBe(S.chat.sendRefused(S.common.unknownError));
    expect(sendRefusalLine("s", new Error("  ")).text).toBe(
      S.chat.sendRefused(S.common.unknownError),
    );
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(sendRefusalLine("s", new ApiError(400, "no_default_model", "x")).text).toBe(
      EN.chat.sendRefused(EN.errors.noDefaultModel),
    );
  });

  it("draws the same sentence the draft screen does — one sentence, two screens", () => {
    const err = new ApiError(500, "internal", "boom");
    expect(sendRefusalLine("s", err).text).toBe(sendRefused(S.errors.byCode.internal));
  });
});

describe("handoffRefusalLine", () => {
  it("names the Agent the draft was handed to, and that this conversation is untouched", () => {
    const line = handoffRefusalLine(
      "session-a",
      new ApiError(500, "internal", "boom"),
      "helper_agent",
    );
    expect(line.sessionId).toBe("session-a");
    expect(line.text).toBe(S.chat.handoffRefused("helper_agent", S.errors.byCode.internal));
    expect(line.text).toContain("helper_agent");
  });

  it("is the plain send's sentence with one clause replaced, not a second copy of the reason", () => {
    const err = new ApiError(400, "no_default_model", "RAW ENGLISH");
    const plain = sendRefusalLine("s", err).text;
    const handoff = handoffRefusalLine("s", err, "helper_agent").text;
    expect(plain).toBe(S.chat.sendRefused(S.errors.noDefaultModel));
    expect(handoff).not.toContain("RAW ENGLISH");
    expect(handoff.endsWith(S.errors.noDefaultModel)).toBe(true);
  });

  it("names the model the new conversation would have been created on", () => {
    // The handoff carries no model of its own: the new conversation is created on the Project's
    // default, whose id `model_credential_missing` does not carry.
    const line = handoffRefusalLine(
      "s",
      new ApiError(400, "model_credential_missing", "RAW ENGLISH"),
      "helper_agent",
      "deepseek-flash",
    );
    expect(line.text).toBe(
      S.chat.handoffRefused("helper_agent", S.errors.modelCredentialMissing("deepseek-flash")),
    );
    expect(line.text).toContain("deepseek-flash");
  });

  it("keeps what a request that never reached the route has to say", () => {
    expect(handoffRefusalLine("s", new Error("Failed to fetch"), "helper_agent").text).toBe(
      S.chat.handoffRefused("helper_agent", "Failed to fetch"),
    );
    expect(handoffRefusalLine("s", undefined, "helper_agent").text).toBe(
      S.chat.handoffRefused("helper_agent", S.common.unknownError),
    );
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    const line = handoffRefusalLine("s", new ApiError(500, "internal", "x"), "helper_agent");
    expect(line.text).toBe(EN.chat.handoffRefused("helper_agent", EN.errors.byCode.internal));
  });

  it("belongs to the conversation the chip was staged on", () => {
    const line = handoffRefusalLine(
      "session-a",
      new ApiError(500, "internal", "x"),
      "helper_agent",
    );
    expect(sendRefusalShown(line, "session-a")).toBe(line.text);
    expect(sendRefusalShown(line, "session-b")).toBeNull();
  });
});

describe("modelSwitchRefusalLine", () => {
  it("names the picked model and says this conversation was not touched", () => {
    const line = modelSwitchRefusalLine("session-a", new ApiError(500, "internal", "boom"), {
      label: "Claude 4.8",
      modelId: "claude-4-8",
    });
    expect(line.sessionId).toBe("session-a");
    expect(line.text).toBe(S.chat.modelSwitchRefused("Claude 4.8", S.errors.byCode.internal));
    // The chip's label, not the raw id: the sentence reads as the card above it does.
    expect(line.text).toContain("Claude 4.8");
    expect(line.text).not.toContain("RAW");
  });

  it("names the picked model when its key is missing — the answer carries no model id", () => {
    const line = modelSwitchRefusalLine(
      "s",
      new ApiError(400, "model_credential_missing", "RAW ENGLISH"),
      { label: "claude-4-8", modelId: "claude-4-8" },
    );
    expect(line.text).toBe(
      S.chat.modelSwitchRefused("claude-4-8", S.errors.modelCredentialMissing("claude-4-8")),
    );
  });

  it("keeps what a request that never reached the route has to say", () => {
    expect(
      modelSwitchRefusalLine("s", new Error("Failed to fetch"), {
        label: "m",
        modelId: "m",
      }).text,
    ).toBe(S.chat.modelSwitchRefused("m", "Failed to fetch"));
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    const line = modelSwitchRefusalLine("s", new ApiError(500, "internal", "x"), {
      label: "Claude 4.8",
      modelId: "claude-4-8",
    });
    expect(line.text).toBe(EN.chat.modelSwitchRefused("Claude 4.8", EN.errors.byCode.internal));
  });

  it("belongs to the conversation the chip was staged on", () => {
    const line = modelSwitchRefusalLine("session-a", new ApiError(500, "internal", "x"), {
      label: "m",
      modelId: "m",
    });
    expect(sendRefusalShown(line, "session-a")).toBe(line.text);
    expect(sendRefusalShown(line, "session-b")).toBeNull();
  });
});

describe("deskModelRefusalLine", () => {
  it("does not claim the chart was left alone — the write may have landed before the refusal", () => {
    const line = deskModelRefusalLine("session-a", new ApiError(500, "internal", "boom"), {
      label: "Claude 4.8",
      modelId: "claude-4-8",
    });
    expect(line.sessionId).toBe("session-a");
    expect(line.text).toBe(S.chat.deskModelRefused("Claude 4.8", S.errors.byCode.internal));
    // The two things that hold whatever step failed: the message was not sent, and the chart says
    // which model the desk is on now. "unchanged" is exactly what it must not say — unlike the fork.
    expect(line.text).toContain("这条消息没有发出");
    expect(line.text).toContain("组织图");
    expect(line.text).not.toContain("本会话保持不变");
    expect(line.text).not.toBe(
      modelSwitchRefusalLine("session-a", new ApiError(500, "internal", "boom"), {
        label: "Claude 4.8",
        modelId: "claude-4-8",
      }).text,
    );
  });

  it("names the picked model when its key is missing", () => {
    const line = deskModelRefusalLine(
      "s",
      new ApiError(400, "model_credential_missing", "RAW ENGLISH"),
      { label: "claude-4-8", modelId: "claude-4-8" },
    );
    expect(line.text).toBe(
      S.chat.deskModelRefused("claude-4-8", S.errors.modelCredentialMissing("claude-4-8")),
    );
    expect(line.text).not.toContain("RAW");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    const line = deskModelRefusalLine("s", new ApiError(500, "internal", "x"), {
      label: "Claude 4.8",
      modelId: "claude-4-8",
    });
    expect(line.text).toBe(EN.chat.deskModelRefused("Claude 4.8", EN.errors.byCode.internal));
    expect(line.text).not.toContain("unchanged");
  });
});

describe("compactionRefusalLine", () => {
  it("says the context was left as it was, in this Session", () => {
    const line = compactionRefusalLine("session-a", new ApiError(409, "nothing_to_compact", "RAW"));
    expect(line.sessionId).toBe("session-a");
    expect(line.text).toBe(S.chat.compactRefused(S.errors.byCode.nothing_to_compact));
    // What is true of a refused `/compact`: nothing was written, the context is the same one.
    expect(line.text).toContain("本会话保持不变");
    expect(line.text).not.toContain("RAW");
  });

  it("reads every reason the route refuses with through its own sentence", () => {
    // The three codes `startCompact` answers 409 with — the ones this press meets in practice.
    const codes = ["nothing_to_compact", "already_compacted", "compaction_not_configured"] as const;
    for (const code of codes) {
      const line = compactionRefusalLine("s", new ApiError(409, code, "RAW ENGLISH"));
      expect(line.text).toBe(S.chat.compactRefused(S.errors.byCode[code]));
      expect(line.text).not.toContain("RAW");
    }
  });

  it("names no model — a refused compaction never reaches a model call", () => {
    const line = compactionRefusalLine("s", new ApiError(409, "nothing_to_compact", "RAW"));
    expect(line.text).not.toContain("claude");
    expect(line.text).not.toContain("deepseek");
  });

  it("keeps what a request that never reached the route has to say", () => {
    expect(compactionRefusalLine("s", new Error("Failed to fetch")).text).toBe(
      S.chat.compactRefused("Failed to fetch"),
    );
    expect(compactionRefusalLine("s", undefined).text).toBe(
      S.chat.compactRefused(S.common.unknownError),
    );
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(compactionRefusalLine("s", new ApiError(409, "already_compacted", "x")).text).toBe(
      EN.chat.compactRefused(EN.errors.byCode.already_compacted),
    );
  });

  it("is drawn only while the reader is still in that conversation", () => {
    const line = compactionRefusalLine("session-a", new ApiError(409, "already_compacted", "x"));
    expect(sendRefusalShown(line, "session-a")).toBe(line.text);
    expect(sendRefusalShown(line, "session-b")).toBeNull();
  });
});

describe("sendRefusalShown", () => {
  it("is drawn while it still describes the Session on screen", () => {
    const line = sendRefusalLine("session-a", new ApiError(500, "internal", "boom"));
    expect(sendRefusalShown(line, "session-a")).toBe(line.text);
  });

  it("is not carried into another conversation", () => {
    const line = sendRefusalLine("session-a", new ApiError(500, "internal", "boom"));
    expect(sendRefusalShown(line, "session-b")).toBeNull();
  });

  it("draws nothing when the last attempt went out", () => {
    expect(sendRefusalShown(null, "session-a")).toBeNull();
  });
});
