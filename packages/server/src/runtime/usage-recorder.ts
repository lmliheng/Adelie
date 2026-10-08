/**
 * Usage persistence.
 *
 * Consumes the Session output stream:
 *   - A subagent's `session_meta` (carrying origin) → registers the mapping "origin's
 *     last session_id → (provider, model_id)" (a subagent may use a different Model, so
 *     cost is priced against the actual Model used);
 *   - `token_usage` → inserts one usage_records row: the four token fields come from
 *     `payload.request` (per-Request increment; subagents are recorded one row at a
 *     time, with `session_id` attributed to their owning main Session), and the Request's
 *     cost is FIXED here, from the price the Project stores for that paired reference at
 *     this instant. Nothing re-prices a row afterwards: a later price edit, preset sync or
 *     promotion only changes what later Requests cost.
 *
 * The price is read from the Project's own config (getPricing, which folds in the row's
 * promotion), not from the rates a `token_usage` event may carry: a promotion lives in
 * web.db beside the file's list price, so only this side can state what a Request was billed.
 * The attribution key is always the paired reference `(provider, model_id)` (the same
 * model_id name across different vendors is attributed separately).
 */
import { isEventMessage, isSessionMeta } from "@lmliheng/penguin-core";
import type { OmniMessage } from "@lmliheng/penguin-core";
import { formatLocalDate } from "../internal/dates.js";
import { Component, Use } from "@lmliheng/penguin-core/kernel";
import type { Clock } from "../hmr/capabilities.js";
import type { UsageRecording, UsageStore } from "../mechanisms/observability.js";
import type { ProjectConfigStore } from "../mechanisms/projects.js";
import { requestCostUsd } from "../services/usage-service.js";
import type { PricingLookup } from "../services/usage-service.js";

/** Attribution context for one record (top-level Session scope). */
export interface UsageContext {
  projectId: string;
  agentId: string;
  /** Top-level Session id (the current actual id after self-heal). */
  sessionId: string;
  /** Vendor grouping for the top-level Session's model (paired with modelId; the fallback attribution when the origin mapping has no hit). */
  provider: string;
  /** Upstream model_id of the top-level Session (paired with provider). */
  modelId: string;
}

/** Cap on the subagent attribution mapping: over the limit, evicts the oldest by insertion order (an evicted entry falls back to the main Session's Model attribution). */
export const ORIGIN_MODELS_MAX = 1000;

@Component()
export class UsageRecorder implements UsageRecording {
  /** Subagent model attribution mapping: origin's last session_id → paired reference (session_id is globally unique). */
  private readonly originModels = new Map<string, { provider: string; modelId: string }>();

  @Use() private readonly usage!: UsageStore;
  @Use() private readonly clock!: Clock;
  @Use() private readonly projectConfig!: ProjectConfigStore;
  private lookupPricing: PricingLookup = (projectId, provider, modelId, at) =>
    this.projectConfig.getPricing(projectId, provider, modelId, at);

  /**
   * A record's cost, fixed now: the three buckets at the price the Project stores for this
   * reference at this instant — `null` when it stores none (an uncosted model). A price that
   * cannot be read counts as no price: the row is written either way, since losing the Tokens
   * would be worse than not costing them.
   */
  private async costOf(
    projectId: string,
    ref: { provider: string; modelId: string },
    counts: { cacheRead: number; cacheWrite: number; output: number },
    at: Date,
  ): Promise<number | null> {
    try {
      const rates = await this.lookupPricing(projectId, ref.provider, ref.modelId, at);
      if (rates === undefined) return null;
      return requestCostUsd(counts, rates);
    } catch {
      return null;
    }
  }

  /** Consume one outgoing message; messages other than session_meta / token_usage are a no-op. */
  async record(ctx: UsageContext, msg: OmniMessage): Promise<void> {
    if (isSessionMeta(msg) && msg.origin && msg.origin.length > 0) {
      const originSessionId = msg.origin[msg.origin.length - 1]!;
      // Bounded mapping (avoids unbounded growth over a long-running process): re-inserting refreshes insertion order, over the limit evicts the oldest.
      this.originModels.delete(originSessionId);
      this.originModels.set(originSessionId, {
        provider: msg.payload.provider,
        modelId: msg.payload.model_id,
      });
      if (this.originModels.size > ORIGIN_MODELS_MAX) {
        const oldest = this.originModels.keys().next().value;
        if (oldest !== undefined) this.originModels.delete(oldest);
      }
      return;
    }
    if (!isEventMessage(msg)) return;
    const payload = msg.payload as {
      type?: string;
      request?: { cache_read: number; cache_write: number; output: number; total: number };
      status?: string;
    };

    const originSessionId =
      msg.origin && msg.origin.length > 0 ? msg.origin[msg.origin.length - 1]! : null;
    // Empty origin → main session's Model; otherwise look up the mapping, falling back to the main Session's Model (paired) on a miss.
    const ref =
      originSessionId === null
        ? { provider: ctx.provider, modelId: ctx.modelId }
        : (this.originModels.get(originSessionId) ?? {
            provider: ctx.provider,
            modelId: ctx.modelId,
          });
    const now = this.clock.now();
    const base = {
      ts: now.toISOString(),
      date: formatLocalDate(now),
      projectId: ctx.projectId,
      agentId: ctx.agentId,
      sessionId: ctx.sessionId,
      originSessionId,
      provider: ref.provider,
      modelId: ref.modelId,
    };

    if (payload.type === "token_usage" && payload.request) {
      // A successful request: persist along with tokens (status defaults to completed).
      const r = payload.request;
      const counts = { cacheRead: r.cache_read, cacheWrite: r.cache_write, output: r.output };
      this.usage.insert({
        ...base,
        ...counts,
        total: r.total,
        cost: await this.costOf(ctx.projectId, ref, counts, now),
      });
      return;
    }
    // A failed request (request_end and not completed, usually with no token_usage):
    // persist 0 tokens + status, feeding the "model success rate" stat; a successful
    // request is already counted once via the token_usage branch above, not repeated here.
    if (payload.type === "request_end" && payload.status && payload.status !== "completed") {
      const counts = { cacheRead: 0, cacheWrite: 0, output: 0 };
      this.usage.insert({
        ...base,
        ...counts,
        total: 0,
        status: payload.status,
        // Zero, not null, for a priced model: nothing was billed, and the group is not uncosted.
        cost: await this.costOf(ctx.projectId, ref, counts, now),
      });
    }
  }
}
