#!/usr/bin/env tsx
// 竞态端到端复现：对运行中的服务器连发 3 个窗口请求，gen1 故意慢 1200ms。
// 用法：先 `npm run server:dev`，再 `npm run test:race`
import { simulateRace } from '../shared/race.ts';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';

console.log('=== 第 1 步：纯逻辑对照（shared/race.ts，确定） ===');
const reqs = [
  { gen: 1, latencyMs: 1200, payload: { gen: 1 } },
  { gen: 2, latencyMs: 150, payload: { gen: 2 } },
  { gen: 3, latencyMs: 50, payload: { gen: 3 } },
];
for (const mode of ['naive', 'guarded'] as const) {
  console.log(`\n[${mode}]`);
  for (const c of simulateRace(reqs, mode === 'guarded')) {
    console.log(
      `  gen${c.payloadGen} 到达 → ${c.dropped ? 'DROPPED（丢弃，图层保留）' : c.staleOverride ? '⚠ STALE OVERRIDE（旧图层冲掉新图层）' : 'committed'}`,
    );
  }
}

console.log('\n=== 第 2 步：对真实服务器发请求，观察响应到达顺序 ===');
const calls = [
  { tag: 'gen1', from: -3500, to: 0, delay: 1200 },
  { tag: 'gen2', from: -1400, to: -525, delay: 150 },
  { tag: 'gen3', from: -900, to: -550, delay: 50 },
];
try {
  const results = await Promise.all(
    calls.map(async (c, i) => {
      const t0 = Date.now();
      const res = await fetch(
        `${BASE}/timeline/window?from=${c.from}&to=${c.to}&_delay=${c.delay}&_tag=${c.tag}`,
      );
      const body = await res.json();
      return { ...c, ms: Date.now() - t0, hash: body.data.hash, count: body.data.count };
    }),
  );
  for (const r of results) {
    console.log(`  ${r.tag.padEnd(5)} ${r.ms}ms 到达  range=[${r.from},${r.to}]  count=${r.count} hash=${r.hash}`);
  }
  console.log('\n到达顺序即上面打印顺序：gen3 → gen2 → gen1。');
  console.log('naive 加载器会让最后到达的 gen1 覆盖画布；guarded 加载器丢弃 gen1（见页面提交日志 DROPPED）。');
} catch (e) {
  console.error('请求失败：请确认服务端已启动（npm run server:dev，默认 3001）。', (e as Error).message);
  process.exit(1);
}
