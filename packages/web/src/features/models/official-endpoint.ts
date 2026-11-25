/**
 * The address a built-in (catalog) model row actually talks to — for the config dialog's
 * read-only base URL field.
 *
 * A gateway group presets its endpoint (`gatewayBaseUrl`) and seeds its rows with it, so those
 * rows show the address as the field's value. A first-party vendor's rows store no base URL at
 * all: the routed AgentHub client carries one (and reads its `*_BASE_URL` variable), and the
 * group deliberately has no preset. The field is locked with a note saying the catalog fixes the
 * address, so without this it asserted something it never named — "leave empty to use the
 * provider default" while the dialog refused edits.
 *
 * The vendor's own host comes from VENDOR_ENDPOINTS, the table the credential fallback already
 * reads, so the two can never disagree; its first entry is the default where a vendor runs two
 * (Z.AI's international host, Moonshot's mainland one), which is exactly what
 * `providerEnvNotes` explains beside it. Undefined for anything outside the catalog and for the
 * two addable groups (custom, vLLM): their rows carry their own URL, vLLM's server address is
 * per-deployment, and naming a borrowed OpenAI host there would be a lie.
 */
import { VENDOR_ENDPOINTS } from "@adelie/core/model-catalog";
import type { ModelProviderInfo } from "@adelie/core/model-catalog";

export function officialEndpoint(info: ModelProviderInfo | undefined): string | undefined {
  if (!info || info.addable) return undefined;
  return info.gatewayBaseUrl ?? VENDOR_ENDPOINTS[info.envKey]?.[0];
}
