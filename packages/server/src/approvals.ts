// 审批的等待与裁决（契约 §5）。
//
// 运行时的 `requestApproval` 返回一个 Promise，挂起等这里被裁决。裁决只有三个
// 来路：HTTP 决定、审批超时、本轮结束（取消/断开）。三路都必须把 actionId 从表
// 里清掉 —— 留着它，一个早已过去的决定会被当成有效裁决（重复决定必须是
// 409 stale_approval，而不是再改一次结论）。
import type { ApprovalDecision, PendingAction } from 'adelie-core';

interface PendingApproval {
  settle: (decision: ApprovalDecision) => void;
}

export class ApprovalHub {
  private readonly pending = new Map<string, PendingApproval>();

  get size(): number {
    return this.pending.size;
  }

  /**
   * 登记一次待审批并挂起。
   *
   * 超时按**拒绝**处理，与运行时一致（`approvalTimeoutMs`，默认 5 分钟）。定时器
   * 挂在自己这一侧是为了清掉 actionId：运行时超时后会继续往下跑，而它的
   * `requestApproval` 回调 Promise 不会被 settle —— 不清这一条，那个 actionId
   * 会一直躺在表里，后来的一纸决定就能悄悄改掉一个已经结束的审批。
   */
  request(action: PendingAction): Promise<ApprovalDecision> {
    return new Promise<ApprovalDecision>((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const settle = (decision: ApprovalDecision): void => {
        if (timer !== undefined) clearTimeout(timer);
        resolve(decision);
      };

      this.pending.set(action.id, { settle });

      const delay = Math.max(0, action.expiresAt - Date.now());
      timer = setTimeout(() => {
        // 只有仍挂在表里才算「超时」：已被裁决的那条由 decide() 删掉了
        if (this.pending.delete(action.id)) settle('reject');
      }, delay);
      // 定时器不参与事件循环保活：不然一个挂起的审批会把进程钉住到超时
      timer.unref();
    });
  }

  /** 裁决一条待审批。false 表示 actionId 不存在（已超时 / 已决定 / 不是本轮） */
  decide(actionId: string, decision: ApprovalDecision): boolean {
    const entry = this.pending.get(actionId);
    if (entry === undefined) return false;

    this.pending.delete(actionId);
    entry.settle(decision);
    return true;
  }

  /** 本轮结束时把还挂着的全部按拒绝收掉，避免调用方永远等下去 */
  settleAll(decision: ApprovalDecision): void {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) entry.settle(decision);
  }
}
