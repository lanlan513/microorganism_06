/**
 * 时间走廊共享类型（服务端 / 前端共用）
 *
 * 时间约定：t 单位为「百万年前 Ma」，负数表示过去，范围 [-3500, 0]，0 = 今天。
 * 例：-2400 = 24 亿年前（大氧化事件附近）。
 */

export const TIMELINE_DATA_VERSION = 'timeline-v1';
export const COUNTERFACTUAL_RULES_VERSION = 'cf-rules-v1';

/** 轴的物理边界，只有服务端有权放宽；前端不得自行外推 */
export const AXIS_MIN_T = -3500;
export const AXIS_MAX_T = 0;

export type TimelineCategory =
  | 'bacteria' // 细菌
  | 'archaea' // 古菌
  | 'cyanobacteria' // 蓝细菌（产氧）
  | 'eukarya' // 真核微生物 / 藻类
  | 'fungi' // 真菌
  | 'stromatolite' // 叠层石 / 微生物席
  | 'virus'; // 病毒

export const TIMELINE_CATEGORY_LABELS: Record<TimelineCategory, string> = {
  bacteria: '细菌',
  archaea: '古菌',
  cyanobacteria: '蓝细菌',
  eukarya: '真核微生物',
  fungi: '真菌',
  stromatolite: '叠层石',
  virus: '病毒',
};

export const TIMELINE_CATEGORY_COLORS: Record<TimelineCategory, string> = {
  bacteria: '#34d399',
  archaea: '#f59e0b',
  cyanobacteria: '#22d3ee',
  eukarya: '#c084fc',
  fungi: '#a78bfa',
  stromatolite: '#94a3b8',
  virus: '#f87171',
};

/** 标本（化石记录 / 复原单元）。区间 [firstAppearT, lastAppearT] 含端点 */
export interface Specimen {
  id: number;
  code: string; // 稳定编号，如 SP-0037
  taxonName: string; // 中文名
  scientificName: string;
  category: TimelineCategory;
  firstAppearT: number; // Ma（负）
  lastAppearT: number; // Ma（负）
  formation: string; // 产出地层/地点
  habitat: string;
  metabolism: string;
  oxygenic: boolean; // 是否进行产氧光合作用
  anaerobic: boolean; // 是否厌氧
  oxygenRequirementPal: number; // 建立种群所需的最低氧气（现代大气分压比例 PAL）
  description: string;
  portrait: PortraitSpec;
  relatedEventIds: string[]; // 关联由服务端计算，前端不得自造
  /** 病毒专用：宿主分类（服务端反事实规则使用） */
  hostCategory?: TimelineCategory;
}

/**
 * 「当时的模样」：服务端按确定性规则生成的形态描述符，
 * 前端只负责把描述符画成 SVG（描述符是数据，画图是视图）
 */
export interface PortraitSpec {
  seed: number;
  shape: 'rod' | 'coccus' | 'spiral' | 'filament' | 'colony' | 'spheromorph';
  color: string;
  sizeUm: number;
  membrane: 'single' | 'double' | 'organic-wall' | 'envelope';
  features: string[];
}

export type TimelineEventType =
  | 'first-life'
  | 'oxygen' // 大氧化事件
  | 'glaciation' // 冰期 / 雪球地球
  | 'evolution' // 演化里程碑
  | 'extinction' // 大灭绝
  | 'present';

export interface TimelineEvent {
  id: string;
  t: number; // Ma（负）
  tEnd?: number; // 持续型事件的结束时刻（如冰期）
  type: TimelineEventType;
  title: string;
  titleEn?: string;
  description: string;
  severity?: number; // 灭绝强度 1-5（仅 extinction）
}

export interface ViewportRequest {
  at: number;
  span: number; // 窗口宽度（Ma）
  reqId?: number; // 由前端代际令牌填入，服务端原样回显
  delayMs?: number; // 人为延迟，仅用于竞态对照复现
}

export interface Viewport {
  /** 服务端夹紧后的真实窗口 —— 前端以此为准，不许自己改 */
  from: number;
  to: number;
  at: number;
  span: number;
  level: number;
}

export interface ViewportResponse extends Viewport {
  dataVersion: string;
  reqId?: number;
  count: number;
  specimens: Specimen[];
  events: TimelineEvent[];
  oxygen: { t: number; pal: number }[]; // 覆盖窗口（含外扩插值点）
  /** 确定性校验和：同窗口永远一致，可直接断言 */
  checksum: string;
}

export interface CounterfactualRequest {
  specimenId: number;
  /** 提前量（Ma），默认 1000，即「早出现十亿年」 */
  earlierByMa?: number;
}

export interface CounterfactualGate {
  rule: string;
  passed: boolean;
  title: string;
  detail: string;
}

export interface CounterfactualResult {
  rulesVersion: string;
  specimenId: number;
  taxonName: string;
  originalFirstT: number;
  shiftMa: number;
  hypotheticalFirstT: number;
  oxygenAtArrivalPal: number;
  outcome: 'bloom' | 'marginal' | 'extinct' | 'impossible';
  outcomeText: string;
  /** 被改写的关键事件（新时刻，未列出的表示不变） */
  shiftedEvents: { eventId: string; title: string; fromT: number; toT: number }[];
  gates: CounterfactualGate[];
  narrative: string[];
}
