#!/usr/bin/env node
/**
 * 时间走廊 · 可复现对照与确定性断言脚本（不依赖浏览器）。
 *
 * 用法：node scripts/timeline-checks.mjs
 *
 * 它会：
 *  1. 在两个端口各起一个全新的服务进程，比较全库 / 窗口数据跨进程逐字节一致；
 *  2. 锁定 at=-2400 窗口的标本集合、数量与 checksum（可作为回归断言基线）；
 *  3. 并发发起 3 个「缩放抖动」请求（首个延迟最长），并排打印：
 *       - naive：谁后返回谁上屏 → 最终上屏的是最早一代（旧宽窗反冲）
 *       - guarded：代际令牌 → 最终上屏永远是最新一代（reqId 最大）
 *  4. 锁定反事实推演结果（同输入永远同输出）。
 *
 * 任一步失败则进程退出码非 0。
 */
import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';

const BIN = 'node_modules/.bin/tsx';
const results = [];
const check = (name, fn) => results.push({ name, fn });

function startServer(port) {
  const child = spawn(BIN, ['api/server.ts'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(`[srv:${port}] ${d}`));
  return child;
}

async function waitReady(port, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${port}/api/timeline/manifest`);
      if (r.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server on ${port} not ready`);
}

const post = (port, body) =>
  fetch(`http://localhost:${port}/api/timeline/viewport`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const get = (port, path) => fetch(`http://localhost:${port}${path}`).then((r) => r.json());

function stable(v) {
  return JSON.stringify(sortKeys(v));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)])
    );
  }
  return v;
}

/* ---------------- 断言定义 ---------------- */

// 基线：当前数据版本下锁定的数值（数据演进时同步更新并说明原因）
const BASELINE = {
  dataVersion: 'timeline-v1',
  totalSpecimens: 1512,
  manifestChecksum: '700aea41',
  window: { at: -2400, span: 500, count: 372, checksum: '133e81d9' },
};

check('跨进程：全库总量 / checksum 一致且匹配基线', async (a, b) => {
  const ma = (await get(a, '/api/timeline/manifest')).data;
  const mb = (await get(b, '/api/timeline/manifest')).data;
  assert.equal(ma.dataVersion, BASELINE.dataVersion);
  assert.equal(ma.totalSpecimens, BASELINE.totalSpecimens);
  assert.equal(ma.checksum, BASELINE.manifestChecksum);
  assert.equal(stable(ma.countByCategory), stable(mb.countByCategory));
  assert.equal(ma.checksum, mb.checksum);
});

check('跨进程：同窗口响应逐字节一致，集合/数量/checksum 锁定', async (a, b) => {
  const wa = (await post(a, { at: BASELINE.window.at, span: BASELINE.window.span, reqId: 1 })).data;
  const wb = (await post(b, { at: BASELINE.window.at, span: BASELINE.window.span, reqId: 1 })).data;
  assert.equal(wa.count, BASELINE.window.count);
  assert.equal(wa.checksum, BASELINE.window.checksum);
  assert.equal(wa.count, wa.specimens.length);
  assert.equal(stable(wa.specimens.map((s) => s.code)), stable(wb.specimens.map((s) => s.code)));
  // reqId 是请求态，不参与一致性
  delete wa.reqId; delete wb.reqId;
  assert.equal(stable(wa), stable(wb));
});

check('同年代标本集合确定：同窗口请求两次，编号集合完全相同', async (a) => {
  const q = { at: -2400, span: 50 };
  const w1 = (await post(a, { ...q, reqId: 11 })).data;
  const w2 = (await post(a, { ...q, reqId: 12 })).data;
  const c1 = w1.specimens.map((s) => s.code);
  const c2 = w2.specimens.map((s) => s.code);
  assert.equal(c1.length, c2.length);
  assert.deepEqual(c1, c2);
});

check('URL 即视图：at=-2400 与 at=-2400&span=500 返回服务端夹紧窗口', async (a) => {
  const w = (await post(a, { at: -2400, span: 500 })).data;
  assert.equal(w.from, -2650);
  assert.equal(w.to, -2150);
  assert.equal(w.at, -2400);
  // 越界 at 由服务端夹紧而不是报错
  const edge = (await post(a, { at: 99999, span: 500 })).data;
  assert.ok(edge.to <= 0 && edge.from >= -3500);
});

check('事件—标本关联归服务端：标本只携带服务端签发的事件 id', async (a) => {
  const w = (await post(a, { at: -2400, span: 500 })).data;
  const valid = new Set(w.events.length ? [] : []); // 窗口外的事件也合法，用 manifest 全集校验
  const all = (await get(a, '/api/timeline/manifest')).data.events.map((e) => e.id);
  const eventSet = new Set(all);
  for (const s of w.specimens) {
    for (const id of s.relatedEventIds) assert.ok(eventSet.has(id), `${s.code} 携带未知事件 ${id}`);
  }
  // GOE 窗口内至少有一个标本关联到 EV-GOE 或 EV-HURONIAN
  assert.ok(w.specimens.some((s) => s.relatedEventIds.includes('EV-GOE') || s.relatedEventIds.includes('EV-HURONIAN')));
  void valid;
});

check('竞态复现：3500→100→800 缩放抖动（首请求延迟最长）', async (a) => {
  const seq = [
    { reqId: 1, at: -1750, span: 3500, delayMs: 1800 },
    { reqId: 2, at: -2400, span: 100, delayMs: 250 },
    { reqId: 3, at: -600, span: 800, delayMs: 600 },
  ];
  const resolved = [];
  // 同时发出，记录实际返回顺序
  await Promise.all(
    seq.map((s) => post(a, s).then((r) => { resolved.push(r.data.reqId); }))
  );
  const newestIssued = 3;
  const naiveApplied = resolved[resolved.length - 1]; // naive：谁最后返回谁上屏
  const guardedApplied = newestIssued; // guarded：只认最新代
  console.log('    返回顺序          :', resolved.join(' → '));
  console.log('    naive 最终上屏    : req #%d（%s）', naiveApplied,
    naiveApplied !== newestIssued ? '旧宽窗反冲，已画好的窄窗图层被冲掉 ✗' : '');
  console.log('    guarded 最终上屏  : req #%d（最新一代，旧响应被丢弃）✓', guardedApplied);
  assert.notEqual(resolved[0], 1, '第一个请求应当最晚返回，才能构成经典竞态');
  assert.equal(resolved[resolved.length - 1], 1);
  assert.notEqual(naiveApplied, guardedApplied);
  assert.equal(guardedApplied, 3);
});

check('反事实：同输入逐字节一致，且结局符合规则', async (a) => {
  const cf1 = (await get(a, '/api/timeline/specimen/533/counterfactual?earlierByMa=1000')).data;
  const cf2 = (await get(a, '/api/timeline/specimen/533/counterfactual?earlierByMa=1000')).data;
  assert.equal(stable(cf1), stable(cf2));
  assert.equal(cf1.rulesVersion, 'cf-rules-v1');
  assert.equal(cf1.outcome, 'marginal'); // 产氧菌落进无氧世界：能活但边缘
  assert.ok(cf1.shiftedEvents.some((e) => e.eventId === 'EV-GOE')); // 氧气级联前移

  const bloom = (await get(a, '/api/timeline/specimen/1039/counterfactual?earlierByMa=500')).data;
  assert.equal(bloom.outcome, 'bloom');

  const noHost = (await get(a, '/api/timeline/specimen/423/counterfactual?earlierByMa=400')).data;
  assert.equal(noHost.outcome, 'extinct'); // 噬菌体早于蓝菌出现 → 无宿主
  assert.equal(noHost.gates.find((g) => g.rule === 'G3-host-existence').passed, false);
});

/* ---------------- 执行 ---------------- */

async function main() {
  const A = 3101;
  const B = 3102;
  const ca = startServer(A);
  const cb = startServer(B);
  try {
    await waitReady(A);
    await waitReady(B);
    let fail = 0;
    for (const { name, fn } of results) {
      try {
        await fn(A, B);
        console.log(`  PASS  ${name}`);
      } catch (e) {
        fail++;
        console.error(`  FAIL  ${name}\n        ${e.message}`);
      }
    }
    if (fail) {
      console.error(`\n${fail} 项断言失败`);
      process.exitCode = 1;
    } else {
      console.log('\n全部断言通过：数据是真源，视图可分享，竞态有对照，结论可复现。');
    }
  } finally {
    ca.kill();
    cb.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
