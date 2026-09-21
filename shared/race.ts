// 竞态门控的纯逻辑（无 fetch/DOM）：前端加载器与 Node 对照测试共用。
//
// 要解决的问题：缩放层级切换时会发出新请求，但旧层级的响应可能更晚回来。
// naive（裸 async）：谁后回来谁覆盖 -> 图层被旧数据冲掉。
// guarded（世代令牌）：响应回来时世代已过期则丢弃 -> 已画好的图层永不被冲。
//
// 这个模块只模拟"请求发出顺序"与"响应返回顺序"，返回每次提交属于哪个世代，
// 不做任何网络动作，因此对照结果完全确定、可在测试里断言。

export interface ScheduledRequest {
  /** 单调递增的世代号 */
  gen: number;
  /** 模拟服务端处理耗时（ms）；乱序返回即竞态 */
  latencyMs: number;
  payload: { gen: number };
}

export interface Commit {
  /** 这次提交的数据所属世代 */
  payloadGen: number;
  /** 提交时当前世代（最新请求） */
  currentGen: number;
  /** 是否被门控丢弃；naive 模式永远为 false */
  dropped: boolean;
  /** 是否发生了"旧数据覆盖新图层" */
  staleOverride: boolean;
}

/**
 * 按返回时序（latencyMs 升序）模拟提交。
 * @param requests 按发出顺序排列的请求（第 i 个在时刻 i 发出）
 * @param guard 是否启用世代门控
 */
export function simulateRace(requests: ScheduledRequest[], guard: boolean): Commit[] {
  // 到达时刻 = 发出时刻（数组下标）+ latency；下标即发出顺序
  const arrivals = requests.map((r, idx) => ({ ...r, arriveAt: idx + r.latencyMs }));
  arrivals.sort((a, b) => a.arriveAt - b.arriveAt || a.gen - b.gen);

  const commits: Commit[] = [];
  for (const a of arrivals) {
    // "当前世代"= 在该响应到达之前（含）已经发出的最大世代号
    let currentGen = 0;
    requests.forEach((r, idx) => {
      if (idx <= a.arriveAt) currentGen = Math.max(currentGen, r.gen);
    });
    const isStale = a.payload.gen < currentGen;
    const dropped = guard && isStale;
    commits.push({
      payloadGen: a.payload.gen,
      currentGen,
      dropped,
      staleOverride: !guard && isStale,
    });
  }
  return commits;
}

/**
 * 运行时门控器（真 fetch 用）：
 *   const gate = createGenerationGate();
 *   const gen = gate.next();
 *   const data = await fetch(...);
 *   if (!gate.isCurrent(gen)) return; // 过期响应：丢弃，旧图层保留
 *   setData(data);
 */
export function createGenerationGate() {
  let gen = 0;
  return {
    next() {
      gen += 1;
      return gen;
    },
    current() {
      return gen;
    },
    isCurrent(g: number) {
      return g === gen;
    },
  };
}

export type GenerationGate = ReturnType<typeof createGenerationGate>;
