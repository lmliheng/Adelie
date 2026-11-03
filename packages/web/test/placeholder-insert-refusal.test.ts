/**
 * How a refused placeholder write is worded (`placeholderInsertRefused`): the strip at the head of
 * Memory, Skills, Vault and Schedules — four sections behind one sentence.
 *
 * Nothing on the page moves until the write lands, so a refused one leaves the strip and the
 * button that asked exactly where they were; a toast used to be the only account of it, and six
 * seconds later the strip looked as though it had never been pressed.
 *
 * - The sentence names the placeholder token, because four sections share it and "the placeholder"
 *   alone would not say which one.
 * - A legacy template's button migrates instead of inserting, so the verb follows the button.
 * - The reason is whatever the server gave, verbatim.
 */
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { placeholderInsertRefused } from "../src/features/agents/placeholder-insert-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("placeholderInsertRefused", () => {
  it("names the placeholder and carries the server's reason verbatim", () => {
    expect(placeholderInsertRefused("{{MEMORY}}", false, "Internal server error")).toBe(
      "插入 {{MEMORY}} 占位符被拒：Internal server error",
    );
  });

  it("uses the migrate verb when the button migrates a legacy section instead", () => {
    // The Vault and Skills strips switch their own button's wording on a legacy template; saying
    // "insert" about a migration would describe a request nobody made.
    expect(placeholderInsertRefused("{{VAULT}}", true, "Internal server error")).toBe(
      "迁移为 {{VAULT}} 占位符被拒：Internal server error",
    );
  });

  it("names each section's own token, so the line says which placeholder", () => {
    expect(placeholderInsertRefused(S.memory.placeholderToken, false, "nope")).toBe(
      "插入 {{MEMORY}} 占位符被拒：nope",
    );
    expect(placeholderInsertRefused(S.skills.injection.placeholderToken, false, "nope")).toBe(
      "插入 {{SKILLS}} 占位符被拒：nope",
    );
    expect(placeholderInsertRefused(S.vault.injection.placeholderToken, true, "nope")).toBe(
      "迁移为 {{VAULT}} 占位符被拒：nope",
    );
    expect(placeholderInsertRefused(S.schedule.injection.placeholderToken, false, "nope")).toBe(
      "插入 {{SCHEDULES}} 占位符被拒：nope",
    );
  });

  it("keeps the reason's own punctuation", () => {
    expect(placeholderInsertRefused("{{SKILLS}}", false, "服务器内部错误，请稍后重试。")).toBe(
      "插入 {{SKILLS}} 占位符被拒：服务器内部错误，请稍后重试。",
    );
  });

  it("follows the interface language, both verbs", () => {
    setActiveStrings(EN);
    expect(placeholderInsertRefused("{{MEMORY}}", false, "nope")).toBe(
      "Inserting the {{MEMORY}} placeholder was refused: nope",
    );
    expect(placeholderInsertRefused("{{SKILLS}}", true, "nope")).toBe(
      "Migrating to the {{SKILLS}} placeholder was refused: nope",
    );
  });
});
