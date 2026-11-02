/**
 * Where a refused save of one plugin card lands (`pluginSaveRefusal`). The server names the field
 * its schema turned down, so that rejection belongs under the field; every other way a save can
 * fail is about the card, and a toast would dismiss itself over a card that looks untouched.
 *
 * - A named field of `plugin_config_invalid` → that field's slot.
 * - A cell name (`<field>.<row>.<column>`) travels as given; the table lists it under itself.
 * - `plugin_config_invalid` with no leading name, and every other code → the card.
 * - A value the client raised itself → the card, with its own sentence.
 * - Nothing to say → the card, with the generic failure.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { pluginSaveRefusal } from "../src/features/settings/plugin-config-save";

const serverError = (status: number, code: string, message: string): ApiError =>
  new ApiError(status, code, message);

afterEach(() => {
  setActiveStrings(ZH);
});

describe("pluginSaveRefusal", () => {
  it("draws a named field's rejection under that field", () => {
    const refusal = pluginSaveRefusal(
      serverError(400, "plugin_config_invalid", '"maskPaths" must be a list of strings'),
    );
    expect(refusal.field).toBe("maskPaths");
    // The words travel through the app's own error text, which keeps a code it has no sentence
    // for as the server wrote it — the field line has always read this way.
    expect(refusal.text).toBe('"maskPaths" must be a list of strings');
  });

  it("keeps a refused cell's full name, so the table can list it under itself", () => {
    const refusal = pluginSaveRefusal(
      serverError(
        400,
        "plugin_config_invalid",
        '"presets.extra.mode" is not a column of this table',
      ),
    );
    expect(refusal.field).toBe("presets.extra.mode");
  });

  it("draws an invalid answer that names no field on the card", () => {
    const refusal = pluginSaveRefusal(
      serverError(400, "plugin_config_invalid", "sandbox settings are locked"),
    );
    expect(refusal.field).toBeNull();
    expect(refusal.text).toBe("sandbox settings are locked");
  });

  it("draws every other server refusal on the card", () => {
    for (const error of [
      // The group went away under the page: a plugin or a backend was removed.
      serverError(404, "plugin_config_unknown", 'no settings group named "sandbox"'),
      serverError(500, "internal", "Internal server error"),
      serverError(401, "unauthorized", "Sign in again."),
    ]) {
      const refusal = pluginSaveRefusal(error);
      expect(refusal.field).toBeNull();
      expect(refusal.text.length).toBeGreaterThan(0);
    }
    // A code the app has words for is said in its words, not the server's.
    expect(pluginSaveRefusal(serverError(500, "internal", "Internal server error")).text).toBe(
      S.errors.byCode.internal,
    );
  });

  it("keeps the app's own sentence for a failure raised here", () => {
    const refusal = pluginSaveRefusal(new Error("连接已断开"));
    expect(refusal.field).toBeNull();
    expect(refusal.text).toBe("连接已断开");
  });

  it("falls back to the generic text when the value says nothing", () => {
    for (const value of [undefined, null, "boom", {}]) {
      const refusal = pluginSaveRefusal(value);
      expect(refusal.field).toBeNull();
      expect(refusal.text).toBe(S.common.unknownError);
    }
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    const refusal = pluginSaveRefusal(serverError(500, "internal", "Internal server error"));
    expect(refusal.text).toBe(EN.errors.byCode.internal);
    expect(refusal.text).not.toBe(ZH.errors.byCode.internal);
  });
});
