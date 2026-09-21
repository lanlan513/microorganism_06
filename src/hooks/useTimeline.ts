import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Ma, TimelineMeta, TimelineWindow } from '../../shared/timeline';
import { clampMa, normalizeView } from '../../shared/timeline';
import { createGenerationGate } from '../../shared/race';
import { timelineApi } from '../utils/timelineApi';

// ---------- 数据图层缩放分层（桶）。切换桶才发服务端请求；桶内平移只重投影 ----------

interface Bucket {
  level: number;
  fromMa: Ma;
  toMa: Ma;
  key: string;
}

const MIN = -3500;

export function bucketFor(atMa: Ma, ppm: number): Bucket {
  const x = clampMa(atMa) - MIN; // 距走廊左端的 Ma 数
  if (ppm >= 1) return { level: 0, fromMa: -3500, toMa: 0, key: 'L0' };
  if (ppm >= 0.25) {
    const i = Math.min(3, Math.max(0, Math.floor(x / 875)));
    const from = -3500 + i * 875;
    const to = i === 3 ? 0 : from + 875;
    return { level: 1, fromMa, toMa, key: `L1-${i}` };
  }
  if (ppm >= 0.08) {
    const i = Math.min(9, Math.max(0, Math.floor(x / 350)));
    const from = -3500 + i * 350;
    const to = i === 9 ? 0 : from + 350;
    return { level: 2, fromMa, toMa, key: `L2-${i}` };
  }
  const i = Math.min(34, Math.max(0, Math.floor(x / 100)));
  const from = -3500 + i * 100;
  const to = i === 34 ? 0 : from + 100;
  return { level: 3, fromMa, toMa, key: `L3-${i}` };
}

// ---------- 地址栏即视图真源 ----------

export function useUrlView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { atMa, ppm } = useMemo(
    () => normalizeView(searchParams.get('at'), searchParams.get('ppm')),
    [searchParams],
  );
  const writeTimer = useRef<number | null>(null);

  const setView = useCallback(
    (next: { atMa?: Ma; ppm?: number }, mode: 'push' | 'replace' = 'replace') => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
      writeTimer.current = window.setTimeout(() => {
        const cur = new URLSearchParams(window.location.search);
        const mergedAt = next.atMa !== undefined ? clampMa(next.atMa) : atMa;
        const mergedPpm = next.ppm !== undefined ? next.ppm : ppm;
        cur.set('at', String(Math.round(mergedAt * 10) / 10));
        cur.set('ppm', String(Math.round(mergedPpm * 1000) / 1000));
        setSearchParams(cur, { replace: mode === 'replace' });
      }, mode === 'replace' ? 120 : 0);
    },
    [atMa, ppm, setSearchParams],
  );

  useEffect(() => () => {
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
  }, []);

  return { atMa, ppm, setView };
}

// ---------- 数据层：世代门控（guarded）与裸加载（naive）两种加载器 ----------

export interface CommitLogEntry {
  seq: number;
  gen: number;
  tag: string;
  range: string;
  hash: string;
  count: number;
  action: 'committed' | 'dropped';
  reason: string;
  ts: number;
}

interface FetchArgs {
  fromMa: Ma;
  toMa: Ma;
  delayMs?: number;
  tag?: string;
  /** naive 模式也强制参与门控（无）；这里保留签名清晰 */
  clearBefore?: boolean;
}

export function useTimelineData(mode: 'guarded' | 'naive') {
  const [meta, setMeta] = useState<TimelineMeta | null>(null);
  const [windowData, setWindowData] = useState<TimelineWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<CommitLogEntry[]>([]);
  const gate = useRef(createGenerationGate());
  const seqRef = useRef(0);

  useEffect(() => {
    timelineApi.getMeta().then(setMeta).catch((e) => console.error('meta 加载失败', e));
  }, []);

  const pushLog = useCallback((e: Omit<CommitLogEntry, 'seq' | 'ts'>) => {
    seqRef.current += 1;
    setLog((prev) =>
      [{ ...e, seq: seqRef.current, ts: Date.now() }, ...prev].slice(0, 30),
    );
  }, []);

  /**
   * 发起一笔窗口请求并按当前模式决定提交策略。
   * guarded：abort 在途请求 + 世代门控；不清空旧图层，过期响应丢弃。
   * naive  ：不 abort、不门控；请求发出即清空图层，后到的响应无条件覆盖（竞态对照）。
   */
  const fetchWindow = useCallback(
    async (args: FetchArgs): Promise<'committed' | 'dropped' | 'aborted'> => {
      const gen = gate.current.next();
      const range = `[${args.fromMa}, ${args.toMa}]`;
      const tag = args.tag ?? `g${gen}`;

      if (mode === 'guarded') {
        // 仅用世代令牌：不取消请求（服务端仍会返回），过期响应回来时被门控丢弃。
        // 这样"丢弃旧响应"在日志里可观察，并与 shared/race.ts 的模拟严格一致。
      } else if (args.clearBefore !== false) {
        // naive 的经典写法：切层级先乐观清空 -> 图层被擦掉
        setWindowData(null);
      }
      setLoading(true);

      try {
        const data = await timelineApi.getWindow(args.fromMa, args.toMa, {
          delayMs: args.delayMs,
          tag,
        });
        if (mode === 'guarded' && !gate.current.isCurrent(gen)) {
          pushLog({
            gen, tag, range, hash: data.hash, count: data.count,
            action: 'dropped',
            reason: `世代 ${gen} 已过期（当前 ${gate.current.current()}），旧响应丢弃，已绘图层保留`,
          });
          return 'dropped';
        }
        setWindowData(data);
        pushLog({
          gen, tag, range, hash: data.hash, count: data.count,
          action: 'committed',
          reason:
            mode === 'naive' && gen < gate.current.current()
              ? `⚠ 迟到的世代 ${gen} 覆盖了世代 ${gate.current.current()} 的图层`
              : `世代 ${gen} 提交`,
        });
        return 'committed';
      } catch (err) {
        if ((err as Error).name === 'AbortError') return 'aborted';
        console.error('窗口请求失败', err);
        return 'aborted';
      } finally {
        if (mode === 'guarded' ? gate.current.isCurrent(gen) : true) setLoading(false);
      }
    },
    [mode, pushLog],
  );

  return { meta, windowData, loading, log, fetchWindow, setLog, pushLog };
}
