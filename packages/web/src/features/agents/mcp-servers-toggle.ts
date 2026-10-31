/**
 * The MCP Server row's on/off switch: the list a flip produces, and which row draws the sentence
 * when the write it sent is refused.
 *
 * The switch writes nothing optimistically — it sends the whole `mcpServers` list back through the
 * one config PUT every edit here uses, and the rows keep the state the server has until that write
 * lands. So a refused flip left the table exactly as it was, with the reason in a toast that
 * dismissed itself after six seconds: a switch that did not move and, six seconds later, nothing
 * saying why. That sentence now stays under the switch that asked, until the next flip or the next
 * write that lands (see `mcp-servers-section.tsx`).
 *
 * Which row may draw it is decided here, because that question has a trap worth writing down: a
 * server is *named*, but names are not guaranteed unique — the Add/Edit modal refuses a duplicate,
 * while a hand-edited `system_config.yaml` may carry two entries of the same name (core warns and
 * skips what it cannot resolve, it does not dedupe). A sentence keyed by name would then appear
 * under both rows, and the one that was never written to would read as a failure of its own. The
 * row is therefore identified by its position in the list the page is showing — the row whose
 * switch was flipped, which the refused write leaves exactly where it was.
 */
import type { MCPServerConfig } from "@adelie/core/interfaces";
import { enabledOf } from "./mcp-servers-form";

/** The flip the server refused, named by the position of the row it was about, with the server's words (`apiErrorText`). */
export interface McpToggleRefusal {
  index: number;
  text: string;
}

/**
 * The line one row draws: the refused flip's own sentence, and nothing on any other row — the
 * other rows were never written to, and their switches did not move either.
 */
export function toggleRefusalFor(refusal: McpToggleRefusal | null, index: number): string | null {
  if (refusal === null) return null;
  return refusal.index === index ? refusal.text : null;
}

/**
 * The whole list as one row's switch flips it: that entry only, every other entry returned as it
 * came in (same object, so nothing downstream sees a needless change).
 *
 * Turning a server *on* drops the key instead of storing `true`, so the entry keeps following the
 * default — core reads an absent `enabled` as on, the same normalization the form does. Turning it
 * off stores `false`, which is the only value that reads as off.
 */
export function flippedEnabled(
  servers: readonly MCPServerConfig[],
  index: number,
): MCPServerConfig[] {
  return servers.map((s, i) => {
    if (i !== index) return s;
    if (!enabledOf(s)) {
      const config = { ...s.config };
      delete config["enabled"];
      return { name: s.name, config };
    }
    return { name: s.name, config: { ...s.config, enabled: false } };
  });
}
