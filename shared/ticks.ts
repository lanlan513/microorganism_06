// 纯刻度数学（无 DOM）：前端画布与 Node 性能/确定性测试共用。
import type { Ma } from './timeline.js';

/** 主刻度"好看"步长（Ma） */
export const TICK_STEPS: readonly number[] = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2000];

export interface VisibleRange {
  from: Ma;
  to: Ma;
}

export function visibleRange(atMa: Ma, ppm: number, widthPx: number, padPx = 0): VisibleRange {
  const half = (widthPx / 2 + padPx) * ppm;
  return { from: atMa - half, to: atMa + half };
}

/** 选第一个使像素间距 >= targetPx 的步长 */
export function chooseTickStep(ppm: number, targetPx = 112): number {
  for (const s of TICK_STEPS) {
    if (s / ppm >= targetPx) return s;
  }
  return TICK_STEPS[TICK_STEPS.length - 1];
}

export interface Tick {
  ma: Ma;
  kind: 'major' | 'minor';
}

/**
 * 生成可见区间内全部刻度。
 * minorDivisions：主格之间的细分格数（深缩放时用 10，可达上千格）。
 */
export function tickMarks(from: Ma, to: Ma, majorStep: number, minorDivisions = 5): Tick[] {
  const out: Tick[] = [];
  const minorStep = majorStep / minorDivisions;
  const firstMinor = Math.ceil(from / minorStep) * minorStep;
  // 浮点修正，避免 -2400/3 这类产生 0.3333333
  const round = (n: number) => Math.abs(n) < 1e-9 ? 0 : Math.round(n * 1e6) / 1e6;
  for (let i = 0; ; i++) {
    const ma = round(firstMinor + i * minorStep);
    if (ma > to + 1e-9) break;
    if (ma < from - 1e-9) continue;
    const isMajor = Math.abs(ma / majorStep - Math.round(ma / majorStep)) < 1e-6;
    out.push({ ma, kind: isMajor ? 'major' : 'minor' });
  }
  return out;
}

/** 主刻度文本格式：>=1000 Ma 用"亿年"，否则用"百万年" */
export function formatMa(ma: Ma): string {
  if (ma === 0) return '今天';
  const abs = Math.abs(ma);
  if (abs >= 1000) {
    const yi = abs / 100; // Ma -> 亿年
    return `${Number(yi.toFixed(2))}亿年前`;
  }
  return `${Math.round(abs)}百万年前`;
}
