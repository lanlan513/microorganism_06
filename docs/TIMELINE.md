# 35 亿年时间走廊 · Time Corridor

从 35 亿年前横向拖到今天：看每个年代住着哪些微生物、大气含氧量、大氧化事件、
雪球地球、Big Five 大灭绝；点开标本看「当时的模样」，追问一句
**"如果它早出现十亿年会怎样"**，由服务端按确定性规则给出反事实推演。

入口：导航栏「35亿年时间走廊」，或 `/timeline`。分享视图：
`/timeline?at=-2400&span=500`（`at` 单位百万年前，负为过去，`0` = 今天）。

---

## 先回答：时间轴上的真源是数据还是视图？

**真源是服务端数据，不是视图。**

| 事项 | 归谁 | 说明 |
|---|---|---|
| 标本集合 / 数量 / 区间检索 | 服务端 | SQLite 内存库，`idx_specimens_first/last` 索引区间查询 |
| 事件—标本关联 | 服务端 | `specimen_events` 关联表，生成时按固定规则签发 |
| 大气含氧量 / GOE / 灭绝 | 服务端 | 氧曲线 `log10(PAL)` 插值；事件只存服务端 |
| 反事实结论 | 服务端 | G1–G4 确定性规则门 + 氧气级联（`cf-rules-v1`） |
| 窗口夹紧 from/to | 服务端 | `/viewport` 是唯一权威，前端不自己改结论 |
| `at` / `span`（看的位置） | URL | 可分享、可回放，是「视图位置」的唯一外部真源 |
| 像素投影、刻度怎么画 | 前端 | 纯函数：`服务端窗口 + URL 视图 → 像素`，不算任何结论 |

前端代码里没有任何对标本/事件/氧含量的二次推导；它只渲染服务端成品。

## 确定性与可断言

- 数据由固定种子 PRNG（mulberry32 + FNV-1a）生成：**任何进程、任何机器结果逐字节一致**；
- 每个窗口响应带 `checksum`；同 `(at, span)` ⇒ 同标本编号集合、同数量、同 checksum；
- 基线（`timeline-v1`，可跑脚本锁定/回归）：
  - 全库 **1512** 个标本，全库 checksum `700aea41`；
  - `at=-2400, span=500`：**372** 个标本，checksum `133e81d9`。

```bash
npm run timeline:checks   # 起两个全新服务进程，断言跨进程一致 + 竞态对照 + 反事实
npm run timeline:perf     # 7001 刻度生成 0.2ms 级，60fps 帧预算基线
```

`scripts/timeline-checks.mjs` 输出的对照样例：

```
返回顺序          : 2 → 3 → 1
naive 最终上屏    : req #1（旧宽窗反冲，已画好的窄窗图层被冲掉 ✗）
guarded 最终上屏  : req #3（最新一代，旧响应被丢弃）✓
```

## 竞态：缩放切换时，加载中的数据不能冲掉已画好的图层

两道保险，缺一不可：

1. **代际令牌（generation token）**：每次视口请求领单调递增 `reqId`；
   响应到达时若不是最新一代即丢弃（并 `AbortController` 主动中止上一代）。
   画布左上角「竞态对照台」可切到 **naive**（故意"谁后返回谁上屏"）做 A/B，
   也可一键复现 `3500→100→800` 缩放抖动（首请求延迟最长）。
2. **离屏图层原子上屏**：所有图层先画进离屏 canvas，完整画完才一次 `drawImage`；
   正在加载的数据只存在于请求与离屏 buffer 中，可见 canvas 永远不出现半幅新数据。
   加载期间 store 里保留旧 `viewport` 引用，HUD 显示"新一代加载中（当前图层保留）"。

受控延迟来自服务端 `POST /api/timeline/viewport` 的 `delayMs`（硬上限 3000ms），
所以对照是**接口级可复现**的，不靠手速。

## 性能（上千刻度 / 60fps）

- 刻度、1500+ 标本点、区间线全部**按类批量成单条路径**绘制（每类两笔，不是每点一笔）；
- 文字按像素间距抽稀，7001 刻度也不会产生 7001 次 `fillText`；
- 拖动走 `requestAnimationFrame`，瞬时视图在 ref 中，落定/节流（220ms）才提交 URL 与请求；
- DPR 钳到 2；命中测试由与渲染相同的确定性投影反算。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/timeline/manifest` | 事件 / 氧节点 / 层级 / 全库统计与 checksum |
| GET/POST | `/api/timeline/viewport?at&span[&reqId&delayMs]` | 服务端夹紧窗口 + 区间索引查询 |
| GET | `/api/timeline/specimen/:id` | 标本与「当时的模样」描述符 |
| GET/POST | `/api/timeline/specimen/:id/counterfactual?earlierByMa` | 反事实推演（默认提前 1000Ma） |

## 反事实规则（`cf-rules-v1`，确定性）

- **G1 时间边界**：不允许早于 -3500Ma（早于生命史轴 → `impossible`）；
- **G2 氧气门槛**：需氧类到达时 `oxygenAt(hypo) >= 建群所需 PAL`；产氧者免此门（它自己产氧）；
- **G3 宿主/能量**：病毒须有宿主类群先存在；其他靠化学梯度或微氧位；
- **G4 大灭绝生存**：提前后新撞上二叠纪末（5 级）且原时间线没经历过 → 淘汰；
- 产氧者成功/勉强 → **氧气级联前移**（产氧光合→GOE/休伦冰期→新元古代增氧→寒武纪），
  只前移"到达时尚未发生"的事件，不做无约束幻想。

结局：`bloom` / `marginal` / `extinct` / `impossible`。

## 目录

```
shared/timeline.ts                 两端共享类型与常量
api/src/timeline/
  data/{events,archetypes,prng,generator}.ts  固定种子数据集
  db.ts                            内存 SQLite + 区间索引 + 关联表
  timelineService.ts               视口/氧曲线/checksum/反事实引擎
  timelineController.ts            delayMs 受控延迟
src/timeline/
  scale.ts                         纯投影/刻度（视图数学，不含结论）
  renderer.ts                      离屏 buffer → 原子上屏
  requestManager.ts                代际令牌（guarded / naive）
  TimelineCanvas.tsx               拖动/缩放/命中、rAF
  SpecimenPanel.tsx / SpecimenPortrait.tsx
  RacePanel.tsx                    竞态对照台
scripts/timeline-checks.mjs        确定性 + 竞态对照断言
scripts/timeline-perf.ts           刻度/投影性能基线
```
