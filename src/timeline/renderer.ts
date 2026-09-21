/**
 * Canvas 渲染器：所有图层先画进离屏 canvas，完成后一次 drawImage 原子上屏。
 * 这保证「正在加载的数据」只存在于离屏 buffer 里，永远不会半幅覆盖已显示的图层。
 */
import {
  TIMELINE_CATEGORY_COLORS,
  type Specimen,
  type TimelineEvent,
} from '../../shared/timeline';
import { buildTicks, xOf, type TickSet } from './scale';

const COLORS = {
  bgTop: '#071a17',
  bgBottom: '#04100e',
  grid: 'rgba(0,255,200,0.07)',
  gridMajor: 'rgba(0,255,200,0.18)',
  axis: 'rgba(0,255,200,0.55)',
  tickLabel: 'rgba(190,255,238,0.75)',
  eon: 'rgba(0,255,200,0.35)',
  band: 'rgba(0,255,200,0.04)',
  oxygenFill: 'rgba(56,189,248,0.14)',
  oxygenLine: '#38bdf8',
  event: '#fbbf24',
  extinction: '#f87171',
  oxygenEvent: '#22d3ee',
  glaciation: '#7dd3fc',
  specimenStroke: 'rgba(0,0,0,0.55)',
};

export interface RenderInput {
  width: number;
  height: number;
  dpr: number;
  from: number;
  to: number;
  specimens: Specimen[];
  events: TimelineEvent[];
  oxygen: { t: number; pal: number }[];
  dense: boolean;
  selectedId: number | null;
  hoverId: number | null;
}

export interface RenderStats {
  ticks: number;
  specimens: number;
  events: number;
  drawMs: number;
}

const LAYOUT = {
  oxygenTop: 12,
  oxygenHeight: 92,
  axisY: 128,
  eventTop: 146,
  eventHeight: 64,
  laneTop: 226,
  laneBottomPad: 58,
};

function eventColor(type: TimelineEvent['type']): string {
  switch (type) {
    case 'extinction': return COLORS.extinction;
    case 'oxygen': return COLORS.oxygenEvent;
    case 'glaciation': return COLORS.glaciation;
    default: return COLORS.event;
  }
}

/** 全量渲染到离屏 buffer 并原子上屏；返回统计 */
export function renderFrame(
  screen: HTMLCanvasElement,
  buffer: HTMLCanvasElement,
  input: RenderInput
): RenderStats {
  const t0 = performance.now();
  const { width: w, height: h, dpr, from, to } = input;

  if (buffer.width !== w * dpr || buffer.height !== h * dpr) {
    buffer.width = w * dpr;
    buffer.height = h * dpr;
  }
  const ctx = buffer.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 刻度（可上千）：主/次网格各走一笔路径，避免上千次 stroke 调用
  const ticks: TickSet = buildTicks(from, to, w, -3500, 0, input.dense);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const tk of ticks.ticks) {
    if (tk.major) continue;
    ctx.moveTo(tk.x + 0.5, 0);
    ctx.lineTo(tk.x + 0.5, h);
  }
  ctx.strokeStyle = COLORS.grid;
  ctx.stroke();
  ctx.beginPath();
  for (const tk of ticks.ticks) {
    if (!tk.major) continue;
    ctx.moveTo(tk.x + 0.5, 0);
    ctx.lineTo(tk.x + 0.5, h);
  }
  ctx.strokeStyle = COLORS.gridMajor;
  ctx.stroke();

  // 宙带标签
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.eon;
  ctx.textAlign = 'center';
  const eonBounds: [number, number, string][] = [
    [0, -541, '显生宙'],
    [-541, -2500, '元古宙'],
    [-2500, -3500, '太古宙'],
  ];
  for (const [a, b, label] of eonBounds) {
    const xa = xOf(Math.max(a, from), from, to, w);
    const xb = xOf(Math.min(b, to), from, to, w);
    if (xb - xa > 60) {
      ctx.fillText(label, (xa + xb) / 2, 16);
    }
  }

  // 氧含量曲线（log10 PAL）
  const oTop = LAYOUT.oxygenTop;
  const oH = LAYOUT.oxygenHeight;
  const logLo = -6; // 1e-6
  const logHi = Math.log10(0.3);
  const yPal = (pal: number) => {
    const f = (Math.log10(Math.max(pal, 1e-7)) - logLo) / (logHi - logLo);
    return oTop + oH - Math.min(1, Math.max(0, f)) * oH;
  };
  if (input.oxygen.length > 1) {
    ctx.beginPath();
    input.oxygen.forEach((p, i) => {
      const x = xOf(p.t, from, to, w);
      const y = yPal(p.pal);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = xOf(input.oxygen[input.oxygen.length - 1].t, from, to, w);
    const firstX = xOf(input.oxygen[0].t, from, to, w);
    ctx.lineTo(lastX, oTop + oH);
    ctx.lineTo(firstX, oTop + oH);
    ctx.closePath();
    ctx.fillStyle = COLORS.oxygenFill;
    ctx.fill();

    ctx.beginPath();
    input.oxygen.forEach((p, i) => {
      const x = xOf(p.t, from, to, w);
      const y = yPal(p.pal);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.oxygenLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(125,211,252,0.85)';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('O₂ (log₁₀ PAL)', 8, oTop + 10);

  // 主轴
  const axisY = LAYOUT.axisY;
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, axisY + 0.5);
  ctx.lineTo(w, axisY + 0.5);
  ctx.stroke();

  // 主刻度文字：像素间距不足时抽稀，上千刻度下也不产生上千次 fillText
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = COLORS.tickLabel;
  ctx.textAlign = 'center';
  const majorPx = (ticks.step / (to - from)) * w;
  // 每 N 个主刻度写一次字，保证字距 >= ~64px
  const labelEvery = Math.max(1, Math.ceil(64 / Math.max(majorPx, 0.01)));
  let majorSeen = -1;
  for (const tk of ticks.ticks) {
    if (!tk.major || !tk.label) continue;
    majorSeen++;
    if (majorSeen % labelEvery !== 0 && tk.t !== 0) continue;
    ctx.fillText(tk.label, Math.min(w - 32, Math.max(32, tk.x)), axisY + 18);
  }

  // 事件标记
  const eTop = LAYOUT.eventTop;
  for (const e of input.events) {
    const x = xOf(e.t, from, to, w);
    if (x < -30 || x > w + 30) continue;
    const c = eventColor(e.type);
    const isExt = e.type === 'extinction';
    // 持续型事件画跨度带
    if (e.tEnd !== undefined && e.tEnd !== e.t) {
      const x2 = xOf(e.tEnd, from, to, w);
      ctx.fillStyle = c + '22';
      ctx.fillRect(x, eTop + 8, Math.max(2, x2 - x), 26);
    }
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, eTop + 4);
    ctx.lineTo(x, axisY);
    ctx.stroke();
    // 灭绝 = 三角警示，氧事件 = 菱形，其他 = 竖条圆头
    if (isExt) {
      ctx.beginPath();
      ctx.moveTo(x, eTop + 2);
      ctx.lineTo(x - 7, eTop + 18);
      ctx.lineTo(x + 7, eTop + 18);
      ctx.closePath();
      ctx.fill();
      if (e.severity) {
        ctx.fillStyle = '#1a0a0a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(e.severity), x, eTop + 16);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, eTop + 10, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 标本泳道（每条目一个点；同分类抖动到固定 lane —— 位置由 code 哈希决定，确定性）
  const laneTop = LAYOUT.laneTop;
  const laneH = Math.max(60, h - laneTop - LAYOUT.laneBottomPad);
  const laneIdx: Record<string, number> = {};
  const cats = Object.keys(TIMELINE_CATEGORY_COLORS);
  cats.forEach((c, i) => {
    laneIdx[c] = i;
  });
  const laneSlotH = laneH / cats.length;

  // 分类泳道背景与名称
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  cats.forEach((c) => {
    const y = laneTop + laneIdx[c] * laneSlotH;
    ctx.fillStyle = TIMELINE_CATEGORY_COLORS[c as keyof typeof TIMELINE_CATEGORY_COLORS] + '0d';
    ctx.fillRect(0, y, w, laneSlotH);
    ctx.fillStyle = TIMELINE_CATEGORY_COLORS[c as keyof typeof TIMELINE_CATEGORY_COLORS] + 'aa';
    ctx.fillText(c, 8, y + 12);
  });

  // 先收集每个点的投影（一次数学），再按分类批量绘制（避免每点一笔 fill/stroke）
  interface Plotted { s: Specimen; x: number; y: number; x1: number; x2: number; r: number }
  const plotted: Plotted[] = [];
  for (const s of input.specimens) {
    const x = xOf((s.firstAppearT + s.lastAppearT) / 2, from, to, w);
    if (x < -12 || x > w + 12) continue;
    const ci = laneIdx[s.category] ?? 0;
    const y =
      laneTop +
      ci * laneSlotH +
      22 +
      (hashJitter(s.code) * (laneSlotH - 32));
    const selected = s.id === input.selectedId;
    const hover = s.id === input.hoverId;
    plotted.push({
      s,
      x,
      y,
      x1: xOf(s.firstAppearT, from, to, w),
      x2: xOf(s.lastAppearT, from, to, w),
      r: selected ? 6.5 : hover ? 5 : 3,
    });
  }

  for (const cat of cats) {
    const color = TIMELINE_CATEGORY_COLORS[cat as keyof typeof TIMELINE_CATEGORY_COLORS];
    const items = plotted.filter((p) => p.s.category === cat);
    if (!items.length) continue;

    // 存续区间细线（一笔）
    ctx.beginPath();
    for (const p of items) {
      if (p.x2 - p.x1 <= 3) continue;
      ctx.moveTo(p.x1, p.y);
      ctx.lineTo(p.x2, p.y);
    }
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 点填充（一笔）
    ctx.beginPath();
    for (const p of items) {
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = color;
    ctx.fill();

    // 普通描边（一笔）；高亮点单独再画
    ctx.beginPath();
    for (const p of items) {
      if (p.s.id === input.selectedId || p.s.id === input.hoverId) continue;
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    ctx.strokeStyle = COLORS.specimenStroke;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // 高亮环最后画
  for (const p of plotted) {
    if (p.s.id !== input.selectedId && p.s.id !== input.hoverId) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#efffff';
    ctx.lineWidth = p.s.id === input.selectedId ? 2 : 1;
    ctx.stroke();
  }

  // 宙带分隔
  ctx.strokeStyle = 'rgba(0,255,200,0.15)';
  ctx.lineWidth = 1;
  for (const b of [-541, -2500]) {
    const x = xOf(b, from, to, w);
    if (x > 0 && x < w) {
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 原子上屏：整帧只在这里接触可见 canvas 一次
  if (screen.width !== w * dpr || screen.height !== h * dpr) {
    screen.width = w * dpr;
    screen.height = h * dpr;
  }
  const sctx = screen.getContext('2d')!;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, screen.width, screen.height);
  sctx.drawImage(buffer, 0, 0);

  return {
    ticks: ticks.totalCount,
    specimens: input.specimens.length,
    events: input.events.length,
    drawMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

function hashJitter(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** 命中测试：返回点击坐标处的标本 id（由渲染时同样的投影反算） */
export function hitTest(
  px: number,
  py: number,
  from: number,
  to: number,
  width: number,
  height: number,
  specimens: Specimen[]
): number | null {
  const laneTop = LAYOUT.laneTop;
  const laneH = Math.max(60, height - laneTop - LAYOUT.laneBottomPad);
  const cats = Object.keys(TIMELINE_CATEGORY_COLORS);
  const laneSlotH = laneH / cats.length;
  let best: { id: number; d: number } | null = null;
  for (const s of specimens) {
    const x = xOf((s.firstAppearT + s.lastAppearT) / 2, from, to, width);
    const ci = cats.indexOf(s.category);
    if (ci < 0) continue;
    const y = laneTop + ci * laneSlotH + 22 + hashJitter(s.code) * (laneSlotH - 32);
    const d = Math.hypot(px - x, py - y);
    if (d < 9 && (!best || d < best.d)) best = { id: s.id, d };
  }
  return best?.id ?? null;
}
