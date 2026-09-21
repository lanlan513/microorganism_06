import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Link2, Check } from 'lucide-react';
import { TimelineCanvas } from '../components/TimelineCanvas';
import { SpecimenPanel } from '../components/SpecimenPanel';
import { RaceLab } from '../components/RaceLab';
import { bucketFor, useTimelineData, useUrlView } from '../hooks/useTimeline';
import { timelineApi } from '../utils/timelineApi';
import type { EraSnapshot, Specimen } from '../../shared/timeline';
import { formatMa } from '../../shared/ticks';
import { GROUP_LABELS, GROUP_COLORS } from '../../shared/timeline';

function DataInner({ mode }: { mode: 'naive' | 'guarded' }) {
  const { atMa, ppm, setView } = useUrlView();
  const { meta, windowData, loading, log, fetchWindow } = useTimelineData(mode);

  // 桶变化才请求服务端窗口图层；桶内拖动只触发 rAF 重投影
  const bucket = useMemo(() => bucketFor(atMa, ppm), [atMa, ppm]);
  const loadedKeyRef = useRef<string>('');
  useEffect(() => {
    if (loadedKeyRef.current === bucket.key) return;
    loadedKeyRef.current = bucket.key;
    void fetchWindow({ fromMa: bucket.fromMa, toMa: bucket.toMa, tag: `auto:${bucket.key}` });
  }, [bucket.key, bucket.fromMa, bucket.toMa, fetchWindow]);

  // 年代断言：中心 at 上"住着谁"完全由服务端 /era 决定（集合、数量、hash）
  const [era, setEra] = useState<EraSnapshot | null>(null);
  const eraTimer = useRef<number | null>(null);
  useEffect(() => {
    if (eraTimer.current) window.clearTimeout(eraTimer.current);
    eraTimer.current = window.setTimeout(() => {
      void timelineApi.getEra(Math.round(atMa)).then(setEra);
    }, 200);
    return () => { if (eraTimer.current) window.clearTimeout(eraTimer.current); };
  }, [atMa]);

  const [selected, setSelected] = useState<Specimen | null>(null);
  const handleSelect = useCallback(async (id: string) => {
    // 优先用窗口载荷（已是服务端真源）；当前桶没覆盖到时再取详情
    const local = windowDataRef.current?.specimens.find((s) => s.id === id);
    if (local) setSelected(local);
    else setSelected(await timelineApi.getSpecimen(id));
  }, []);
  const windowDataRef = useRef(windowData);
  windowDataRef.current = windowData;

  // 竞态一键复现：gen1 慢（1200ms）→ gen2(150) → gen3(50)
  const runRaceScript = useCallback(async () => {
    const p1 = fetchWindow({ fromMa: -3500, toMa: 0, delayMs: 1200, tag: 'gen1' });
    const p2 = fetchWindow({ fromMa: -1400, toMa: -525, delayMs: 150, tag: 'gen2' });
    const p3 = fetchWindow({ fromMa: -900, toMa: -550, delayMs: 50, tag: 'gen3' });
    await Promise.allSettled([p1, p2, p3]);
  }, [fetchWindow]);

  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/corridor?at=${Math.round(atMa * 10) / 10}&ppm=${Math.round(ppm * 1000) / 1000}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const oxygenLabel = era
    ? era.oxygenPal >= 1 ? `${era.oxygenPal.toFixed(1)}% PAL` : `${era.oxygenPal.toFixed(4)}% PAL`
    : '…';

  return (
    <div className="space-y-4">
      <TimelineCanvas
        meta={meta}
        windowData={windowData}
        atMa={atMa}
        ppm={ppm}
        loading={loading}
        onView={setView}
        onSelect={handleSelect}
      />

      {/* 控制条 */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <button
          onClick={() => setView({ atMa: atMa - 300 * ppm * 2, ppm })}
          className="btn-primary-ghost text-xs"
        >
          ← 更古老
        </button>
        <button
          onClick={() => setView({ atMa: atMa + 300 * ppm * 2, ppm })}
          className="btn-primary-ghost text-xs"
        >
          更新 →
        </button>
        <button onClick={() => setView({ ppm: Math.max(0.05, ppm / 2) })} className="btn-primary-ghost text-xs">
          放大 −
        </button>
        <button onClick={() => setView({ ppm: Math.min(20, ppm * 2) })} className="btn-primary-ghost text-xs">
          缩小 +
        </button>
        <button
          onClick={() => setView({ atMa: -2400, ppm: 0.3 }, 'push')}
          className="btn-primary-ghost text-xs"
        >
          跳转大氧化事件 −2400
        </button>
        <span className="ml-auto flex items-center gap-3 text-text-muted">
          <span>at=<span className="text-glow-primary">{atMa}</span></span>
          <span>ppm=<span className="text-glow-primary">{ppm}</span></span>
          <button onClick={share} className="btn-primary-ghost text-xs">
            {copied ? <Check className="w-3.5 h-3.5 text-glow-primary" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? '已复制' : '分享此视图'}
          </button>
        </span>
      </div>

      {/* 年代断言卡（服务端 /era：集合、数量、hash 三者确定，可直接断言） */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-[10px] tracking-[0.25em] text-text-muted font-mono">中心年代 AT</p>
            <p className="font-display text-2xl text-text-light">{formatMa(atMa)}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] text-text-muted font-mono">宙 / 代 / 纪（服务端）</p>
            <p className="text-sm text-text-light mt-1">
              {era?.band ? `${era.band.eon} · ${era.band.era}${era.band.period ? ` · ${era.band.period}` : ''}` : '…'}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] text-text-muted font-mono">大气含氧量</p>
            <p className="text-sm text-[#4cc9f0] mt-1 font-mono">{oxygenLabel}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] text-text-muted font-mono">该年代标本数量（确定）</p>
            <p className="text-sm text-glow-primary mt-1 font-mono">
              {era ? era.count : '…'} 件
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] text-text-muted font-mono">集合哈希 SHA-256:12</p>
            <p className="text-sm text-text-muted mt-1 font-mono">{era?.hash ?? '…'}</p>
          </div>
        </div>
        {era && (
          <p className="text-[11px] text-text-muted mt-3 leading-relaxed">
            此刻活着：
            {era.count === 0
              ? '（无标本落在该年）'
              : era.specimenIds.map((id) => {
                  const sp = windowData?.specimens.find((s) => s.id === id);
                  return (
                    <button
                      key={id}
                      onClick={() => sp && handleSelect(sp.id)}
                      className="mx-1 underline decoration-dotted hover:text-glow-primary"
                      style={{ color: sp ? GROUP_COLORS[sp.group] : undefined }}
                    >
                      {sp?.name ?? id}
                    </button>
                  );
                })}
          </p>
        )}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-text-muted">
        {Object.entries(GROUP_LABELS).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GROUP_COLORS[k as keyof typeof GROUP_COLORS] }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#4cc9f0]" />氧化事件</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#9ec5fe]" />冰期</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#ff5a5a]" />大灭绝</span>
        <span className="ml-auto">拖拽平移 · 滚轮缩放 · 点击标本追问反事实</span>
      </div>

      <RaceLab mode={mode} running={loading} onRun={runRaceScript} />

      {/* 提交日志 */}
      <div className="glass-card p-4">
        <p className="text-xs text-text-light font-mono mb-2">数据图层提交日志（新→旧）</p>
        <div className="space-y-1 max-h-44 overflow-y-auto">
          {log.length === 0 && <p className="text-[11px] text-text-muted font-mono">尚无提交。</p>}
          {log.map((l) => (
            <div key={l.seq} className="font-mono text-[11px] leading-relaxed">
              <span className={l.action === 'dropped' ? 'text-glow-gold' : 'text-glow-primary'}>
                #{l.seq} {l.action.toUpperCase()}
              </span>
              <span className="text-text-muted">
                {' '}{l.tag} {l.range} · count={l.count} hash={l.hash} — {l.reason}
              </span>
            </div>
          ))}
        </div>
      </div>

      <SpecimenPanel specimen={selected} meta={meta} onClose={() => setSelected(null)} />
    </div>
  );
}

export function CorridorPage() {
  // key 随模式变化，直接换一棵带正确门控语义的子树（naive/guarded 是两套加载器）
  const [mode, setMode] = useState<'guarded' | 'naive'>('guarded');

  return (
    <div className="container mx-auto px-4 sm:px-6 pt-28 pb-16 max-w-6xl">
      <Link to="/" className="inline-flex items-center gap-2 text-text-muted hover:text-glow-primary text-sm font-mono mb-4">
        <ArrowLeft className="w-4 h-4" /> 返回大厅
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl text-text-light">
            三十五亿年<span className="text-gradient-primary">时间走廊</span>
          </h1>
          <p className="text-text-muted text-sm mt-2 max-w-2xl leading-relaxed">
            横向拖动穿越 35 亿年：谁住在每个年代、大气含氧量、大氧化事件与五次大灭绝都标在轴上。
            年代区间查询、事件关联、反事实推演全部由服务端计算；地址栏 <code className="text-glow-primary">at</code> 即分享坐标。
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-mono cursor-pointer select-none">
          <span className={mode === 'naive' ? 'text-glow-red' : 'text-text-muted'}>naive 裸加载</span>
          <button
            role="switch"
            aria-checked={mode === 'guarded'}
            onClick={() => setMode(mode === 'guarded' ? 'naive' : 'guarded')}
            className={`relative w-11 h-6 rounded-full transition-colors ${mode === 'guarded' ? 'bg-glow-primary/80' : 'bg-glow-red/60'}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${mode === 'guarded' ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
          <span className={mode === 'guarded' ? 'text-glow-primary' : 'text-text-muted'}>guarded 世代门控</span>
        </label>
      </div>

      <DataInner key={mode} mode={mode} />
    </div>
  );
}
