/**
 * The cascade-layer order the page declares before its sheets.
 *
 * A set of cascade layer names is ordered by where each name first APPEARS, and the sheet the
 * server builds from `<data root>/themes/` (`GET /api/themes.css`) carries `@layer ui-theme`. With
 * that sheet linked first — it is, and it must be, so the sign-in page paints the imported theme —
 * it would be the first to name `ui-theme`, putting every theme recipe BELOW Tailwind's utilities.
 * A recipe's padding, borders and hidden marks then lose to `px-4` / `border` / `flex`; Console's
 * notice is where that showed (its `[WARN]` tag printed on top of the message on an installation
 * with any imported theme, and nowhere else).
 *
 * So the head states the order itself, before the link, and these hold it there: the statement
 * exists, it puts the recipes above the utilities, and it comes first.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `new URL(...).pathname` keeps the drive letter's leading slash on Windows ("/D:/a/…"), and
// `join` then reads `D:\D:\a\…` — the Windows job was red on exactly this. `fileURLToPath` is the
// way the rest of this package's tests already turn a URL into a path.
const WEB_DIR = fileURLToPath(new URL("../", import.meta.url));
const html = readFileSync(join(WEB_DIR, "index.html"), "utf8");

/** The one ordered `@layer a, b;` statement in the head, and where it sits. */
function headStatement(): { names: string[]; at: number } | null {
  const m = /@layer\s+([a-z0-9_,\s-]+?)\s*;/.exec(html);
  if (m === null) return null;
  return { names: m[1]!.split(",").map((n) => n.trim()), at: m.index };
}

describe("the page's cascade-layer order", () => {
  it("is declared in the head, before the imported-theme sheet", () => {
    const link = html.indexOf('href="/api/themes.css"');
    expect(link).toBeGreaterThan(-1);
    const statement = headStatement();
    expect(statement).not.toBeNull();
    expect(statement!.at).toBeLessThan(link);
  });

  it("puts the theme recipes above Tailwind's utilities, which is the whole point", () => {
    // `utilities` last-declared of Tailwind's, `ui-theme` the app's own recipe layer: a layer that
    // comes later in the statement outranks the ones before it.
    const names = headStatement()!.names;
    expect(names.indexOf("ui-theme")).toBeGreaterThan(names.indexOf("utilities"));
    expect(names.indexOf("ui-accent")).toBeGreaterThan(names.indexOf("ui-theme"));
    expect(names.indexOf("ui-font")).toBeGreaterThan(names.indexOf("ui-accent"));
  });
});
