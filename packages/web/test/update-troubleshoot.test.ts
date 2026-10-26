/**
 * update-troubleshoot.ts: which update failures get the hand-off to an Agent, and what the
 * prompt it writes into the chat says.
 *
 * What matters to a user: the offer appears for a host that cannot reach GitHub (and not for a
 * failure a network diagnosis would not fix), the prompt names the release and quotes the run's
 * own output rather than paraphrasing it, and it carries the steps — diagnose, fetch over a
 * route that works, verify, install, leave the data directory alone — in whichever language is
 * active.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";
import {
  PROMPT_OUTPUT_MAX,
  buildUpdateTroubleshootPrompt,
  unreachableDownload,
} from "../src/lib/update-troubleshoot";
import type { UpdateFailure } from "../src/lib/update-troubleshoot";

afterEach(() => setActiveStrings(zh));

const failure = (over: Partial<UpdateFailure> = {}): UpdateFailure => ({
  kind: "error",
  message: null,
  detail: null,
  retry: "download",
  version: "0.5.8",
  ...over,
});

describe("unreachableDownload", () => {
  it("recognizes the CLI giving up on the download", () => {
    expect(
      unreachableDownload(
        failure({
          detail:
            "Downloading penguin-linux-x64.tar.gz from GitHub ...\n" +
            "curl: (7) Failed to connect to github.com port 443 after 21075 ms: Couldn't connect to server\n" +
            "Could not download the installer from GitHub. Check your network and retry.",
        }),
      ),
    ).toBe(true);
  });

  it("recognizes the shell's own updater failure", () => {
    expect(
      unreachableDownload(failure({ message: "Could not download the update.", retry: "check" })),
    ).toBe(true);
    expect(
      unreachableDownload(failure({ message: "net::ERR_CONNECTION_TIMED_OUT", retry: "download" })),
    ).toBe(true);
  });

  it("recognizes a lookup answered by something that was not GitHub", () => {
    expect(
      unreachableDownload(
        failure({
          retry: "check",
          detail:
            "The GitHub release lookup returned an unexpected response with no usable version tag.",
        }),
      ),
    ).toBe(true);
  });

  it("stays quiet for failures no network diagnosis would fix", () => {
    // A downloaded bundle that failed its checksum, a refused layout, a failed check with nothing
    // to hand over, and the CLI's Windows refusal.
    expect(unreachableDownload(failure({ message: "sha512 mismatch" }))).toBe(false);
    expect(
      unreachableDownload(
        failure({ detail: "Cannot tell how this penguin was installed (running from /x)..." }),
      ),
    ).toBe(false);
    expect(unreachableDownload(failure({ retry: "check" }))).toBe(false);
    expect(unreachableDownload(failure({ message: "Could not check for updates." }))).toBe(false);
    expect(
      unreachableDownload(
        failure({ detail: "The official installer is a POSIX shell script and does not run" }),
      ),
    ).toBe(false);
  });
});

describe("buildUpdateTroubleshootPrompt", () => {
  it("names the release, quotes the run's output, and ends with the steps", () => {
    const output = "curl: (6) Could not resolve host: github.com";
    const prompt = buildUpdateTroubleshootPrompt(failure({ detail: output }));
    expect(prompt).toContain(S.update.troubleshootPromptLead("0.5.8"));
    expect(prompt).toContain(S.update.troubleshootPromptClip(output));
    expect(prompt.endsWith(S.update.troubleshootPromptTail("0.5.8"))).toBe(true);
    // The steps carry the release's own download directory, so the Agent does not have to guess it.
    expect(prompt).toContain("/releases/download/v0.5.8/");
    // And the one thing it must not touch.
    expect(prompt).toContain("~/.adelie/data");
  });

  it("falls back to the shell's message when there is no output tail", () => {
    const prompt = buildUpdateTroubleshootPrompt(
      failure({ message: "Could not download the update.", retry: "check" }),
    );
    // The shell reports one sentence and no output; that sentence is what gets quoted.
    expect(prompt).toContain(S.update.troubleshootPromptClip("Could not download the update."));
    expect(prompt.startsWith(S.update.troubleshootPromptLead("0.5.8"))).toBe(true);
  });

  it("leaves the output block out entirely when neither backend named anything", () => {
    const prompt = buildUpdateTroubleshootPrompt(failure());
    expect(prompt).toBe(
      `${S.update.troubleshootPromptLead("0.5.8")}\n\n${S.update.troubleshootPromptTail("0.5.8")}`,
    );
  });

  it("asks for the latest release when the backend named no version", () => {
    const prompt = buildUpdateTroubleshootPrompt(failure({ version: null, detail: "x" }));
    expect(prompt).toContain(S.update.troubleshootPromptLead(null));
    expect(prompt).toContain(S.update.troubleshootPromptTail(null));
    expect(prompt).not.toContain("/releases/download/v");
  });

  it("strips the job's colour and keeps the end of an over-long output, marked as cut", () => {
    const long = `\u001b[36m${"x".repeat(PROMPT_OUTPUT_MAX + 500)}\u001b[0m at the end`;
    const prompt = buildUpdateTroubleshootPrompt(failure({ detail: long }));
    expect(prompt).not.toContain("\u001b");
    // The head is dropped (the CLI prints why it gave up last) and the cut is visible.
    expect(prompt).not.toContain("x".repeat(PROMPT_OUTPUT_MAX + 1));
    expect(prompt).toContain("…");
    expect(prompt).toContain("at the end");
  });

  it("follows the active dictionary", () => {
    for (const dict of [en, zh]) {
      setActiveStrings(dict);
      expect(buildUpdateTroubleshootPrompt(failure({ detail: "boom" }))).toBe(
        `${dict.update.troubleshootPromptLead("0.5.8")}\n\n${dict.update.troubleshootPromptClip(
          "boom",
        )}\n\n${dict.update.troubleshootPromptTail("0.5.8")}`,
      );
    }
  });
});
