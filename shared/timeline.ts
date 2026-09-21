// 三十五亿年时间走廊 —— 前后端共享类型与纯几何常量
// 真源原则：本文件只包含"协议类型"与纯投影工具，不含任何事实结论。

export const TIMELINE_MIN_MA = -3500; // 三十五亿年前
export const TIMELINE_MAX_MA = 0;     // 今天
export const RULESET_VERSION = 'cf-rules-v1';

/** 时间单位 Ma（百万年），带符号：0=今天，负值=距今 */
export type Ma = number;

export type SpecimenGroup = 'bacteria' | 'archaea' | 'eukarya' | 'fungi' | 'animal' | 'virus';

export const GROUP_LABELS: Record<SpecimenGroup, string> = {
  bacteria: '细菌',
  archaea: '古菌',
  eukarya: '真核生物',
  fungi: '真菌',
  animal: '动物',
  virus: '病毒',
};

export const GROUP_COLORS: Record<SpecimenGroup, string> = {
  bacteria: '#00ffc8',
  archaea: '#f1c40f',
  eukarya: '#4aa8ff',
  fungi: '#9b59b6',
  animal: '#ff9d5c',
  virus: '#e74c3c',
};

/** 事件类型：氧化事件 / 冰期 / 大灭绝 / 演化里程碑 */
export type EventKind = 'oxygenation' | 'glaciation' | 'extinction' | 'milestone';

export interface GeoEvent {
  id: string;
  label: string;
  kind: EventKind;
  /** 事件点（Ma）；灭绝等持续事件同时给出 untilMa */
  atMa: Ma;
  untilMa?: Ma;
  severity?: number; // 灭绝属种损失估计百分比
  oxygenLevel?: number; // 事件后大气氧含量（现代大气百分比 PAL）
  description: string;
}

/** 年代地层带（宙/代/纪），用于时间轴背景分区 */
export interface EraBand {
  id: string;
  eon: string;
  era: string;
  period?: string;
  fromMa: Ma; // 较老（更小）
  toMa: Ma;   // 较新（更大）
}

/** 氧曲线采样点（服务端真源），value 为占现代大气百分比 PAL */
export interface OxygenPoint {
  ma: Ma;
  pal: number;
}

export interface Specimen {
  id: string;            // 稳定 id，同时决定同年代集合的次序
  name: string;
  scientificName: string;
  group: SpecimenGroup;
  firstMa: Ma;           // 出现（含）
  lastMa: Ma;            // 灭绝（含）；0 = 现生
  lane: number;          // 服务端分配的泳道（区间图着色），前端不得重排
  oxygenNeedPal: number; // 最低需氧（PAL），0 = 厌氧
  habitat: string;
  size: string;
  description: string;
  /** "当时模样"：服务端给出的形态重建，前端直接展示 */
  appearance: {
    form: string;
    color: string;
    silhouette: string; // SVG path（在 0..100 视框内），确定性
    note: string;
  };
  /** 关联事件 id 列表 —— 由服务端关联，前端不得自行计算 */
  relatedEventIds: string[];
}

/** 区间窗口查询载荷：所有结论服务端算好 */
export interface TimelineWindow {
  fromMa: Ma;
  toMa: Ma;
  version: string;
  specimens: Specimen[];
  events: GeoEvent[];
  bands: EraBand[];
  count: number;
  hash: string; // 标本 id 有序集合的 SHA-256（前 12 位）
}

export interface EraSnapshot {
  atMa: Ma;
  band?: EraBand;
  oxygenPal: number;
  specimenIds: string[];
  count: number;
  hash: string;
}

export interface CounterfactualInput {
  id: string;
  shiftMa: number; // 前移量（正整数百万年），如 1000
}

export interface CounterfactualStep {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface CounterfactualResult {
  id: string;
  name: string;
  originalFirstMa: Ma;
  shiftedFirstMa: Ma;
  shiftMa: number;
  version: string;
  outcome: 'survives' | 'blocked';
  headline: string;
  steps: CounterfactualStep[];
}

export interface TimelineMeta {
  minMa: Ma;
  maxMa: Ma;
  version: string;
  events: GeoEvent[];
  oxygen: OxygenPoint[];
  bands: EraBand[];
}

// ---------- 纯投影工具（视图侧，只做几何，不产生事实） ----------

/** Ma -> 像素：越古老（值越小）越靠左 */
export function maToX(ma: Ma, ppm: number, atMa: Ma, width: number): number {
  return width / 2 + (ma - atMa) / ppm;
}

/** 像素 -> Ma */
export function xToMa(x: number, ppm: number, atMa: Ma, width: number): Ma {
  return atMa + (x - width / 2) * ppm;
}

export function clampMa(ma: Ma): Ma {
  return Math.min(TIMELINE_MAX_MA, Math.max(TIMELINE_MIN_MA, ma));
}

/** 规范化地址栏坐标，防止坏链接触发服务端非法查询 */
export function normalizeView(rawAt: string | null, rawPpm: string | null): { atMa: Ma; ppm: number } {
  const at = rawAt === null ? NaN : Number(rawAt);
  const ppm = rawPpm === null ? NaN : Number(rawPpm);
  return {
    atMa: Number.isFinite(at) ? clampMa(at) : -2400,
    ppm: Number.isFinite(ppm) && ppm > 0 ? Math.min(20, Math.max(0.05, ppm)) : 0.5,
  };
}
