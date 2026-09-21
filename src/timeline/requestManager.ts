/**
 * 代际请求管理（竞态防护的核心）。
 *
 * 每次发起视口请求都领取一个单调递增的 reqId（= 代际）。
 * 响应回来时：
 *   - 若不是最新一代，判为 STALE，绝不触碰已上屏图层（调用方负责丢弃）；
 *   - 若是最新一代，调用方在「离屏 buffer 完整画完」之后才原子替换可见图层。
 * 因此缩放切换时，正在加载的数据永远不会把已画好的图层冲掉。
 *
 * 开关 mode：
 *   - 'guarded'：上述保护，旧代响应被丢弃；
 *   - 'naive'：对照模式，故意「谁后返回谁上屏」，复现经典竞态。
 */
import type { ViewportResponse } from '../../shared/timeline';
import { timelineApi } from './api';

export type RaceMode = 'guarded' | 'naive';

export interface RaceLogEntry {
  reqId: number;
  at: number;
  span: number;
  status: 'issued' | 'applied' | 'stale-dropped' | 'aborted' | 'error';
  elapsedMs?: number;
  ts: number;
}

interface Pending {
  reqId: number;
  controller: AbortController;
}

export class ViewportRequestManager {
  private seq = 0;
  private latestReqId = 0;
  private pending: Pending | null = null;
  mode: RaceMode = 'guarded';
  onLog?: (e: RaceLogEntry) => void;

  private log(e: RaceLogEntry) {
    this.onLog?.(e);
  }

  /**
   * 发起新一代请求。上一代在 guarded 模式下被 abort（请求仍可能迟到，
   * 但即使 abort 失败也会被 reqId 检查兜住 —— 双保险）。
   */
  issue(at: number, span: number, delayMs = 0): Promise<ViewportResponse | null> {
    this.seq += 1;
    const reqId = this.seq;

    if (this.pending) {
      if (this.mode === 'guarded') {
        // 保护模式：主动中止上一代；即使中止失败，下面的 reqId 检查仍会兜住
        this.pending.controller.abort();
        this.log({ reqId: this.pending.reqId, at: NaN, span: NaN, status: 'aborted', ts: Date.now() });
      }
      // naive 模式：故意不 abort，让迟到的旧代响应照样回来（经典竞态复现）
    }
    this.latestReqId = reqId;
    const controller = new AbortController();
    this.pending = { reqId, controller };
    this.log({ reqId, at, span, status: 'issued', ts: Date.now() });

    const started = performance.now();
    return timelineApi
      .viewport({ at, span, reqId, delayMs }, controller.signal)
      .then((data) => {
        const elapsedMs = Math.round(performance.now() - started);
        if (this.mode === 'guarded') {
          // 保护路径：只接受最新一代
          if (reqId !== this.latestReqId) {
            this.log({ reqId, at, span, status: 'stale-dropped', elapsedMs, ts: Date.now() });
            return null;
          }
        } else {
          // 对照路径：naive 模式故意不检查代际（「谁后返回谁上屏」）
          this.latestReqId = reqId;
        }
        this.log({ reqId, at, span, status: 'applied', elapsedMs, ts: Date.now() });
        return data;
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') {
          this.log({ reqId, at, span, status: 'aborted', ts: Date.now() });
        } else {
          this.log({ reqId, at, span, status: 'error', ts: Date.now() });
        }
        return null;
      });
  }

  get currentGen(): number {
    return this.latestReqId;
  }

  reset() {
    if (this.pending) this.pending.controller.abort();
    this.pending = null;
    this.seq = 0;
    this.latestReqId = 0;
  }
}
