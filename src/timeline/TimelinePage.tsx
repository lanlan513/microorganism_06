import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Link2, Check, Gauge } from 'lucide-react';
import { TimelineCanvas } from './TimelineCanvas';
import { SpecimenPanel } from './SpecimenPanel';
import { RacePanel } from './RacePanel';
import { timelineApi } from './api';
import {
  parseViewFromUrl,
  useTimelineStore,
  writeViewToUrl,
} from './store';
import { ViewportRequestManager } from './requestManager';
import { eonLabel } from './scale';
import type { RenderStats } from './renderer';

export function TimelinePage() {
  const {
    view,
    viewport,
    loading,
    manifest,
    manifestError,
    raceMode,
    delayMs,
    raceLog,
    appliedGen,
    setManifest,
    setManifestError,
    setRaceMode,
    setDelayMs,
    pushRaceLog,
    clearRaceLog,
    commitView,
    setLoading,
    applyResponse,
  } = useTimelineStore();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [dense, setDense] = useState(false);
  const [stats, setStats] = useState<RenderStats & { fps: number }>({
    ticks: 0, specimens: 0, events: 0, drawMs: 0, fps: 60,
  });
  const [copied, setCopied] = useState(false);

  // 代际请求管理器（组件级单例）
  const rmRef = useRef<ViewportRequestManager | null>(null);
  if (!rmRef.current) rmRef.current = new ViewportRequestManager();
  const rm = rmRef.current;

  const loadViewport = useCallback(
    async (at: number, span: number, useDelay = true) => {
      setLoading(true);
      const data = await rm.issue(at, span, useDelay ? delayMs : 0);
      if (data) {
        // 原子上屏：只在这里把新代数据交给 store；旧图层在此之前纹丝不动
        applyResponse(data);
      } else {
        setLoading(false);
      }
    },
    [rm, delayMs, setLoading, applyResponse]
  );

  // 初始化：manifest + URL 首屏
  useEffect(() => {
    timelineApi
      .manifest()
      .then(setManifest)
      .catch((e) => setManifestError((e as Error).message));
    const initial = parseViewFromUrl(new URL(window.location.href));
    commitView(initial.at, initial.span);
    writeViewToUrl(initial.at, initial.span);
    void loadViewport(initial.at, initial.span, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 绑定竞态日志回调 & 模式切换
  useEffect(() => {
    rm.onLog = pushRaceLog;
    rm.mode = raceMode;
  }, [rm, pushRaceLog, raceMode]);

  // 唯一的提交入口：写 URL、同步 store、按代际发请求（effect 不再重复触发）
  const onCommit = useCallback(
    (at: number, span: number) => {
      writeViewToUrl(at, span);
      commitView(at, span);
      void loadViewport(at, span);
    },
    [commitView, loadViewport]
  );

  // 一键复现竞态：宽 → 窄 → 中，首个请求延迟最长。
  // guarded：迟到的宽窗响应被代际令牌丢弃，屏幕最终停在窄窗最新一代；
  // naive：旧代数据后返回时反冲屏幕，「已画好的图层」被错误数据覆盖。
  const runRepro = useCallback(async () => {
    clearRaceLog();
    const seq: { at: number; span: number; d: number }[] = [
      { at: -1750, span: 3500, d: 1800 },
      { at: -2400, span: 100, d: 250 },
      { at: -600, span: 800, d: 600 },
    ];
    setLoading(true);
    for (const step of seq) {
      writeViewToUrl(step.at, step.span);
      commitView(step.at, step.span);
      const data = await rm.issue(step.at, step.span, step.d);
      if (data) applyResponse(data);
      await new Promise((r) => setTimeout(r, 150));
    }
    setLoading(false);
  }, [rm, clearRaceLog, commitView, setLoading, applyResponse]);

  const copyShareLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* 剪贴板不可用时静默 */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const jumpToEvent = useCallback(
    (t: number) => {
      const span = 200;
      const at = Math.min(-span / 2, Math.max(-3500 + span / 2, t));
      commitView(at, span);
    },
    [commitView]
  );

  const selected = useMemo(
    () => viewport?.specimens.find((s) => s.id === selectedId) ?? null,
    [viewport, selectedId]
  );

  const currentSpan = viewport?.span ?? view.span;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04100e] pt-16">
      {/* 顶栏 */}
      <div className="absolute left-0 right-0 top-14 z-10 flex items-center gap-3 px-4 py-2">
        <Link
          to="/"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-text-muted hover:border-glow-primary/40 hover:text-glow-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 回大厅
        </Link>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 font-mono text-xs text-text-light">
          <span className="text-text-muted">时间点</span>
          <span className="text-glow-primary">{viewport ? `${Math.abs(viewport.at).toFixed(1)} Ma` : '—'}</span>
          <span className="text-text-muted">/ 窗宽</span>
          <span>{currentSpan.toFixed(0)} Ma</span>
          <span className="text-text-muted">/</span>
          <span>{viewport ? eonLabel(viewport.at) : ''}</span>
        </div>
        <button
          onClick={copyShareLink}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-glow-primary/40 bg-glow-primary/10 px-3 py-1.5 text-xs text-glow-primary hover:bg-glow-primary/20"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied ? '已复制' : '分享这一屏'}
        </button>
        <label className="pointer-events-auto ml-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={dense} onChange={(e) => setDense(e.target.checked)} className="accent-glow-primary" />
          <Gauge className="h-3.5 w-3.5" /> 密刻度压力（7001 刻度）
        </label>
      </div>

      {/* 画布 */}
      <TimelineCanvas
        data={viewport ? {
          from: viewport.from,
          to: viewport.to,
          specimens: viewport.specimens,
          events: viewport.events,
          oxygen: viewport.oxygen,
        } : null}
        dense={dense}
        selectedId={selectedId}
        hoverId={hoverId}
        onHover={setHoverId}
        onSelect={setSelectedId}
        onCommit={onCommit}
        onStats={setStats}
      />

      {/* 初始加载幕布：仅在还没有任何图层时显示，之后加载不再遮挡 */}
      {!viewport && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#04100e]">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-glow-primary/30 border-t-glow-primary" />
            <p className="mt-4 font-mono text-sm text-text-muted">{manifestError ? `清单加载失败：${manifestError}` : '正在从服务端取 35 亿年走廊…'}</p>
          </div>
        </div>
      )}

      {/* 左下角：确定性 / 性能 HUD */}
      {viewport && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-[10px] text-text-muted backdrop-blur">
          <div>
            数据版本 <span className="text-glow-primary">{viewport.dataVersion}</span> · 窗口校验和{' '}
            <span className="text-glow-gold">{viewport.checksum}</span>
          </div>
          <div>
            已上屏代际 <span className="text-emerald-300">#{appliedGen}</span>
            {loading && <span className="ml-2 text-sky-300">新一代加载中（当前图层保留）…</span>}
          </div>
          <div>
            标本 <span className="text-text-light">{viewport.count}</span> · 事件{' '}
            <span className="text-text-light">{viewport.events.length}</span> · 刻度{' '}
            <span className={stats.ticks > 1000 ? 'text-glow-gold' : 'text-text-light'}>{stats.ticks}</span>
          </div>
          <div>
            绘制 {stats.drawMs}ms · <span className={stats.fps >= 55 ? 'text-emerald-300' : 'text-glow-gold'}>{stats.fps} FPS</span>
          </div>
          {manifest && <div className="mt-0.5">全库 {manifest.totalSpecimens} 标本 · 全库 checksum {manifest.checksum}</div>}
        </div>
      )}

      {/* 图例 */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-[10px] text-text-muted backdrop-blur">
        <div className="mb-1 text-glow-primary/80">图例</div>
        <div><span className="text-cyan-300">◆ 氧事件</span> · <span className="text-red-400">▲ 大灭绝（数字=强度）</span> · <span className="text-sky-300">▭ 冰期</span></div>
        <div className="mt-0.5">蓝曲线=大气 O₂（log 刻度）· 横拖动 / 滚轮缩放 / 点标本</div>
      </div>

      {/* 竞态对照台：选中面板打开时让出右侧 */}
      {!selected && (
        <RacePanel
          mode={raceMode}
          delayMs={delayMs}
          log={raceLog}
          onMode={setRaceMode}
          onDelay={setDelayMs}
          onRunRepro={runRepro}
          onClear={clearRaceLog}
        />
      )}

      {selected && viewport && (
        <SpecimenPanel
          specimen={selected}
          events={manifest?.events ?? viewport.events}
          onClose={() => setSelectedId(null)}
          onJumpEvent={jumpToEvent}
        />
      )}

      {/* 悬浮标本名 */}
      {hoverId && !selectedId && viewport && (
        <HoverLabel id={hoverId} />
      )}
    </div>
  );
}

function HoverLabel({ id }: { id: number }) {
  const vp = useTimelineStore((s) => s.viewport);
  const s = vp?.specimens.find((x) => x.id === id);
  if (!s) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-28 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-4 py-1 font-mono text-xs text-text-light backdrop-blur">
      {s.taxonName} · {Math.abs(s.firstAppearT)}–{Math.abs(s.lastAppearT)} Ma
    </div>
  );
}
