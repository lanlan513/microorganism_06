// 时间走廊服务层：所有"事实结论"都在这里产生。
// 职责：中心区间树索引 / 区间查询 / 泳道着色 / 事件关联 / 氧曲线插值 /
//       形态剪影 / 确定性哈希 / R0–R5 反事实规则引擎
import { createHash } from 'node:crypto';
import {
  bands,
  DATASET_VERSION,
  events,
  oxygenCurve,
  rawSpecimens,
  type RawSpecimen,
} from '../data/timelineData.js';
import type {
  CounterfactualResult,
  EraBand,
  EraSnapshot,
  GeoEvent,
  Ma,
  OxygenPoint,
  Specimen,
  TimelineMeta,
  TimelineWindow,
} from '../../../shared/timeline.js';
import { RULESET_VERSION, TIMELINE_MAX_MA, TIMELINE_MIN_MA } from '../../../shared/timeline.js';

// ---------- 确定性形态剪影（SVG path，视框 0 0 100 100；按组给候选，按 id 哈希取一） ----------

const SILHOUETTES: Record<Specimen['group'], string[]> = {
  bacteria: [
    'M22 42 h44 a8 8 0 0 1 8 8 v0 a8 8 0 0 1 -8 8 h-44 a8 8 0 0 1 -8 -8 v0 a8 8 0 0 1 8 -8 z M14 50 h-8 M78 50 h8 M70 44 l8 -6 M70 56 l8 6',
    'M30 36 a14 14 0 1 0 0.1 0 M56 36 a14 14 0 1 0 0.1 0 M43 58 a14 14 0 1 0 0.1 0',
    'M50 20 q10 15 0 30 q-10 15 0 30 M38 28 q8 12 0 24 M62 28 q-8 12 0 24',
  ],
  archaea: [
    'M50 24 a26 26 0 1 0 0.1 0 M34 30 l-6 -8 M66 30 l6 -8 M50 76 v8 M28 58 l-8 4 M72 58 l8 4',
    'M26 40 h40 a10 10 0 0 1 10 10 v0 a10 10 0 0 1 -10 10 h-40 a10 10 0 0 1 -10 -10 v0 a10 10 0 0 1 10 -10 z M18 50 h-8 M74 50 h8',
  ],
  eukarya: [
    'M50 28 a22 22 0 1 0 0.1 0 M50 6 v10 M50 84 v10 M6 50 h10 M84 50 h10 M20 20 l-7 -7 M80 20 l7 -7 M20 80 l-7 7 M80 80 l7 7',
    'M50 80 C50 80 30 60 30 40 C30 26 40 18 50 18 C60 18 70 26 70 40 C70 60 50 80 50 80 Z M44 30 q6 8 12 0 M40 70 q10 6 20 0',
    'M50 78 V40 M30 44 l20 -14 20 14 M24 58 l26 -18 26 18 M20 72 l30 -22 30 22',
    'M50 50 h-26 a6 6 0 0 0 0 12 h26 a6 6 0 0 0 0 -12 z M50 50 h26 a6 6 0 0 1 0 12 h-26 a6 6 0 0 1 0 -12 z M40 40 v-8 M60 40 v-8',
  ],
  fungi: [
    'M28 46 a22 18 0 0 1 44 0 z M44 46 h12 v30 a4 4 0 0 1 -4 4 h-4 a4 4 0 0 1 -4 -4 z M36 40 q4 -6 8 0 M52 40 q4 -6 8 0',
    'M50 50 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M62 42 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M62 58 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M30 20 q6 18 -6 30 q18 0 26 14',
  ],
  animal: [
    'M20 62 C20 44 38 30 50 30 C62 30 80 44 80 62 C68 56 58 58 50 64 C42 58 32 56 20 62 Z M50 30 l-2 -12 M50 30 l8 -10',
    'M30 44 h40 a16 16 0 0 1 0 32 h-6 l-4 8 -6 -8 h-10 l-6 8 -4 -8 h-4 a16 16 0 0 1 0 -32 z M26 44 l-8 -8 M74 44 l8 -8',
    'M44 74 V40 C44 28 56 28 56 40 V74 M30 74 q13 -10 26 0 q13 -10 26 0 M28 82 h54',
    'M36 70 l-14 -18 a4 4 0 0 1 6 -5 l12 12 V30 a6 6 0 0 1 12 0 v29 l12 -12 a4 4 0 0 1 6 5 l-14 18 z',
  ],
  virus: [
    'M50 32 a18 18 0 1 0 0.1 0 M50 14 v10 M50 76 v10 M14 50 h10 M76 50 h10 M24 24 l8 8 M68 68 l8 8 M76 24 l-8 8 M32 68 l-8 8',
    'M50 30 a20 20 0 1 0 0.1 0 M38 38 a4 4 0 1 0 0.1 0 M60 40 a4 4 0 1 0 0.1 0 M44 58 a4 4 0 1 0 0.1 0 M58 60 a4 4 0 1 0 0.1 0',
  ],
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- 区间图着色：给标本分配泳道，保证重叠标本不同道（确定性贪心） ----------

function assignLanes(items: { id: string; firstMa: number; lastMa: number }[]): Map<string, number> {
  const ordered = [...items].sort((a, b) => a.firstMa - b.firstMa || (a.id < b.id ? -1 : 1));
  const lanes = new Map<string, number>();
  // laneEnd[lane] = 当前该泳道最后一个标本的 lastMa
  const laneEnd: number[] = [];
  for (const it of ordered) {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] >= it.firstMa) lane++; // 含端点：相接也错开
    if (lane === laneEnd.length) laneEnd.push(it.lastMa);
    else laneEnd[lane] = it.lastMa;
    lanes.set(it.id, lane);
  }
  return lanes;
}

// ---------- 事件关联（服务端规则，前端禁止重算） ----------

function linkEvents(s: RawSpecimen): string[] {
  const aliveAt = (t: Ma) => s.firstMa <= t && t <= s.lastMa;
  const ids: string[] = [];
  for (const e of events) {
    if (e.kind === 'oxygenation' && aliveAt(e.atMa)) ids.push(e.id);
    else if (e.kind === 'glaciation' && e.untilMa !== undefined) {
      const mid = (e.atMa + e.untilMa) / 2;
      // 冰期只关联真正在冰期中点存活的厌氧/广适谱系（需氧 <= 2 PAL）
      if (aliveAt(mid) && s.oxygenNeedPal <= 2) ids.push(e.id);
    } else if (e.kind === 'extinction') {
      if (aliveAt(e.atMa)) ids.push(e.id); // 灭绝边界上仍存续 = 亲历者
    } else if (e.kind === 'milestone') {
      // 里程碑关联其后 30 Ma 内首次出现的类群（辐射响应）
      const dt = s.firstMa - e.atMa;
      if (dt >= 0 && dt <= 30) ids.push(e.id);
    }
  }
  return ids.sort();
}

// ---------- 构建真源标本全集（只在启动时做一次） ----------

const lanes = assignLanes(rawSpecimens);

export const specimens: Specimen[] = rawSpecimens
  .map((s) => {
    const variants = SILHOUETTES[s.group];
    return {
      ...s,
      lane: lanes.get(s.id)!,
      appearance: {
        ...s.appearance,
        silhouette: variants[hashString(s.id) % variants.length],
      },
      relatedEventIds: linkEvents(s),
    };
  })
  .sort((a, b) => a.firstMa - b.firstMa || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const byId = new Map(specimens.map((s) => [s.id, s]));

// ---------- 中心区间树（服务端索引） ----------

interface IntervalNode {
  center: number;
  /** 中心相交区间，按起点升序 */
  starts: Specimen[];
  /** 同批，按终点降序 */
  ends: Specimen[];
  left: IntervalNode | null;
  right: IntervalNode | null;
}

function buildIntervalTree(items: Specimen[]): IntervalNode | null {
  if (items.length === 0) return null;
  const midpoint = (Math.min(...items.map((i) => i.firstMa)) + Math.max(...items.map((i) => i.lastMa))) / 2;
  const left: Specimen[] = [];
  const right: Specimen[] = [];
  const overlapping: Specimen[] = [];
  for (const it of items) {
    if (it.lastMa < midpoint) left.push(it);
    else if (it.firstMa > midpoint) right.push(it);
    else overlapping.push(it);
  }
  overlapping.sort((a, b) => a.firstMa - b.firstMa || (a.id < b.id ? -1 : 1));
  return {
    center: midpoint,
    starts: overlapping,
    ends: [...overlapping].sort((a, b) => b.lastMa - a.lastMa || (a.id < b.id ? -1 : 1)),
    left: buildIntervalTree(left),
    right: buildIntervalTree(right),
  };
}

const intervalTree = buildIntervalTree(specimens);

function queryTree(node: IntervalNode | null, from: Ma, to: Ma, out: Specimen[]): void {
  if (!node) return;
  if (to < node.center) {
    for (const s of node.starts) {
      if (s.firstMa > to) break;
      if (s.lastMa >= from) out.push(s);
    }
    queryTree(node.left, from, to, out);
  } else if (from > node.center) {
    for (const s of node.ends) {
      if (s.lastMa < from) break;
      if (s.firstMa <= to) out.push(s);
    }
    queryTree(node.right, from, to, out);
  } else {
    for (const s of node.starts) {
      if (s.firstMa > to) break;
      out.push(s);
    }
    queryTree(node.left, from, to, out);
    queryTree(node.right, from, to, out);
  }
}

function treeStats(node: IntervalNode | null): { nodes: number; depth: number; leaves: number } {
  if (!node) return { nodes: 0, depth: 0, leaves: 0 };
  const l = treeStats(node.left);
  const r = treeStats(node.right);
  const isLeaf = !node.left && !node.right;
  return {
    nodes: 1 + l.nodes + r.nodes,
    depth: 1 + Math.max(l.depth, r.depth),
    leaves: (isLeaf ? 1 : 0) + l.leaves + r.leaves,
  };
}

// ---------- 氧曲线插值（分段线性，端点外钳制） ----------

export function oxygenAt(ma: Ma): number {
  const pts = oxygenCurve;
  if (ma <= pts[0].ma) return pts[0].pal;
  if (ma >= pts[pts.length - 1].ma) return pts[pts.length - 1].pal;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].ma <= ma) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const t = (ma - a.ma) / (b.ma - a.ma);
  return a.pal + (b.pal - a.pal) * t;
}

// ---------- 确定性哈希 ----------

function hashIds(ids: string[]): string {
  return createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 12);
}

// ---------- 对外查询 ----------

export function getMeta(): TimelineMeta {
  return {
    minMa: TIMELINE_MIN_MA,
    maxMa: TIMELINE_MAX_MA,
    version: DATASET_VERSION,
    events,
    oxygen: oxygenCurve,
    bands,
  };
}

export function getWindow(fromMa: Ma, toMa: Ma): TimelineWindow {
  const collected: Specimen[] = [];
  queryTree(intervalTree, fromMa, toMa, collected);
  const hit = new Map<string, Specimen>();
  collected.forEach((s) => hit.set(s.id, s));
  const found = [...hit.values()].sort((a, b) => a.firstMa - b.firstMa || (a.id < b.id ? -1 : 1));
  const ev = events
    .filter((e) => {
      const end = e.untilMa ?? e.atMa;
      return end >= fromMa && e.atMa <= toMa;
    })
    .sort((a, b) => a.atMa - b.atMa || a.id.localeCompare(b.id));
  const bs = bands
    .filter((b) => b.toMa >= fromMa && b.fromMa <= toMa)
    .sort((a, b) => a.fromMa - b.fromMa);
  const ids = found.map((s) => s.id);
  return {
    fromMa,
    toMa,
    version: DATASET_VERSION,
    specimens: found,
    events: ev,
    bands: bs,
    count: found.length,
    hash: hashIds(ids),
  };
}

function bandAt(ma: Ma): EraBand | undefined {
  return bands.find((b) => b.fromMa <= ma && ma <= b.toMa);
}

export function getEra(atMa: Ma): EraSnapshot {
  const found = specimens
    .filter((s) => s.firstMa <= atMa && atMa <= s.lastMa)
    .sort((a, b) => a.firstMa - b.firstMa || (a.id < b.id ? -1 : 1));
  const ids = found.map((s) => s.id);
  return {
    atMa,
    band: bandAt(atMa),
    oxygenPal: oxygenAt(atMa),
    specimenIds: ids,
    count: found.length,
    hash: hashIds(ids),
  };
}

export function getSpecimen(id: string): Specimen | undefined {
  return byId.get(id);
}

export function getIndexStats() {
  return {
    version: DATASET_VERSION,
    specimenCount: specimens.length,
    eventCount: events.length,
    bandCount: bands.length,
    oxygenPointCount: oxygenCurve.length,
    tree: treeStats(intervalTree),
  };
}

// ---------- R0–R5 确定性反事实规则引擎 ----------

const SHIFT_WINDOW_EXTINCTION_MA = 50; // R4：距任一灭绝边界不足 50 Ma 则立足不稳

export function evaluateCounterfactual(id: string, shiftMa: number): CounterfactualResult | { error: string } {
  const s = byId.get(id);
  if (!s) return { error: '标本不存在' };
  if (!Number.isInteger(shiftMa) || shiftMa <= 0) return { error: '前移量必须是正整数（Ma）' };
  if (shiftMa > 3500) return { error: '前移量超出走廊范围' };

  const shiftedFirstMa = s.firstMa - shiftMa;
  const shiftedOxygen = oxygenAt(shiftedFirstMa);

  const steps: CounterfactualResult['steps'] = [];

  // R0 边界
  const r0 = shiftedFirstMa >= TIMELINE_MIN_MA;
  steps.push({
    rule: 'R0',
    passed: r0,
    detail: r0
      ? `新首现时间 ${shiftedFirstMa} Ma 在走廊起点 ${TIMELINE_MIN_MA} Ma 之内。`
      : `新首现时间 ${shiftedFirstMa} Ma 早于地球生命的已知起点 ${TIMELINE_MIN_MA} Ma，没有可落脚的舞台。`,
  });

  // R1 氧气门槛（按氧曲线分段线性插值）
  const r1 = shiftedOxygen + 1e-9 >= s.oxygenNeedPal;
  steps.push({
    rule: 'R1',
    passed: r1,
    detail: r1
      ? `${shiftedFirstMa} Ma 时大气氧约 ${shiftedOxygen.toFixed(3)}% PAL，满足本种最低需求 ${s.oxygenNeedPal}% PAL。`
      : `${shiftedFirstMa} Ma 时大气氧仅 ${shiftedOxygen.toFixed(4)}% PAL，低于本种最低需求 ${s.oxygenNeedPal}% PAL，产能不足以维持其体型与代谢。`,
  });

  // R2 前置类群必须已存在
  const missing = s.prerequisiteIds
    .map((pid) => byId.get(pid)!)
    .filter((p) => p.firstMa > shiftedFirstMa);
  const r2 = missing.length === 0;
  steps.push({
    rule: 'R2',
    passed: r2,
    detail:
      s.prerequisiteIds.length === 0
        ? '本种无前置类群依赖（位于生命树基部）。'
        : r2
          ? `前置类群（${s.prerequisiteIds.map((p) => byId.get(p)!.name).join('、')}）在 ${shiftedFirstMa} Ma 之前均已出现。`
          : `它依赖的 ${missing.map((p) => `${p.name}（首现 ${p.firstMa} Ma）`).join('、')} 尚未登场，生态与遗传前提不存在。`,
  });

  // R3 冰期覆盖
  const coveringGlaciation = events.find(
    (e) => e.kind === 'glaciation' && e.untilMa !== undefined && shiftedFirstMa >= e.atMa && shiftedFirstMa <= e.untilMa
  );
  const r3 = !coveringGlaciation;
  steps.push({
    rule: 'R3',
    passed: r3,
    detail: r3
      ? `${shiftedFirstMa} Ma 不落在任何全球冰期窗口内。`
      : `首现点正落在「${coveringGlaciation!.label}」（${coveringGlaciation!.atMa}–${coveringGlaciation!.untilMa} Ma）的冰封期，浅海透光带被冰盖封闭。`,
  });

  // R4 灭绝邻近
  const nearExtinction = events
    .filter((e) => e.kind === 'extinction')
    .map((e) => ({ e, d: Math.abs(e.atMa - shiftedFirstMa) }))
    .filter((x) => x.d <= SHIFT_WINDOW_EXTINCTION_MA)
    .sort((a, b) => a.d - b.d)[0];
  const r4 = !nearExtinction;
  steps.push({
    rule: 'R4',
    passed: r4,
    detail: r4
      ? `前后 ${SHIFT_WINDOW_EXTINCTION_MA} Ma 内没有大灭绝边界，新生种群有足够的稳定窗口立足。`
      : `距「${nearExtinction.e.label}」（${nearExtinction.e.atMa} Ma）仅 ${nearExtinction.d.toFixed(1)} Ma，新种群来不及在崩溃前建立足够规模。`,
  });

  // R5 综合
  const blocked = steps.slice(0, 5).some((st) => !st.passed);
  const firstFail = steps.find((st) => !st.passed);
  steps.push({
    rule: 'R5',
    passed: !blocked,
    detail: blocked
      ? `按 R0→R4 顺序，首个阻断项为 ${firstFail!.rule}；反事实不成立。`
      : '全部物理—化学—生态约束通过：在该反事实世界中它可以存活，但其后裔将面对一条完全不同的演化路径。',
  });

  return {
    id: s.id,
    name: s.name,
    originalFirstMa: s.firstMa,
    shiftedFirstMa,
    shiftMa,
    version: RULESET_VERSION,
    outcome: blocked ? 'blocked' : 'survives',
    headline: blocked
      ? `「${s.name}」若早出现 ${shiftMa} 百万年，将止步于 ${firstFail!.rule}：它活不过 ${shiftedFirstMa} Ma 的世界。`
      : `「${s.name}」若早出现 ${shiftMa} 百万年，在 ${shiftedFirstMa} Ma 的世界里可以存活——但之后的历史将全盘重写。`,
    steps,
  };
}

export const oxygenPoints: OxygenPoint[] = oxygenCurve;
