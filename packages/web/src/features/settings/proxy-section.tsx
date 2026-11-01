/**
 * Proxy options (admin only, server-global). A form, not a live surface: two switches —
 * "Application uses the proxy" (the server's own outbound dispatcher) and "Agent environment
 * uses the proxy" (command subprocess environments) — share one proxy address, and nothing is
 * written until Save, which applies everything atomically via a single PUT. The server
 * validates and normalizes the address (bare "host:port" is stored as "http://host:port"); a
 * rejected address renders inline under the input and the atomic PUT writes nothing. Save with
 * no modifications sends no request and toasts "no changes"; a successful save takes effect
 * without a restart.
 *
 * Settings hydrate when the section mounts — which is every time it is navigated to — and the
 * controls and Save stay disabled until they arrive. The saved response is adopted as the new
 * baseline, including the address in the exact form the server stored, so the page reflects
 * what is on the server rather than what was typed at it.
 *
 * The reachability test sits BELOW the save row, in its own block, because it measures the
 * SAVED configuration: only a PUT moves the server's outbound dispatcher, so a typed-but-unsaved
 * address is not in the path the probes travel. Reading top to bottom — edit, save, then
 * measure — is what makes that honest without a warning banner. A save clears results that now
 * describe a superseded configuration.
 *
 * One request per target, fired together and rendered as each lands. A single response carrying
 * all of them would hold every row blank until the slowest answered, which for a host that
 * black-holes connections is the full five-second timeout with five working results behind it.
 *
 * It carries its own busy flag rather than borrowing Save's: a measurement is not an unsaved
 * edit, so it neither blocks Save nor is blocked by it.
 *
 * A run whose requests fail (a lost session, a dead server — every outcome the test itself can
 * have arrives inside a 200 and lands on its target's row) says why in this block rather than in a
 * toast: a failed run fills no row, so the block looks exactly as it did before it ran, and the
 * sentence belongs to the button that just did nothing rather than to a notification that
 * dismisses itself over it (7.66, the rule the write refusals follow). It stays until the next run
 * or a save, which supersedes the path it describes.
 *
 * The targets — name and exact URL — come from the server and are listed before anyone presses
 * the button, so the page shows concretely what will be requested and a reader can see that
 * these are plain unauthenticated GETs. A frontend copy of that list could drift from the URLs
 * the server really fetches, so it is fetched, not hard-coded.
 *
 * Two more refusals say why in this section rather than in a toast (7.67, the same rule). A save
 * refused for anything but the address — a lost session, a dead server, a 500 — wrote nothing, so
 * the form comes back exactly as it was and Save is the retry: its sentence sits above the Save
 * row until the next save replaces it. Settings that fail to LOAD leave every control disabled
 * with no explanation at all, so that sentence goes above the controls rather than below them —
 * up there it is read first, which is what it is for: for as long as it stands, the two switches
 * and the address field are showing the form's defaults, not what the server holds. Leaving the
 * section and coming back re-mounts it, and that is the retry; neither sentence carries a button.
 */
import { useEffect, useRef, useState } from "react";
import type {
  ProxyProbeDto,
  ProxyProbeProvider,
  ProxyProbeTargetDto,
  ServerSettings,
} from "@adelie/server/api";
import { Button, Input, SettingsSection, ToggleRow, toastInfo, toastSuccess } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { toneInk } from "../../lib/tone";
import { probeRefusalFor } from "./proxy-probe";
import type { ProxyProbeRefusal } from "./proxy-probe";
import { proxySaveRefusal } from "./proxy-save-refusal";

/** Brand names: identical in every locale, so they are keyed off the server's provider id rather than doubled into both dictionaries. */
const PROVIDER_LABEL: Record<ProxyProbeProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  // GLM's two hosts, named by the one each key comes from: the global endpoint the catalog
  // defaults to, and the mainland one a bigmodel.cn key needs.
  zai: "Z.AI",
  bigmodel: "BigModel",
};

export function ProxySection() {
  /** Stored settings as hydrated on mount (null until then) — the no-change baseline. */
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  // Form drafts; the pre-hydration values mirror the server defaults (on, on, empty).
  const [proxyForApp, setProxyForApp] = useState(true);
  const [proxyForAgent, setProxyForAgent] = useState(true);
  const [proxyUrl, setProxyUrl] = useState("");
  /** Inline error under the address input (the server's invalid_proxy_url rejection). */
  const [addressError, setAddressError] = useState<string | null>(null);
  /**
   * Why the last save was refused for anything but the address, drawn above the Save row until
   * the next save replaces it. Nothing was written, so the form and the sentence agree.
   */
  const [saveRefusal, setSaveRefusal] = useState<string | null>(null);
  /**
   * Why the settings could not be read, drawn above the controls. Non-null means nothing has been
   * hydrated: every control below is disabled and showing the form's defaults, not the server's.
   */
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** What the probe would request, listed before it is run (null until it arrives). */
  const [targets, setTargets] = useState<ProxyProbeTargetDto[] | null>(null);
  /** Results by provider (null until a run starts, then filled one at a time), and the probe's own busy flag. */
  const [results, setResults] = useState<Map<ProxyProbeProvider, ProxyProbeDto> | null>(null);
  const [probing, setProbing] = useState(false);
  /**
   * Why the last run's requests failed, drawn under the button until the next run or a save. One
   * sentence per run, and none from a superseded one — the rule is `probeRefusalFor`'s.
   */
  const [probeRefusal, setProbeRefusal] = useState<ProxyProbeRefusal | null>(null);
  /**
   * Which run each in-flight answer belongs to. A result can land after its run stopped being
   * the current one — a save adopts new settings mid-flight — and a row filled from a
   * superseded run would report a path nothing travelled.
   */
  const runSeq = useRef(0);

  /** Adopt server-side truth: the baseline and the drafts move together. */
  const adopt = (next: ServerSettings) => {
    setSettings(next);
    setProxyForApp(next.proxyForApp);
    setProxyForAgent(next.proxyForAgent);
    setProxyUrl(next.proxyUrl ?? "");
    // Results describe the path they travelled; a save may have replaced it. Bumping the run
    // counter also discards whatever is still in flight against the old one.
    runSeq.current += 1;
    setResults(null);
    setProbeRefusal(null);
    setProbing(false);
  };

  useEffect(() => {
    let cancelled = false;
    void api
      .adminGetSettings()
      .then((res) => {
        if (!cancelled) adopt(res.settings);
      })
      .catch((e: unknown) => {
        // Kept above the controls, not toasted: they stay disabled until a later mount retries,
        // and a section of dead controls with no sentence beside it is the worse answer.
        if (!cancelled) setLoadRefusal(refusalText(e));
      });
    // The target list is static server-side, so its failure gets no sentence of its own on top of
    // the settings one — the block simply stays empty, and its button stays disabled, until a
    // retry succeeds.
    void api
      .adminGetProxyProbeTargets()
      .then((res) => {
        if (!cancelled) setTargets(res.targets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (settings === null || busy) return;
    const unchanged =
      proxyForApp === settings.proxyForApp &&
      proxyForAgent === settings.proxyForAgent &&
      proxyUrl.trim() === (settings.proxyUrl ?? "");
    if (unchanged) {
      toastInfo(S.common.noChangesToSave);
      return;
    }
    setBusy(true);
    setAddressError(null);
    // Another attempt: the sentence about the last one is stale from this moment on.
    setSaveRefusal(null);
    try {
      const res = await api.adminPutSettings({ proxyForApp, proxyForAgent, proxyUrl });
      adopt(res.settings);
      toastSuccess(S.common.saved);
    } catch (e) {
      // The address is the only validated field, so its rejection renders under it; anything else
      // (auth, network, a 500) is about the whole form and renders above the Save row.
      const refusal = proxySaveRefusal(e);
      if (refusal.field === "address") setAddressError(refusal.text);
      else setSaveRefusal(refusal.text);
    } finally {
      setBusy(false);
    }
  };

  const runProbe = () => {
    if (settings === null || targets === null || probing) return;
    const run = (runSeq.current += 1);
    setProbing(true);
    // The previous run's numbers go now rather than lingering under a running test: a stale
    // figure beside a live one cannot be told apart. An empty map, not null — null is "never
    // run", and the rows read it to tell "not tested" from "still measuring".
    setResults(new Map());
    // The sentence about the last run describes a path this one may no longer travel.
    setProbeRefusal(null);
    void Promise.allSettled(
      targets.map((t) =>
        api
          .adminProbeProxy(t.provider)
          .then((res) => {
            if (runSeq.current !== run) return;
            setResults((prev) => new Map(prev ?? []).set(res.probe.provider, res.probe));
          })
          .catch((e: unknown) => {
            // Every outcome the probe itself can have, reachable or not, comes back inside a
            // 200; only the request failing (a lost session, a dead server) lands here. Kept in
            // the block rather than toasted: nothing was filled in, and the button is the retry.
            setProbeRefusal((prev) =>
              probeRefusalFor(prev, { run, liveRun: runSeq.current, error: e }),
            );
          }),
      ),
    ).finally(() => {
      if (runSeq.current === run) setProbing(false);
    });
  };

  const hydrated = settings !== null;

  return (
    <>
      <SettingsSection
        actions={
          <Button
            size="sm"
            variant="primary"
            disabled={!hydrated || busy}
            onClick={() => void save()}
          >
            {S.common.save}
          </Button>
        }
      >
        {/* Above the controls, because it is about all of them: with no settings read, the two
            switches and the address below show the form's defaults, and this sentence is the only
            thing that says so. Clamped to two lines with the whole of it on hover, because a
            server's words run long. */}
        {loadRefusal !== null && (
          <p
            role="alert"
            data-tooltip={S.common.refused(loadRefusal)}
            data-tooltip-content="text"
            className={`line-clamp-2 break-words text-xs ${toneInk.danger}`}
          >
            {S.common.refused(loadRefusal)}
          </p>
        )}
        <ToggleRow
          variant="plain"
          label={S.settings.proxyForApp}
          checked={proxyForApp}
          onChange={setProxyForApp}
          disabled={!hydrated}
        />
        <ToggleRow
          variant="plain"
          label={S.settings.proxyForAgent}
          checked={proxyForAgent}
          onChange={setProxyForAgent}
          disabled={!hydrated}
        />
        <Input
          label={S.settings.proxyAddress}
          size="sm"
          value={proxyUrl}
          placeholder={S.settings.proxyAddressPlaceholder}
          disabled={!hydrated}
          {...(addressError !== null ? { error: addressError } : {})}
          onChange={(e) => {
            setProxyUrl(e.target.value);
            if (addressError !== null) setAddressError(null);
          }}
        />
        {/* The save's own failure, just above the Save button that is its retry. The address's
            rejection is drawn under the input instead (7.67). */}
        {saveRefusal !== null && (
          <p
            role="alert"
            data-tooltip={S.common.refused(saveRefusal)}
            data-tooltip-content="text"
            className={`line-clamp-2 break-words text-xs ${toneInk.danger}`}
          >
            {S.common.refused(saveRefusal)}
          </p>
        )}
      </SettingsSection>
      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm font-medium">{S.settings.proxyProbe}</div>
          <Button
            size="sm"
            disabled={!hydrated || targets === null || probing}
            aria-busy={probing}
            onClick={runProbe}
          >
            {probing ? S.settings.proxyProbeRunning : S.settings.proxyProbeRun}
          </Button>
        </div>
        {/* The run's own failure, in the block that ran and above the targets it could not fill:
            it is about every one of them, so it belongs to none of their rows. Clamped to two
            lines with the whole of it on hover, because a server's words run long. */}
        {probeRefusal !== null && (
          <p
            role="alert"
            data-tooltip={S.common.refused(probeRefusal.text)}
            data-tooltip-content="text"
            className={`mt-2 line-clamp-2 break-words text-xs ${toneInk.danger}`}
          >
            {S.common.refused(probeRefusal.text)}
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {(targets ?? []).map((t) => {
            // This row's own answer, shown the moment it exists — the rows still waiting keep
            // saying so beside it. Checked on `probe.outcome` itself rather than through a
            // boolean, so the failure branch narrows to the kinds the dictionary has a word for.
            const probe = results?.get(t.provider);
            const outcomeText =
              probe !== undefined
                ? probe.outcome === "reachable"
                  ? S.settings.proxyProbeLatency(probe.ms)
                  : S.settings.proxyProbeFailure[probe.outcome]
                : probing
                  ? S.settings.proxyProbeRunning
                  : S.settings.proxyProbeIdle;
            const reachable = probe !== undefined && probe.outcome === "reachable";
            return (
              <li key={t.provider}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {PROVIDER_LABEL[t.provider]}
                  </span>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      probe === undefined
                        ? // No verdict yet: secondary text, not a status tone — an absence
                          // is not a judgement about the target.
                          "text-gray-500 dark:text-gray-400"
                        : reachable
                          ? toneInk.success
                          : toneInk.danger
                    }`}
                  >
                    {outcomeText}
                    {/* A bare number does not say "reachable"; the word travels with it for
                        anyone who cannot see the colour. */}
                    {reachable && (
                      <span className="sr-only"> · {S.settings.proxyProbeReachableState}</span>
                    )}
                  </span>
                </div>
                <div className="truncate font-mono text-xs text-gray-400 dark:text-gray-500">
                  {t.url}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
