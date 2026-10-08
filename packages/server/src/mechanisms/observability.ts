/**
 * The observability mechanisms: what a node may require, declared apart from what implements it.
 */
import { Interface } from "@lmliheng/penguin-core/kernel";
import type { Opaque } from "@lmliheng/penguin-core/kernel";
import type {
  ErrorCodeCount,
  ErrorFilter,
  ErrorItem,
  ErrorRecordInsert,
  ErrorSummary,
} from "../db/repos/errors.js";
import type { ErrorRecordArgs } from "../runtime/error-recorder.js";
import type {
  UsageAgentBucketCount,
  UsageFilter,
  UsageGroupModelSums,
  UsageModelSums,
  UsageRecordInsert,
  UsageSeriesGranularity,
  UsageSeriesModelSums,
  UnsettledUsageRow,
} from "../db/repos/usage.js";
import type {
  UsageErrorsPage,
  UsageGroupBy,
  UsageResponse,
  UsageModelTotals,
} from "../api/types.js";
import type { UsageContext } from "../runtime/usage-recorder.js";
import type {
  AbortPayload,
  ApprovalDecisionPayload,
  CompactionBeginPayload,
  CompactionEndPayload,
  ImageUrlPayload,
  InlineDataPayload,
  InlineThinkingPayload,
  McpConnectBeginPayload,
  McpConnectEndPayload,
  OmniMessage,
  OmniPayload,
  PartialTextPayload,
  PartialThinkingPayload,
  PartialToolCallOutputPayload,
  PartialToolCallPayload,
  RequestBeginPayload,
  RequestEndPayload,
  SessionMetaPayload,
  SubagentPayload,
  TextPayload,
  ThinkingPayload,
  TokenUsagePayload,
  ToolCallOutputPayload,
  ToolCallPayload,
  ToolListReadyPayload,
} from "@lmliheng/penguin-core";
import type {
  UsageQuery,
  UsageErrorsClearQuery,
  UsageErrorsQuery,
} from "../services/usage-service.js";

/** ErrorLog: the mechanism ErrorsRepo implements. */
@Interface()
export abstract class ErrorLog {
  abstract insert(r: ErrorRecordInsert): void;
  abstract summary(projectId: string, f?: ErrorFilter): ErrorSummary;
  abstract topCode(projectId: string, f?: ErrorFilter): ErrorCodeCount | null;
  abstract recent(
    projectId: string,
    f?: ErrorFilter,
    limit?: number,
    offset?: number,
    utcOffsetMinutes?: number,
  ): ErrorItem[];
  abstract rowCount(projectId: string, f?: ErrorFilter, utcOffsetMinutes?: number): number;
  abstract deleteFiltered(projectId: string, f?: Omit<ErrorFilter, "includeGlobal">): number;
  abstract deleteByAgent(projectId: string, agentId: string): void;
  abstract deleteByProject(projectId: string): void;
}

/** Errors: the mechanism ErrorRecorder implements. */
@Interface()
export abstract class Errors {
  abstract record(args: ErrorRecordArgs): void;
}

/** UsageStore: the mechanism UsageRepo implements. */
@Interface()
export abstract class UsageStore {
  abstract insert(r: UsageRecordInsert): void;
  abstract unsettledRefs(): Array<{ projectId: string; provider: string; modelId: string }>;
  abstract unsettledRows(projectId: string, provider: string, modelId: string): UnsettledUsageRow[];
  abstract settle(rows: ReadonlyArray<{ id: number; cost: number | null }>): void;
  abstract bucketByModel(projectId: string, f?: UsageFilter): UsageModelSums[];
  abstract groupsByModel(
    projectId: string,
    groupBy: UsageGroupBy,
    f?: UsageFilter,
  ): UsageGroupModelSums[];
  abstract seriesByModel(
    projectId: string,
    granularity: UsageSeriesGranularity,
    f?: UsageFilter,
  ): UsageSeriesModelSums[];
  abstract agentSeries(
    projectId: string,
    granularity: UsageSeriesGranularity,
    f?: UsageFilter,
  ): UsageAgentBucketCount[];
  abstract distinctAgentIds(projectId: string): string[];
  abstract distinctModels(projectId: string): { provider: string; modelId: string }[];
  abstract deleteByProject(projectId: string): void;
}

/** UsageRecording: the mechanism UsageRecorder implements. */
@Interface()
export abstract class UsageRecording {
  abstract record(ctx: UsageContext, msg: OmniMessage<OmniPayload>): Promise<void>;
}

/** UsageQueries: the mechanism UsageService implements. */
@Interface()
export abstract class UsageQueries {
  abstract query(projectId: string, q: UsageQuery): Promise<UsageResponse>;
  abstract queryErrors(projectId: string, q: UsageErrorsQuery): UsageErrorsPage;
  abstract clearErrors(projectId: string, q: UsageErrorsClearQuery): number;
  abstract modelTotals(projectId: string): UsageModelTotals;
  /** Fixes the cost of every usage row that has none yet; returns how many it settled. */
  abstract settleUnsettledCosts(): Promise<number>;
  /**
   * The Project's lifetime cost: every usage record it ever wrote, summed from the costs fixed
   * when the rows were written. `unpriced` says some of that usage ran on a model this Project
   * has no price for, so `cost` is a lower bound.
   */
  abstract lifetimeCost(
    projectId: string,
  ): Promise<Opaque<"LifetimeCost", { cost: number | null; unpriced: boolean }>>;
  abstract costBySession(
    projectId: string,
    sessionIds: readonly string[],
    fromTs: string,
    toTs: string,
  ): Promise<Opaque<"CostBySession", { bySession: Map<string, number>; unpriced: boolean }>>;
  abstract dailyCostForSessions(
    projectId: string,
    sessionIds: readonly string[],
    fromTs: string,
    toTs: string,
  ): Promise<Array<{ date: string; cost: number }>>;
}
