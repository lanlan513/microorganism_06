/**
 * 时间走廊服务层：视口、氧曲线、标本/事件、反事实推演。
 *
 * 所有结论性计算都在这一层（服务端），前端只接收成品。
 */
import {
  AXIS_MIN_T,
  TIMELINE_DATA_VERSION,
  COUNTERFACTUAL_RULES_VERSION,
  type CounterfactualRequest,
  type CounterfactualResult,
  type Specimen,
  type ViewportResponse,
} from '../../../shared/timeline.js';
import {
  specimensInRange,
  specimenById,
  allSpecimens,
  eventsInRange,
  allEvents,
} from './db.js';
import { OXYGEN_NODES, oxygenAt } from './data/events.js';
import { categoryFirstAppearance } from './data/generator.js';
import { fnv1aHex, stableJson } from './checksum.js';

const AXIS_SPAN = 3500; // |AXIS_MIN_T| - AXIS_MAX_T

export const SPAN_LIMITS = { min: 10, max: AXIS_SPAN };

/** 缩放层级由窗口宽度唯一决定（服务端权威，前端只展示 level 徽章） */
const LEVELS: { maxSpan: number; label: string }[] = [
  { maxSpan: 25, label: 'L0 十万年' },
  { maxSpan: 100, label: 'L1 百万年' },
  { maxSpan: 400, label: 'L2 千万年' },
  { maxSpan: 1500, label: 'L3 数亿年' },
  { maxSpan: 3500, label: 'L4 全史' },
];

export function levelOf(span: number): number {
  const i = LEVELS.findIndex((l) => span <= l.maxSpan);
  return i === -1 ? LEVELS.length - 1 : i;
}

export const levelLabels = LEVELS.map((l) => l.label);

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** 视口夹紧：这是「服务端才有权决定真实窗口」的唯一入口 */
export function clampViewport(at: number, span: number): { from: number; to: number; at: number; span: number; level: number } {
  const s = clampNum(span, SPAN_LIMITS.min, SPAN_LIMITS.max, 1000);
  // at 按「窗口不能越界」夹紧，而不是简单截到 [-3500,0]
  const half = s / 2;
  const a = clampNum(at, AXIS_MIN_T + half, -half, AXIS_MIN_T + half);
  return {
    from: round3(a - half),
    to: round3(a + half),
    at: round3(a),
    span: s,
    level: levelOf(s),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 窗口数据。overscan 只用于氧曲线端点连续，标本/事件严格按窗口返回。
 */
export function getViewport(rawAt: number, rawSpan: number, reqId?: number): ViewportResponse {
  const vp = clampViewport(rawAt, rawSpan);

  const specimens = specimensInRange(vp.from, vp.to);
  const events = eventsInRange(vp.from, vp.to);
  const oxygen = oxygenSeries(vp.from, vp.to);

  const checksum = fnv1aHex(
    TIMELINE_DATA_VERSION +
      '|' +
      stableJson({ from: vp.from, to: vp.to, specimens: specimens.map(signatureOf), events: events.map((e) => e.id) })
  );

  return {
    dataVersion: TIMELINE_DATA_VERSION,
    ...vp,
    reqId,
    count: specimens.length,
    specimens,
    events,
    oxygen,
    checksum,
  };
}

function signatureOf(s: Specimen) {
  return `${s.code}@${s.firstAppearT}..${s.lastAppearT}`;
}

/** 氧曲线：保留落入窗口的全部节点，并保证两端各有一个锚点（插值），折线不断 */
export function oxygenSeries(from: number, to: number): { t: number; pal: number }[] {
  const pts = OXYGEN_NODES.filter((n) => n.t >= from && n.t <= to).map((n) => ({
    t: n.t,
    pal: n.pal,
  }));
  const first = OXYGEN_NODES[0];
  const last = OXYGEN_NODES[OXYGEN_NODES.length - 1];
  if (from >= first.t && (pts.length === 0 || pts[0].t !== from)) {
    pts.unshift({ t: round3(from), pal: oxygenAt(from) });
  }
  if (to <= last.t && (pts.length === 0 || pts[pts.length - 1].t !== to)) {
    pts.push({ t: round3(to), pal: oxygenAt(to) });
  }
  return pts;
}

/** 全量清单（manifest）：事件、氧节点、层级、统计与全集合 checksum */
export function getManifest() {
  const specimens = allSpecimens();
  const countByCategory: Record<string, number> = {};
  for (const s of specimens) countByCategory[s.category] = (countByCategory[s.category] ?? 0) + 1;
  return {
    dataVersion: TIMELINE_DATA_VERSION,
    axis: { min: AXIS_MIN_T, max: 0, spanLimits: SPAN_LIMITS },
    levels: levelLabels,
    events: allEvents(),
    oxygenNodes: OXYGEN_NODES,
    countByCategory,
    totalSpecimens: specimens.length,
    checksum: fnv1aHex(TIMELINE_DATA_VERSION + '|' + specimens.map((s) => s.code).join(',')),
  };
}

/* ================= 反事实推演（确定性规则引擎） ================= */

export function formatMa(t: number): string {
  const ma = Math.round(Math.abs(t) * 10) / 10;
  return `${ma} 百万年前`;
}

function formatPal(pal: number): string {
  if (pal >= 0.01) return `${Math.round(pal * 1000) / 10}% PAL`;
  return `${pal.toExponential(1)} PAL（约 ${(pal * 21).toExponential(1)}% 氧含量）`;
}

export function counterfactual(req: CounterfactualRequest): CounterfactualResult | { error: string; status: number } {
  const specimen = specimenById(req.specimenId);
  if (!specimen) return { error: '标本不存在', status: 404 };

  const shift = clampNum(req.earlierByMa ?? 1000, 1, AXIS_SPAN, 1000);
  const originalFirst = specimen.firstAppearT;
  const hypotheticalFirst = round3(originalFirst - shift);
  const oxygenAtArrival = oxygenAt(hypotheticalFirst);

  const gates: CounterfactualResult['gates'] = [];

  // G1 时间边界门：不允许早于 35 亿年前
  const g1Pass = hypotheticalFirst >= AXIS_MIN_T;
  gates.push({
    rule: 'G1-axis-boundary',
    passed: g1Pass,
    title: '时间边界',
    detail: g1Pass
      ? `提前到 ${formatMa(hypotheticalFirst)}，仍在 35 亿年轴内。`
      : `${formatMa(hypotheticalFirst)} 已超出 35 亿年生命史轴：那时连地球都还是岩浆海，规则判定不可能。`,
  });

  // G2 氧气门：需氧者到达时氧气不足 => 灭绝。
  // 产氧者（蓝菌）本身就是氧气来源，免于此门，改由结果分级 marginal 体现立足艰难。
  const needsO2 = specimen.oxygenRequirementPal > 0 && !specimen.oxygenic;
  const g2Pass = !needsO2 || oxygenAtArrival + 1e-12 >= specimen.oxygenRequirementPal;
  gates.push({
    rule: 'G2-oxygen-availability',
    passed: g2Pass,
    title: '氧气门槛',
    detail: specimen.oxygenic
      ? `产氧者自带「氧气工厂」，环境氧（${formatPal(oxygenAtArrival)}）不是建群前提；但在无氧世界里产氧会局部毒害厌氧邻居，扩张受限。`
      : needsO2
        ? `该类群建群需要 ≥ ${formatPal(specimen.oxygenRequirementPal)}；到达时（${formatMa(hypotheticalFirst)}）实测 ${formatPal(oxygenAtArrival)}。`
        : `该类群不依赖游离氧（厌氧代谢），到达时 ${formatPal(oxygenAtArrival)} 不构成门槛。`,
  });

  // G3 宿主门（病毒）/ 能量门（其他）
  let g3Pass: boolean;
  if (specimen.category === 'virus' && specimen.hostCategory) {
    const hostFirst = categoryFirstAppearance()[specimen.hostCategory] ?? AXIS_MIN_T;
    g3Pass = hypotheticalFirst >= hostFirst;
    gates.push({
      rule: 'G3-host-existence',
      passed: g3Pass,
      title: '宿主先存',
      detail: g3Pass
        ? `宿主类群最早出现于 ${formatMa(hostFirst)}，早于或等于到达时刻，可以感染。`
        : `宿主类群要到 ${formatMa(hostFirst)} 才出现；${formatMa(hypotheticalFirst)} 时无细胞可感染，病毒无法建群。`,
    });
  } else {
    const hf = hypotheticalFirst;
    // 厌氧者靠化学梯度即可；产氧者自带能量途径；其余需氧化梯度（>=1e-7 PAL 视为微氧位存在）
    g3Pass = specimen.anaerobic || specimen.oxygenic || oxygenAtArrival >= 1e-7;
    gates.push({
      rule: 'G3-energy-base',
      passed: g3Pass,
      title: '能量基础',
      detail: specimen.anaerobic
        ? '厌氧代谢可利用热液化学梯度与海洋中的硫、铁，能量基础存在。'
        : specimen.oxygenic
          ? `产氧光合作用只要有光、水与 CO₂ 即可运转，${formatMa(hf)} 的浅海满足该条件。`
          : `需氧代谢依赖的氧化梯度在 ${formatMa(hf)} 仅 ${formatPal(oxygenAtArrival)}，微氧生态位勉强存在。`,
    });
  }

  // G4 大灭绝生存门：需氧、原本不遇二叠纪末（5 级）、提前后存续区间覆盖 -252
  const newLast = Math.min(0, round3(specimen.lastAppearT - shift));
  const originallyHitsPermian = specimen.lastAppearT >= -252 && specimen.firstAppearT <= -252;
  const nowHitsPermian = hypotheticalFirst <= -252 && newLast >= -252;
  const g4Pass = !(needsO2 && nowHitsPermian && !originallyHitsPermian);
  gates.push({
    rule: 'G4-mass-extinction-survival',
    passed: g4Pass,
    title: '大灭绝生存',
    detail: g4Pass
      ? nowHitsPermian
        ? '提前后的存续区间覆盖二叠纪末（2.52 亿年前，5 级灭绝），但该类群本就经历过它，规则视为可再次幸存。'
        : '提前后的存续区间不新增与 5 级灭绝事件的正面碰撞。'
      : '提前后存续区间撞上二叠纪末大灭绝（5 级，海洋缺氧酸化），需氧类群且在原时间线未曾经历此次瓶颈，判定淘汰。',
  });

  let outcome: CounterfactualResult['outcome'];
  if (!g1Pass) {
    outcome = 'impossible';
  } else if (!g2Pass || !g3Pass || !g4Pass) {
    outcome = 'extinct';
  } else if (specimen.oxygenic && oxygenAtArrival < 0.001) {
    // 产氧者落入完全无氧世界：能活但被厌氧霸主与自身「毒氧」限制
    outcome = 'marginal';
  } else if (needsO2 && oxygenAtArrival < specimen.oxygenRequirementPal * 5) {
    outcome = 'marginal';
  } else {
    outcome = 'bloom';
  }

  // 产氧者成功/勉强成功 => 氧气级联改写（确定性偏移）。
  // 仅前移「到达时尚未发生」的事件；若落点已晚于某事件，则该段历史不再改写。
  const shiftedEvents: CounterfactualResult['shiftedEvents'] = [];
  const eventById = new Map(allEvents().map((e) => [e.id, e]));
  if (specimen.oxygenic && (outcome === 'bloom' || outcome === 'marginal')) {
    const cascade: { id: string; to: number }[] = [
      { id: 'EV-OXY-PHOTO', to: Math.max(AXIS_MIN_T, hypotheticalFirst) },
      { id: 'EV-GOE', to: Math.max(AXIS_MIN_T, hypotheticalFirst + 300) },
      { id: 'EV-HURONIAN', to: Math.max(AXIS_MIN_T, hypotheticalFirst + 300) },
      { id: 'EV-NEOP-O2', to: Math.max(AXIS_MIN_T, hypotheticalFirst + 2100) },
      { id: 'EV-CAMBRIAN', to: Math.max(AXIS_MIN_T, hypotheticalFirst + 2159) },
    ];
    for (const c of cascade) {
      const e = eventById.get(c.id);
      if (e && c.to < e.t) {
        shiftedEvents.push({ eventId: c.id, title: e.title, fromT: e.t, toT: round3(c.to) });
      }
    }
  }

  const outcomeText: Record<CounterfactualResult['outcome'], string> = {
    bloom: '成功提前并繁盛',
    marginal: '勉强立足，生态位边缘',
    extinct: '提前出现后被淘汰',
    impossible: '规则上不可能成立',
  };

  const narrative = buildNarrative(specimen, {
    shift,
    originalFirst,
    hypotheticalFirst,
    oxygenAtArrival,
    outcome,
    shiftedEvents,
  });

  return {
    rulesVersion: COUNTERFACTUAL_RULES_VERSION,
    specimenId: specimen.id,
    taxonName: specimen.taxonName,
    originalFirstT: originalFirst,
    shiftMa: shift,
    hypotheticalFirstT: hypotheticalFirst,
    oxygenAtArrivalPal: oxygenAtArrival,
    outcome,
    outcomeText: outcomeText[outcome],
    shiftedEvents,
    gates,
    narrative,
  };
}

function buildNarrative(
  s: Specimen,
  ctx: {
    shift: number;
    originalFirst: number;
    hypotheticalFirst: number;
    oxygenAtArrival: number;
    outcome: CounterfactualResult['outcome'];
    shiftedEvents: CounterfactualResult['shiftedEvents'];
  }
): string[] {
  const lines: string[] = [];
  lines.push(
    `规则版本 ${COUNTERFACTUAL_RULES_VERSION}：把「${s.taxonName}」(${s.scientificName}) 从 ${formatMa(ctx.originalFirst)} 整体提前 ${ctx.shift} 百万年，投放到 ${formatMa(ctx.hypotheticalFirst)}。`
  );
  lines.push(`落点大气含氧量由服务端氧曲线插值得出：${formatPal(ctx.oxygenAtArrival)}。`);

  switch (ctx.outcome) {
    case 'impossible':
      lines.push('落点早于 35 亿年前的生命史起点，推演在 G1 终止：不允许「比生命更早的生命」。');
      break;
    case 'extinct':
      lines.push('至少一道环境门未通过，类群无法建立可自我维持的种群，化石记录中只留下一次失败的试探。');
      break;
    case 'marginal':
      lines.push('氧气仅略高于建群门槛，类群以小种群固守少数微氧庇护所；多样性与地理分布都被压制。');
      if (ctx.shiftedEvents.length) {
        const goe = ctx.shiftedEvents.find((e) => e.eventId === 'EV-GOE');
        if (goe) lines.push(`作为产氧者它仍缓慢排氧：大氧化事件被前移至 ${formatMa(goe.toT)}，但小种群让缓冲耗尽更慢，增氧过程拖长。`);
      }
      break;
    case 'bloom':
      lines.push('全部环境门通过且能量充裕：类群提前占据空生态位，种群快速扩张。');
      if (ctx.shiftedEvents.length) {
        for (const e of ctx.shiftedEvents) {
          lines.push(`连锁改写：${e.title} ${formatMa(e.fromT)} → ${formatMa(e.toT)}。`);
        }
        lines.push('注意：推演只前移氧气因果链，雪球地球与 Big Five 的相对顺序由规则保持，不做无约束幻想。');
      }
      break;
  }
  return lines;
}

export function getSpecimenOrError(id: number) {
  return specimenById(id);
}
