import { Bug, Play, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { RaceLogEntry, RaceMode } from './requestManager';

interface Props {
  mode: RaceMode;
  delayMs: number;
  log: RaceLogEntry[];
  onMode: (m: RaceMode) => void;
  onDelay: (ms: number) => void;
  onRunRepro: () => void;
  onClear: () => void;
}

const STATUS_STYLE: Record<RaceLogEntry['status'], { color: string; label: string }> = {
  issued: { color: '#7dd3fc', label: '发起' },
  applied: { color: '#34d399', label: '上屏' },
  'stale-dropped': { color: '#fbbf24', label: '旧代丢弃' },
  aborted: { color: '#94a3b8', label: '中止' },
  error: { color: '#f87171', label: '错误' },
};

export function RacePanel({ mode, delayMs, log, onMode, onDelay, onRunRepro, onClear }: Props) {
  return (
    <div className="pointer-events-auto absolute left-3 top-24 z-20 w-[min(330px,calc(100vw-24px))] max-h-[calc(100vh-9.5rem)] overflow-y-auto rounded-2xl border border-glow-primary/25 bg-[#071f1b]/95 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Bug className="h-4 w-4 text-glow-gold" />
        <h2 className="text-sm font-semibold text-text-light">竞态对照台</h2>
        <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-text-muted">
          缩放时旧响应会不会冲掉已画好的图层
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onMode('guarded')}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs ${
            mode === 'guarded'
              ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
              : 'border-white/10 bg-white/5 text-text-muted'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" /> 代际令牌保护
        </button>
        <button
          onClick={() => onMode('naive')}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs ${
            mode === 'naive'
              ? 'border-red-400/60 bg-red-400/10 text-red-300'
              : 'border-white/10 bg-white/5 text-text-muted'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" /> naive 对照
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
        <label className="whitespace-nowrap">受控延迟</label>
        <input
          type="range"
          min={0}
          max={2500}
          step={100}
          value={delayMs}
          onChange={(e) => onDelay(Number(e.target.value))}
          className="flex-1 accent-glow-primary"
        />
        <span className="w-16 text-right font-mono text-glow-primary">{delayMs}ms</span>
      </div>

      <button
        onClick={onRunRepro}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-glow-gold/50 bg-glow-gold/10 px-3 py-2 text-xs text-glow-gold hover:bg-glow-gold/20"
      >
        <Play className="h-3.5 w-3.5" /> 一键复现：3500→100→3500 缩放抖动
      </button>
      <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted">
        脚本按序发起 3 个不同宽度的视口请求，首个请求带最长延迟。保护模式下图层始终停在最新一代；naive 模式下迟到的旧宽窗数据会反冲屏幕（观察 checksum 与 reqId）。
      </p>

      <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[10px]">
        {log.length === 0 && <div className="text-text-muted">等待请求…</div>}
        {log.map((e, i) => {
          const st = STATUS_STYLE[e.status];
          return (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <span className="w-8 text-text-muted">#{e.reqId}</span>
              <span style={{ color: st.color }}>● {st.label}</span>
              {Number.isFinite(e.at) && <span className="text-text-muted">at={Math.round(e.at)} span={e.span}</span>}
              {e.elapsedMs !== undefined && <span className="ml-auto text-text-muted">{e.elapsedMs}ms</span>}
            </div>
          );
        })}
      </div>

      <button onClick={onClear} className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-light">
        <Trash2 className="h-3 w-3" /> 清空日志
      </button>
    </div>
  );
}
