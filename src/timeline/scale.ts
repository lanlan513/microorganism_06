/**
 * 时间轴纯视图数学：只做「服务端窗口 → 像素」的投影与刻度生成。
 *
 * 注意边界：这里的 from/to 必须来自服务端夹紧后的 ViewportResponse，
 * 本模块绝不推算标本、事件、氧含量、灭绝等任何结论。
 */

const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 3500];

export interface Tick {
  t: number;
  x: number;
  major: boolean;
  label: string | null;
}

export interface TickSet {
  step: number;
  minorStep: number;
  ticks: Tick[];
  /** 实际绘制的刻度总数（主+次），用于性能观测 */
  totalCount: number;
}

/** 按像素密度选择主刻度步长（Ma），保证主刻度间距 >= minGapPx */
export function chooseStep(span: number, width: number, minGapPx = 90): number {
  const target = (span / width) * minGapPx;
  for (const s of NICE_STEPS) {
    if (s >= target) return s;
  }
  return NICE_STEPS[NICE_STEPS.length - 1];
}

export function xOf(t: number, from: number, to: number, width: number): number {
  return ((t - from) / (to - from)) * width;
}

export function tOf(x: number, from: number, to: number, width: number): number {
  return from + (x / width) * (to - from);
}

function fmtMa(t: number, step: number): string {
  if (t === 0) return '今天';
  const v = Math.abs(Math.round(t * 10) / 10);
  if (step < 1) return `${v} 百万年`;
  return `${v >= 100 ? Math.round(v) : v} Ma`;
}

/**
 * 生成整窗刻度。最宽视野下 3500/1(最小可被选择的细分) 等组合天然可超 1000，
 * 极端缩小时我们直接画全轴 1Ma 网格来做「上千刻度不卡」的性能基线。
 */
export function buildTicks(
  from: number,
  to: number,
  width: number,
  axisMin = -3500,
  axisMax = 0,
  denseOverride = false
): TickSet {
  const span = to - from;
  // dense：主刻度 1Ma（3501 个），次刻度 0.5Ma —— 全轴 7001 个刻度的性能基线
  const step = denseOverride ? 1 : chooseStep(span, width);
  const minorStep = denseOverride ? 0.5 : step / 5;

  const lo = Math.max(axisMin, from);
  const hi = Math.min(axisMax, to);
  const start = Math.floor(lo / minorStep) * minorStep;

  const ticks: Tick[] = [];
  const eps = minorStep / 10;
  for (let t0 = start; t0 <= hi + eps; t0 += minorStep) {
    const t = Math.round(t0 / minorStep) * minorStep;
    if (t < lo - eps || t > hi + eps) continue;
    const x = xOf(t, from, to, width);
    const isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ticks.push({
      t: Math.round(t * 1000) / 1000,
      x,
      major: isMajor,
      label: isMajor ? fmtMa(t, step) : null,
    });
  }
  return { step, minorStep, ticks, totalCount: ticks.length };
}

/** 「远古」感标签：把 Ma 翻成中文概称 */
export function eonLabel(t: number): string {
  if (t >= 0) return '今天';
  if (t >= -541) return '显生宙 Phanerozoic';
  if (t >= -2500) return '元古宙 Proterozoic';
  if (t >= -4000) return '太古宙 Archean';
  return '冥古宙 Hadean';
}
