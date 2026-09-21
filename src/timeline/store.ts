/**
 * 时间走廊状态层。
 *
 * 真源边界再强调一次：
 * - URL 参数 at/span 是「视图位置」的唯一外部真源（可分享、可回放）；
 * - store 里的 specimens/events/oxygen/checksum 全部来自服务端响应，
 *   前端代码里不存在任何对这些数据的二次推导；
 * - 交互拖动中的临时 at 放在组件 ref（瞬时态），落定后才提交进 URL/store。
 */
import { create } from 'zustand';
import type {
  Specimen,
  TimelineEvent,
  Viewport,
} from '../../shared/timeline';
import type { TimelineManifest } from './api';
import { ViewportRequestManager, type RaceLogEntry, type RaceMode } from './requestManager';

export const DEFAULT_AT = -1750;
export const DEFAULT_SPAN = 1000;

interface TimelineState {
  /** 已提交、已与 URL 同步的视图请求参数 */
  view: { at: number; span: number };
  /** 服务端夹紧后的权威视口 + 数据 */
  viewport: (Viewport & {
    reqId?: number;
    specimens: Specimen[];
    events: TimelineEvent[];
    oxygen: { t: number; pal: number }[];
    count: number;
    checksum: string;
    dataVersion: string;
  }) | null;
  loading: boolean;
  manifest: TimelineManifest | null;
  manifestError: string | null;
  raceMode: RaceMode;
  delayMs: number;
  raceLog: RaceLogEntry[];
  appliedGen: number;
  setManifest: (m: TimelineManifest) => void;
  setManifestError: (e: string) => void;
  setRaceMode: (m: RaceMode) => void;
  setDelayMs: (ms: number) => void;
  pushRaceLog: (e: RaceLogEntry) => void;
  clearRaceLog: () => void;
  commitView: (at: number, span: number) => void;
  setLoading: (b: boolean) => void;
  applyResponse: (vp: NonNullable<TimelineState['viewport']>) => void;
  bindManager: (rm: ViewportRequestManager) => void;
}

const MAX_LOG = 60;

export const useTimelineStore = create<TimelineState>((set) => ({
  view: { at: DEFAULT_AT, span: DEFAULT_SPAN },
  viewport: null,
  loading: false,
  manifest: null,
  manifestError: null,
  raceMode: 'guarded',
  delayMs: 0,
  raceLog: [],
  appliedGen: 0,

  setManifest: (manifest) => set({ manifest }),
  setManifestError: (manifestError) => set({ manifestError }),
  setRaceMode: (raceMode) => set({ raceMode }),
  setDelayMs: (delayMs) => set({ delayMs }),
  pushRaceLog: (e) =>
    set((s) => ({ raceLog: [...s.raceLog.slice(-(MAX_LOG - 1)), e] })),
  clearRaceLog: () => set({ raceLog: [] }),

  commitView: (at, span) => set({ view: { at, span } }),
  setLoading: (loading) => set({ loading }),
  applyResponse: (vp) =>
    set({
      viewport: vp,
      loading: false,
      appliedGen: vp.reqId ?? 0,
      view: { at: vp.at, span: vp.span },
    }),
  bindManager: () => undefined,
}));

/* ---------------- URL 同步（视图状态可分享） ---------------- */

export function parseViewFromUrl(url: URL): { at: number; span: number } {
  const at = Number(url.searchParams.get('at'));
  const span = Number(url.searchParams.get('span'));
  return {
    at: Number.isFinite(at) ? at : DEFAULT_AT,
    span: Number.isFinite(span) ? span : DEFAULT_SPAN,
  };
}

/** 只动 query string，不产生历史栈噪音；同值不重复写 */
let lastWritten = '';
export function writeViewToUrl(at: number, span: number) {
  const usp = new URLSearchParams(window.location.search);
  usp.set('at', String(Math.round(at * 1000) / 1000));
  usp.set('span', String(Math.round(span * 1000) / 1000));
  const qs = usp.toString();
  if (qs === lastWritten) return;
  lastWritten = qs;
  window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
}
