import { useEffect, useState } from 'react';
import { X, FlaskConical, Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles, Ban } from 'lucide-react';
import {
  TIMELINE_CATEGORY_COLORS,
  TIMELINE_CATEGORY_LABELS,
  type CounterfactualResult,
  type Specimen,
  type TimelineEvent,
} from '../../shared/timeline';
import { timelineApi } from './api';
import { SpecimenPortrait } from './SpecimenPortrait';

interface Props {
  specimen: Specimen;
  events: TimelineEvent[]; // 关联由服务端在 relatedEventIds 给出，这里只做展示映射
  onClose: () => void;
  onJumpEvent: (t: number) => void;
}

const OUTCOME_STYLE: Record<CounterfactualResult['outcome'], { color: string; icon: typeof Sparkles; text: string }> = {
  bloom: { color: '#34d399', icon: Sparkles, text: '繁盛' },
  marginal: { color: '#fbbf24', icon: AlertTriangle, text: '边缘存续' },
  extinct: { color: '#f87171', icon: XCircle, text: '被淘汰' },
  impossible: { color: '#94a3b8', icon: Ban, text: '不成立' },
};

export function SpecimenPanel({ specimen, events, onClose, onJumpEvent }: Props) {
  const [cf, setCf] = useState<CounterfactualResult | null>(null);
  const [loadingCf, setLoadingCf] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);
  const [shift, setShift] = useState(1000);

  // 切换标本时重置反事实结果
  useEffect(() => {
    setCf(null);
    setCfError(null);
    setShift(1000);
  }, [specimen.id]);

  const runCf = async () => {
    setLoadingCf(true);
    setCfError(null);
    try {
      setCf(await timelineApi.counterfactual({ specimenId: specimen.id, earlierByMa: shift }));
    } catch (e) {
      setCfError((e as Error).message);
    } finally {
      setLoadingCf(false);
    }
  };

  const color = TIMELINE_CATEGORY_COLORS[specimen.category];
  const related = specimen.relatedEventIds
    .map((id) => events.find((e) => e.id === id))
    .filter((e): e is TimelineEvent => Boolean(e));

  return (
    <aside className="pointer-events-auto absolute right-3 top-24 z-20 w-[min(400px,calc(100vw-24px))] max-h-[calc(100vh-8.5rem)] overflow-y-auto rounded-2xl border border-glow-primary/25 bg-[#071f1b]/95 p-5 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ color, border: `1px solid ${color}66`, background: `${color}14` }}>
              {TIMELINE_CATEGORY_LABELS[specimen.category]}
            </span>
            <span className="font-mono text-[10px] text-text-muted">{specimen.code} · #{specimen.id}</span>
          </div>
          <h2 className="mt-2 font-display text-2xl text-text-light">{specimen.taxonName}</h2>
          <p className="font-mono text-xs italic text-glow-primary/80">{specimen.scientificName}</p>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 text-text-muted hover:bg-white/10 hover:text-text-light">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        <SpecimenPortrait portrait={specimen.portrait} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {specimen.portrait.features.map((f) => (
          <span key={f} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-text-muted">{f}</span>
        ))}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <Row k="首次出现" v={`${Math.abs(specimen.firstAppearT)} Ma`} />
        <Row k="存续至" v={`${Math.abs(specimen.lastAppearT)} Ma`} />
        <Row k="产出地层" v={specimen.formation} />
        <Row k="生境" v={specimen.habitat} />
        <Row k="代谢" v={specimen.metabolism} />
        <Row k="需氧门槛" v={specimen.oxygenRequirementPal === 0 ? '不依赖游离氧' : `≥ ${(specimen.oxygenRequirementPal * 100).toPrecision(2)}% PAL`} />
      </dl>

      <p className="mt-4 text-sm leading-relaxed text-text-muted">{specimen.description}</p>

      {related.length > 0 && (
        <div className="mt-4">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-glow-primary/70">关联事件（服务端）</h3>
          <div className="mt-2 space-y-1">
            {related.map((e) => (
              <button
                key={e.id}
                onClick={() => onJumpEvent(e.t)}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs hover:border-glow-primary/40"
              >
                <span className="text-text-light">{e.title}</span>
                <span className="font-mono text-text-muted">{Math.abs(e.t)} Ma</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-glow-purple/30 bg-glow-purple/5 p-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-glow-purple" />
          <h3 className="text-sm font-semibold text-text-light">反事实推演</h3>
        </div>
        <p className="mt-1 text-[11px] text-text-muted">由服务端按确定性规则（G1–G4 门 + 氧气级联）给出，前端不算结论。</p>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs text-text-muted">如果它早出现</label>
          <input
            type="number"
            min={1}
            max={3400}
            step={100}
            value={shift}
            onChange={(e) => setShift(Number(e.target.value))}
            className="w-24 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right font-mono text-sm text-glow-primary outline-none focus:border-glow-primary"
          />
          <span className="text-xs text-text-muted">百万年</span>
          <button
            onClick={runCf}
            disabled={loadingCf}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-glow-purple/50 bg-glow-purple/15 px-4 py-1.5 text-xs text-white hover:bg-glow-purple/25 disabled:opacity-50"
          >
            {loadingCf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            推演
          </button>
        </div>

        {cfError && <p className="mt-3 text-xs text-red-400">{cfError}</p>}

        {cf && <CounterfactualView cf={cf} />}
      </div>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-text-muted">{k}</dt>
      <dd className="text-right text-text-light">{v}</dd>
    </div>
  );
}

function CounterfactualView({ cf }: { cf: CounterfactualResult }) {
  const oc = OUTCOME_STYLE[cf.outcome];
  const Icon = oc.icon;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: `${oc.color}14`, border: `1px solid ${oc.color}55` }}>
        <Icon className="h-4 w-4" style={{ color: oc.color }} />
        <span className="text-sm font-semibold" style={{ color: oc.color }}>{cf.outcomeText}</span>
        <span className="ml-auto font-mono text-[10px] text-text-muted">{cf.rulesVersion}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div className="rounded-md bg-black/30 p-2">
          <div className="text-text-muted">原出现</div>
          <div className="text-text-light">{Math.abs(cf.originalFirstT)} Ma</div>
        </div>
        <div className="rounded-md bg-black/30 p-2">
          <div className="text-text-muted">假设出现</div>
          <div className="text-glow-primary">{Math.abs(cf.hypotheticalFirstT)} Ma</div>
        </div>
        <div className="col-span-2 rounded-md bg-black/30 p-2">
          <div className="text-text-muted">落点大气含氧量（服务端插值）</div>
          <div className="text-sky-300">{cf.oxygenAtArrivalPal < 0.01 ? cf.oxygenAtArrivalPal.toExponential(2) : `${(cf.oxygenAtArrivalPal * 100).toFixed(1)}%`} PAL</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {cf.gates.map((g) => (
          <div key={g.rule} className="flex gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-[11px]">
            {g.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
            <div>
              <div className="font-mono text-text-light">{g.title} <span className="text-text-muted">· {g.rule}</span></div>
              <div className="mt-0.5 leading-relaxed text-text-muted">{g.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {cf.shiftedEvents.length > 0 && (
        <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-2.5">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-cyan-300/80">氧气级联改写</div>
          {cf.shiftedEvents.map((e) => (
            <div key={e.eventId} className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-text-muted">{e.title}</span>
              <span className="text-text-light">{Math.abs(e.fromT)} → <span className="text-cyan-300">{Math.abs(e.toT)} Ma</span></span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5 border-t border-white/10 pt-2">
        {cf.narrative.map((line, i) => (
          <p key={i} className="text-[11px] leading-relaxed text-text-muted">{line}</p>
        ))}
      </div>
    </div>
  );
}
