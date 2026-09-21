import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCounterfactual,
  getEra,
  getIndexStats,
  getSpecimen,
  getWindow,
  specimens,
} from '../api/src/services/TimelineService.js';
import { chooseTickStep, tickMarks, visibleRange } from '../shared/ticks.ts';
import { simulateRace } from '../shared/race.ts';

// ---------- 1. 真源确定性：同一年代集合/数量/哈希恒定 ----------

test('年代集合是确定且可断言的：-2400（GOE）有 6 件，且包含蓝菌与产甲烷古菌', () => {
  const a = getEra(-2400);
  const b = getEra(-2400);
  assert.equal(a.count, 6, 'GOE 年代应有 6 件存活标本');
  assert.deepEqual(a.specimenIds, b.specimenIds);
  // 服务端次序按 (firstMa 升序, id 字典序)
  const sorted = [...a.specimenIds].sort((x, y) => {
    const sx = specimens.find((s) => s.id === x)!;
    const sy = specimens.find((s) => s.id === y)!;
    return sx.firstMa - sy.firstMa || x.localeCompare(y);
  });
  assert.deepEqual(a.specimenIds, sorted);
  assert.ok(a.specimenIds.includes('s-cyano'));
  assert.ok(a.specimenIds.includes('s-methano'));
  assert.equal(a.hash, b.hash, '同输入哈希必须一致');
  assert.match(a.hash, /^[0-9a-f]{12}$/);
});

test('同一年代重复查询逐字相等', () => {
  assert.deepEqual(getEra(-1000), getEra(-1000));
  const w1 = getWindow(-3500, 0);
  const w2 = getWindow(-3500, 0);
  assert.equal(w1.hash, w2.hash);
  assert.equal(w1.count, w1.specimens.length);
});

test('今天(-0..0)：智人在列，且包含全部现生种', () => {
  const now = getEra(0);
  assert.ok(now.specimenIds.includes('s-sapiens'));
  assert.ok(now.specimenIds.includes('s-cyano'));
  assert.ok(now.count >= 20, `今天应至少有 20 件现生标本，实际 ${now.count}`);
});

test('含端点：首现年与灭绝年都算存活', () => {
  // 奇虾 [-521,-485]
  assert.ok(getEra(-521).specimenIds.includes('s-anomalo'));
  assert.ok(getEra(-485).specimenIds.includes('s-anomalo'));
  assert.ok(!getEra(-484).specimenIds.includes('s-anomalo'));
});

// ---------- 2. 区间查询与索引 ----------

test('窗口区间查询：只返回与窗口重叠的标本，并按 (firstMa,id) 排序', () => {
  const w = getWindow(-600, -500);
  assert.ok(w.specimens.length > 0);
  for (const s of w.specimens) {
    assert.ok(s.lastMa >= -600 && s.firstMa <= -500, `${s.id} 不应落在窗口内`);
  }
  const ids = w.specimens.map((s) => s.id);
  // 服务端次序按 (firstMa 升序, id 字典序)
  for (let i = 1; i < w.specimens.length; i++) {
    const p = w.specimens[i - 1];
    const c = w.specimens[i];
    assert.ok(p.firstMa < c.firstMa || (p.firstMa === c.firstMa && p.id <= c.id));
  }
  assert.equal(new Set(ids).size, ids.length, '窗口内标本不重复');
});

test('窄窗口 (-66.1,-65.9) 恰好夹在 K-Pg 边界：恐龙在、菊石在，智人不在', () => {
  const w = getWindow(-66.1, -65.9);
  const ids = new Set(w.specimens.map((s) => s.id));
  assert.ok(ids.has('s-dinosaur'));
  assert.ok(ids.has('s-ammonite'));
  assert.ok(!ids.has('s-sapiens'));
});

test('索引统计：树节点数与标本数合理', () => {
  const st = getIndexStats();
  assert.equal(st.specimenCount, specimens.length);
  assert.ok(st.tree.nodes >= 1);
  assert.ok(st.tree.depth >= 1);
});

test('窗口结果可复算哈希（join 逗号的 SHA-256 前 12 位）', async () => {
  const { createHash } = await import('node:crypto');
  const w = getWindow(-1000, -500);
  const expectHash = createHash('sha256').update(w.specimens.map((s) => s.id).join(',')).digest('hex').slice(0, 12);
  assert.equal(w.hash, expectHash);
});

// ---------- 3. 事件关联归服务端 ----------

test('事件关联由服务端给出：K-Pg 亲历者含恐龙，蓝菌关联 GOE', () => {
  const dino = getSpecimen('s-dinosaur')!;
  assert.ok(dino.relatedEventIds.includes('e-ext-kpg'));
  const cyano = getSpecimen('s-cyano')!;
  assert.ok(cyano.relatedEventIds.includes('e-goe'));
});

test('泳道确定性：重叠标本不同道，分配稳定', () => {
  const w = getWindow(-3500, 0);
  for (let i = 0; i < w.specimens.length; i++) {
    for (let j = i + 1; j < w.specimens.length; j++) {
      const a = w.specimens[i];
      const b = w.specimens[j];
      const overlap = a.firstMa <= b.lastMa && b.firstMa <= a.lastMa;
      if (overlap) assert.notEqual(a.lane, b.lane, `${a.id} 与 ${b.id} 重叠却同泳道`);
    }
  }
  assert.deepEqual(getWindow(-3500, 0).specimens.map((s) => s.lane), w.specimens.map((s) => s.lane));
});

// ---------- 4. 反事实规则引擎（确定性） ----------

test('蓝菌早 10 亿年（-3900）：R0 越界阻断', () => {
  const r = evaluateCounterfactual('s-cyano', 1000) as any;
  assert.equal(r.outcome, 'blocked');
  assert.equal(r.shiftedFirstMa, -3900);
  assert.equal(r.steps[0].rule, 'R0');
  assert.equal(r.steps[0].passed, false);
});

test('三叶虫早 10 亿年（-1521）：R1 氧气不足阻断（无聊十亿年低氧）', () => {
  const r = evaluateCounterfactual('s-trilobite', 1000) as any;
  assert.equal(r.outcome, 'blocked');
  const r1 = r.steps.find((s: any) => s.rule === 'R1');
  assert.equal(r1.passed, false);
});

test('冰下微生物席早 5 亿年（-1217）：R0–R4 全部通过，存活', () => {
  const r = evaluateCounterfactual('s-iceslime', 500) as any;
  assert.equal(r.outcome, 'survives', r.headline);
  assert.ok(r.steps.slice(0, 5).every((s: any) => s.passed));
});

test('恐龙早 1 亿年（-333）：R4 邻近晚泥盆世灭绝阻断', () => {
  const r = evaluateCounterfactual('s-dinosaur', 100) as any;
  assert.equal(r.outcome, 'blocked');
  const r4 = r.steps.find((s: any) => s.rule === 'R4');
  assert.equal(r4.passed, false);
});

test('反事实输出带规则版本且完全确定', () => {
  const a = evaluateCounterfactual('s-sapiens', 100) as any;
  const b = evaluateCounterfactual('s-sapiens', 100) as any;
  assert.equal(a.version, 'cf-rules-v1');
  assert.deepEqual(a.steps, b.steps);
  assert.equal(a.headline, b.headline);
});

test('非法输入被拒', () => {
  assert.equal('error' in evaluateCounterfactual('nope', 100), true);
  assert.equal('error' in evaluateCounterfactual('s-cyano', 0), true);
  assert.equal('error' in evaluateCounterfactual('s-cyano', -5), true);
});

// ---------- 5. 刻度性能：深缩放生成上千格，且为纯函数 ----------

test('整条轴 3501 个 1-Ma 刻度位生成 < 8ms（"上千刻度不卡"的最坏情况）', () => {
  const t0 = performance.now();
  const ticks = tickMarks(-3500, 0, 1, 1); // 每个 1 Ma 一格
  const dt = performance.now() - t0;
  assert.equal(ticks.length, 3501);
  assert.ok(dt < 8, `生成 ${ticks.length} 格耗时 ${dt.toFixed(2)}ms 超预算`);
});

test('深缩放（ppm=0.05，2560px）可见刻度超过 1000', () => {
  const vr = visibleRange(-700, 0.05, 2560, 0);
  const step = chooseTickStep(0.05);
  const ticks = tickMarks(vr.from, vr.to, step, 10);
  assert.ok(ticks.length > 1000, `深缩放可见刻度应上千，实际 ${ticks.length}`);
});

test('刻度生成在深缩放下 < 8ms', () => {
  const vr = visibleRange(-700, 0.05, 1920, 0);
  const step = chooseTickStep(0.05);
  const t0 = performance.now();
  tickMarks(vr.from, vr.to, step, 10);
  const dt = performance.now() - t0;
  assert.ok(dt < 8, `生成耗时 ${dt.toFixed(2)}ms 超预算`);
});

test('刻度确定性：同样输入同样输出', () => {
  const vr = visibleRange(-2400, 0.5, 1200, 0);
  const step = chooseTickStep(0.5);
  assert.deepEqual(tickMarks(vr.from, vr.to, step), tickMarks(vr.from, vr.to, step));
});

// ---------- 6. 竞态对照（核心复现） ----------

test('竞态对照：乱序返回时 naive 发生旧图层覆盖，guarded 不发生', () => {
  const reqs = [
    { gen: 1, latencyMs: 1200, payload: { gen: 1 } },
    { gen: 2, latencyMs: 150, payload: { gen: 2 } },
    { gen: 3, latencyMs: 50, payload: { gen: 3 } },
  ];
  const naive = simulateRace(reqs, false);
  const guarded = simulateRace(reqs, true);

  // 返回顺序：gen3, gen2, gen1
  assert.deepEqual(naive.map((c) => c.payloadGen), [3, 2, 1]);

  // naive：最后落地的是 gen1（旧数据），存在 staleOverride
  const naiveFinal = naive[naive.length - 1];
  assert.equal(naiveFinal.payloadGen, 1);
  assert.equal(naiveFinal.staleOverride, true);
  assert.ok(naive.some((c) => c.staleOverride));

  // guarded：gen1/gen2 被丢弃，唯一 committed 的是 gen3
  assert.deepEqual(guarded.filter((c) => !c.dropped).map((c) => c.payloadGen), [3]);
  assert.equal(guarded.some((c) => c.staleOverride), false);
  assert.equal(guarded[2].dropped, true); // gen1 最后回来被丢弃
});

test('按序返回（无乱序）时两种模式都提交最新数据', () => {
  const reqs = [
    { gen: 1, latencyMs: 0.01, payload: { gen: 1 } },
    { gen: 2, latencyMs: 0.02, payload: { gen: 2 } },
    { gen: 3, latencyMs: 0.03, payload: { gen: 3 } },
  ];
  for (const guard of [false, true]) {
    const commits = simulateRace(reqs, guard);
    assert.deepEqual(commits.map((c) => c.payloadGen), [1, 2, 3]);
    assert.ok(commits.every((c) => !c.staleOverride));
  }
});
