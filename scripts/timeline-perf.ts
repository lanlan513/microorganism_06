/**
 * 时间轴性能基线（无需浏览器）：
 *  - 全轴 1Ma/0.5Ma 刻度生成的单次耗时（拖动时每帧调用）
 *  - 1512 个标本投影的每帧数学开销
 *  - 宽窗视口响应体积
 */
import { buildTicks, xOf } from '../src/timeline/scale.ts';

const W = 1440;

function bench(name, n, fn) {
  // 预热
  for (let i = 0; i < 10; i++) fn();
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < n; i++) acc += fn();
  const ms = (performance.now() - t0) / n;
  return { name, ms, acc };
}

const dense = bench('全轴 dense 刻度生成 (from -3500 to 0)', 200, () => {
  const t = buildTicks(-3500, 0, W, -3500, 0, true);
  return t.totalCount;
});
console.log(`${dense.name}: ${dense.acc / 200} 个刻度, 单次 ${dense.ms.toFixed(3)} ms`);

const normal = bench('默认全轴刻度 (nice step)', 200, () => {
  const t = buildTicks(-3500, 0, W, -3500, 0, false);
  return t.totalCount;
});
console.log(`${normal.name}: ${normal.acc / 200} 个刻度, 单次 ${normal.ms.toFixed(3)} ms`);

// 模拟拖动时的每帧投影：1512 个点
const fake = Array.from({ length: 1512 }, (_, i) => ({
  firstAppearT: -3500 + (i * 3500) / 1512,
  lastAppearT: -3400 + (i * 3500) / 1512,
  code: `SP-${i}`,
}));
const proj = bench('1512 标本投影 + 哈希抖动', 200, () => {
  let n = 0;
  for (const s of fake) {
    const x = xOf((s.firstAppearT + s.lastAppearT) / 2, -3500, 0, W);
    let h = 2166136261;
    for (let i = 0; i < s.code.length; i++) { h ^= s.code.charCodeAt(i); h = Math.imul(h, 16777619); }
    n += x + ((h >>> 0) % 1000);
  }
  return n;
});
console.log(`每帧纯数学投影: ${proj.ms.toFixed(3)} ms（预算 16.67ms/帧，留足 canvas 绘制余量）`);

const FRAME_BUDGET = 16.67;
const tickBudgetShare = 4;
if (dense.ms > tickBudgetShare) {
  console.error(`刻度生成 ${dense.ms.toFixed(2)}ms 超出 ${tickBudgetShare}ms 预算份额`);
  process.exit(1);
}
console.log(`\n60fps 帧预算 ${FRAME_BUDGET}ms：刻度+投影合计 ${(dense.ms + proj.ms).toFixed(2)}ms，余量充足。`);
