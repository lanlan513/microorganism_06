import { useEffect, useState } from 'react';
import { X, Clock3, ArrowLeftRight, FlaskConical, Loader2 } from 'lucide-react';
import type { CounterfactualResult, GeoEvent, Specimen, TimelineMeta } from '../../shared/timeline';
import { GROUP_COLORS, GROUP_LABELS, TIMELINE_MIN_MA } from '../../shared/timeline';
import { formatMa } from '../../shared/ticks';
import { timelineApi } from '../utils/timelineApi';

interface Props {
  specimen: Specimen | null;
  meta: TimelineMeta | null;
  onClose: () => void;
}

const KIND_LABELS: Record<GeoEvent['kind'], string> = {
  oxygenation: '氧化',
  glaciation: '冰期',
  extinction: '灭绝',
  milestone: '里程碑',
};

export function SpecimenPanel({ specimen, meta, onClose }: Props) {
  const [cf, setCf] = useState<CounterfactualResult | null>(null);
  const [shift, setShift] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCf(null);
    setErr(null);
    setBusy(false);
    setShift(1000);
  }, [specimen?.id]);

  if (!specimen) return null;
  const color = GROUP_COLORS[specimen.group];

  const ask = async (shiftMa: number) => {
    setBusy(true);
    setErr(null);
    setShift(shiftMa);
    try {
      setCf(await timelineApi.counterfactual({ id: specimen.id, shiftMa }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const related = meta
    ? specimen.relatedEventIds.map((id) => meta.events.find((e) => e.id === id)).filter(Boolean) as GeoEvent[]
    : [];

  const maxShift = specimen.firstMa - TIMELINE_MIN_MA;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-card w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="category-badge text-[10px]"
                  style={{ color, borderColor: `${color}66`, background: `${color}1a` }}
                >
                  {GROUP_LABELS[specimen.group]}
                </span>
                <span className="text-[11px] text-text-muted font-mono">
                  {formatMa(specimen.firstMa)}
                  {specimen.lastMa === 0 ? ' 至今' : ` – ${formatMa(specimen.lastMa)}`}
                </span>
              </div>
              <h2 className="font-display text-3xl text-text-light">{specimen.name}</h2>
              <p className="text-text-muted italic text-sm mt-0.5">{specimen.scientificName}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full border border-white/10 hover:border-glow-primary/50 text-text-muted hover:text-glow-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 当时模样：服务端给的形态重建 */}
          <div className="mt-5 grid grid-cols-[120px_1fr] gap-4 items-center">
            <div
              className="w-[120px] h-[120px] rounded-xl border flex items-center justify-center"
              style={{ borderColor: `${color}44`, background: `${color}0d` }}
            >
              <svg viewBox="0 0 100 100" className="w-24 h-24" style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}>
                <path d={specimen.appearance.silhouette} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.25em] text-glow-primary/80 font-mono">当时模样</p>
              <p className="text-text-light text-sm mt-1">{specimen.appearance.form}</p>
              <p className="text-text-muted text-xs mt-2 leading-relaxed">{specimen.appearance.note}</p>
            </div>
          </div>

          <p className="text-text-light/90 text-sm leading-relaxed mt-5">{specimen.description}</p>

          <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-mono">
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-text-muted">栖息环境</p>
              <p className="text-text-light mt-1">{specimen.habitat}</p>
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-text-muted">体型</p>
              <p className="text-text-light mt-1">{specimen.size}</p>
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-text-muted">最低需氧（% PAL）</p>
              <p className="text-text-light mt-1">{specimen.oxygenNeedPal === 0 ? '厌氧（氧气对其有毒）' : specimen.oxygenNeedPal}</p>
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-text-muted">服务端关联事件</p>
              <p className="text-text-light mt-1">{related.length === 0 ? '无' : related.map((e) => e.label).join('、')}</p>
            </div>
          </div>

          {related.length > 0 && (
            <div className="mt-4 space-y-2">
              {related.map((e) => (
                <div key={e.id} className="text-xs rounded-lg border border-white/10 p-3">
                  <span className="font-mono text-text-muted mr-2">[{KIND_LABELS[e.kind]}]</span>
                  <span className="text-text-light">{e.label}</span>
                  <p className="text-text-muted mt-1 leading-relaxed">{e.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* 反事实追问 */}
          <div className="mt-6 rounded-xl border border-glow-gold/25 bg-glow-gold/5 p-4">
            <div className="flex items-center gap-2 text-glow-gold">
              <FlaskConical className="w-4 h-4" />
              <h3 className="font-mono text-sm tracking-wide">反事实推演 · 服务端确定性规则 R0–R5</h3>
            </div>
            <p className="text-text-muted text-xs mt-2 leading-relaxed">
              由服务端按 R0–R5 固定规则给出（边界→氧气→前置类群→冰期→灭绝邻近→综合），
              同输入永远同输出。追问：如果它早出现十亿年会怎样？
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {[100, 500, 1000].map((d) => (
                <button
                  key={d}
                  disabled={busy || d > maxShift}
                  onClick={() => ask(d)}
                  className={`btn-primary-ghost text-xs ${d > maxShift ? 'opacity-30 cursor-not-allowed' : ''}`}
                  title={d > maxShift ? '超出走廊起点' : ''}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  早 {d} 百万年
                </button>
              ))}
            </div>

            {busy && (
              <div className="flex items-center gap-2 text-text-muted text-xs mt-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                规则引擎推演中…
              </div>
            )}
            {err && <p className="text-glow-red text-xs mt-3">{err}</p>}
            {cf && !busy && (
              <div className="mt-4">
                <div
                  className={`text-sm font-mono rounded-lg p-3 ${
                    cf.outcome === 'survives'
                      ? 'text-glow-primary border border-glow-primary/30 bg-glow-primary/10'
                      : 'text-glow-red border border-glow-red/30 bg-glow-red/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock3 className="w-4 h-4" />
                    <span>
                      {cf.originalFirstMa} → <strong>{cf.shiftedFirstMa}</strong> Ma
                    </span>
                  </div>
                  <p className="text-text-light text-xs mt-2 leading-relaxed">{cf.headline}</p>
                </div>
                <ol className="mt-3 space-y-1.5">
                  {cf.steps.map((st) => (
                    <li key={st.rule} className="flex gap-2 text-xs">
                      <span className={`font-mono shrink-0 ${st.passed ? 'text-glow-primary' : 'text-glow-red'}`}>
                        {st.rule} {st.passed ? '✓' : '✗'}
                      </span>
                      <span className="text-text-muted leading-relaxed">{st.detail}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[10px] text-text-muted/60 font-mono mt-2">ruleset: {cf.version}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
