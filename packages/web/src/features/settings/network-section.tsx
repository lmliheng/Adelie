/**
 * Settings › Network record: the conversation's "网络" panel's own rules. Recording is always
 * on — there is deliberately no "enable debug mode" switch (the one the user rejected) — so this
 * page adjusts what is kept and how the panel reads, plus the two things one does about the
 * record as a whole: export it, or clear it.
 *
 * Everything here is a browser preference (api/net-log.ts's store, localStorage): the ring's
 * size, whether bodies are kept, the inline request line and the slow highlight. The masking
 * rules are fixed — the section lists them as facts rather than as switches, because the design
 * keeps masking always on and reveals a raw value per request instead.
 */
import { useSyncExternalStore } from "react";
import { Button, NoticeStrip, PrefRow, Segmented, SettingsSection, ToggleRow } from "@adelie/ui";
import {
  clearNetLog,
  netLogEntries,
  netLogPrefs,
  netLogVersion,
  setNetLogPrefs,
  subscribeNetLog,
} from "../../api/net-log";
import { formatBytes, humanizeDuration } from "../../lib/format";
import { S } from "../../lib/strings";
import { toneSurface } from "../../lib/tone";
import { exportNetLogJson } from "../network/net-export";
import { summarizeNet } from "../network/net-rows";

/** The ring-size presets the page offers (the store clamps anything else). */
const CAPACITY_CHOICES = [100, 300, 1000] as const;

/** A mask chip: a fixed rule, shown as a fact (masking is always on). */
function MaskChip({ name }: { name: string }) {
  return (
    <span className="rounded-md border border-line-muted px-1.5 py-0.5 font-mono text-xs text-fg-muted">
      {name}
    </span>
  );
}

export function NetworkSection() {
  const version = useSyncExternalStore(subscribeNetLog, netLogVersion);
  const prefs = netLogPrefs();
  // Read under the version so the counts move as requests land (entries mutate in place).
  void version;
  const entries = netLogEntries();
  const summary = summarizeNet(entries);

  return (
    <SettingsSection>
      <NoticeStrip tone="attention" as="p" className="rounded-md border px-3 py-2 text-xs">
        {S.settings.networkBanner}
      </NoticeStrip>

      <div className="space-y-1">
        <h3 className="text-sm font-medium text-fg">{S.settings.networkSectionRecord}</h3>
        <p className="text-xs text-fg-muted">{S.settings.networkRecordInfo}</p>
      </div>
      <div className="divide-y divide-line-muted">
        <PrefRow label={S.settings.networkCapacity} hint={S.settings.networkCapacityHint}>
          <Segmented
            options={CAPACITY_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(prefs.capacity)}
            onChange={(v) => setNetLogPrefs({ capacity: Number(v) })}
          />
        </PrefRow>
        <PrefRow
          label={S.settings.networkContent}
          hint={`${S.settings.networkContentRequests} · ${S.settings.networkContentModels} · ${S.settings.networkContentStreams}`}
        >
          <div className="flex flex-wrap gap-1">
            <MaskChip name={S.settings.networkContentRequests} />
            <MaskChip name={S.settings.networkContentModels} />
            <MaskChip name={S.settings.networkContentStreams} />
          </div>
        </PrefRow>
        <ToggleRow
          label={S.settings.networkContentBodies}
          hint={S.settings.networkCapacityHint}
          checked={prefs.recordBody}
          onChange={(on) => setNetLogPrefs({ recordBody: on })}
        />
        <ToggleRow
          label={S.settings.networkInlineRow}
          checked={prefs.inlineRow}
          onChange={(on) => setNetLogPrefs({ inlineRow: on })}
        />
        <ToggleRow
          label={S.settings.networkSlowHighlight}
          checked={prefs.slowHighlight}
          onChange={(on) => setNetLogPrefs({ slowHighlight: on })}
        />
      </div>

      <div className="space-y-1 pt-1">
        <h3 className="text-sm font-medium text-fg">{S.settings.networkSectionMask}</h3>
        <p className="text-xs text-fg-muted">{S.settings.networkMaskInfo}</p>
      </div>
      <div className="divide-y divide-line-muted">
        <PrefRow label={S.settings.networkMaskHeaders}>
          <div className="flex flex-wrap justify-end gap-1">
            <MaskChip name="authorization" />
            <MaskChip name="cookie" />
            <MaskChip name="set-cookie" />
            <MaskChip name="x-api-key" />
            <MaskChip name="*token*" />
            <MaskChip name="*secret*" />
            <MaskChip name="*password*" />
          </div>
        </PrefRow>
        <PrefRow label={S.settings.networkMaskParams}>
          <div className="flex flex-wrap justify-end gap-1">
            <MaskChip name="key" />
            <MaskChip name="token" />
            <MaskChip name="api_key" />
            <MaskChip name="access_token" />
          </div>
        </PrefRow>
        <PrefRow label={S.settings.networkMaskStyle}>
          <span className="font-mono text-xs text-fg-muted">{S.settings.networkMaskSample}</span>
        </PrefRow>
      </div>

      <div className="space-y-1 pt-1">
        <h3 className="text-sm font-medium text-fg">{S.settings.networkSectionCurrent}</h3>
        <p className="text-xs text-fg-muted">{S.settings.networkCurrentInfo}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line-muted px-3 py-2">
        <span className="text-sm text-fg">
          {S.settings.networkRecordedLine(
            summary.requests,
            summary.modelCalls,
            formatBytes(summary.bytes),
          )}
        </span>
        {summary.failures > 0 && (
          <span className={`rounded px-1.5 py-0.5 text-xs ${toneSurface.danger}`}>
            {S.settings.networkFailures(summary.failures)}
          </span>
        )}
        <span className="text-xs text-fg-subtle">{humanizeDuration(summary.durationMs)}</span>
        <span className="ml-auto flex gap-2">
          <Button
            size="sm"
            disabled={entries.length === 0}
            onClick={() => exportNetLogJson(entries)}
          >
            {S.settings.networkExportJson}
          </Button>
          <Button size="sm" disabled={entries.length === 0} onClick={() => clearNetLog()}>
            {S.settings.networkClear}
          </Button>
        </span>
      </div>
    </SettingsSection>
  );
}
