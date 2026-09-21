import { useMemo, useState } from 'react';
import { FlaskConical, Play, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import { simulateRace, type Commit } from '../../../shared/race';

// 确定性脚本：zoom-out（gen1）慢、随后连续 zoom-in（gen2/gen3）快。
// 旧层级响应最晚回来 —— naive 模式必冲掉新图层；guarded 模式必丢弃。
const SCRIPT = [
  { gen: 1, latencyMs: 1200, range: '[-3500, 0] 全览（旧层级）' },
  { gen: 2, latencyMs: 150, range: '[-1400, -525] 放大 1' },
  { gen: 3, latencyMs: 50, range: '[-900, -550] 放大 2（当前）' },
];

interface Props {
  mode: 'naive' | 'guarded';
  running: boolean;
  onRun: () => void;
}

function Row({ c, label }: { c: Commit; label: string }) {
  const bad = c.staleOverride;
  const dropped = c.dropped;
  return (
    <tr className={`font-mono text-xs ${bad ? 'text-glow-red' : dropped ? 'text-glow-gold' : 'text-text-light'}`}>
      <td className="py-1 pr-3">gen {c.payloadGen}</td>
      <td className="py-1 pr-3">{label}</td>
      <td className="py-1 pr-3">→</td>
      <td className="py-1 pr-3">
        {dropped ? (
          <span className="text-glow-gold">丢弃 dropped（已绘图层保留）</span>
        ) : bad ? (
          <span className="text-glow-red">⚠ 旧数据提交，冲掉了 gen {c.currentGen} 新图层</span>
        ) : (
          <span className="text-glow-primary">提交 committed</span>
        )}
      </td>
    </tr>
  );
}

export function RaceLab({ mode, running, onRun }: Props) {
  const [open, setOpen] = useState(false);
  const [liveTick, setLiveTick] = useState(0);

  const naive = useMemo(
    () => simulateRace(SCRIPT.map((s) => ({ gen: s.gen, latencyMs: s.latencyMs, payload: { gen: s.gen } })), false),
    [],
  );
  const guarded = useMemo(
    () => simulateRace(SCRIPT.map((s) => ({ gen: s.gen, latencyMs: s.latencyMs, payload: { gen: s.gen } })), true),
    [],
  );

  const table = mode === 'naive' ? naive : guarded;

  return (
    <div className="glass-card p-4">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2 text-sm text-text-light font-mono">
          <FlaskConical className="w-4 h-4 text-glow-gold" />
          竞态实验室：缩放层级加载竞态的可复现对照
        </span>
        <span className="text-text-muted text-xs">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            固定脚本（纯逻辑，<code className="text-glow-primary">shared/race.ts</code>，Node 测试断言同一结果）：
            连续发出 gen1→gen2→gen3 三个层级请求，服务端延迟分别
            <span className="text-text-light"> 1200 / 150 / 50 ms</span>，于是
            <span className="text-text-light"> gen1（旧层级）最后返回</span>。
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-glow-red/25 bg-glow-red/5 p-3">
              <p className="flex items-center gap-2 text-xs text-glow-red font-mono mb-2">
                <ShieldAlert className="w-4 h-4" /> naive（裸 async，无门控）
              </p>
              <table>
                <tbody>
                  {naive.map((c, i) => <Row key={c.payloadGen} c={c} label={SCRIPT[i].range.split(' ')[0]} />)}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-glow-primary/25 bg-glow-primary/5 p-3">
              <p className="flex items-center gap-2 text-xs text-glow-primary font-mono mb-2">
                <ShieldCheck className="w-4 h-4" /> guarded（世代令牌）
              </p>
              <table>
                <tbody>
                  {guarded.map((c, i) => <Row key={c.payloadGen} c={c} label={SCRIPT[i].range.split(' ')[0]} />)}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 p-3">
            <p className="text-xs text-text-light font-mono mb-2">
              当前真实加载器：
              <span className={mode === 'naive' ? 'text-glow-red' : 'text-glow-primary'}>
                {mode === 'naive' ? ' naive' : ' guarded'}
              </span>
              <span className="text-text-muted">（用上方开关切换后，对真实服务器复现）</span>
            </p>
            <p className="text-[11px] text-text-muted mb-2">
              点下面按钮后观察画布标本图层：naive 模式会看到新图层被 1.2s 后返回的全览数据冲掉；guarded 模式日志记 dropped，图层不动。
            </p>
            <button onClick={() => { onRun(); setLiveTick((t) => t + 1); }} disabled={running} className="btn-primary-ghost text-xs">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              对真实服务器一键复现（_delay 乱序）
            </button>
            <span className="text-[10px] text-text-muted/60 font-mono ml-3">已运行 {liveTick} 次</span>
          </div>

          <pre className="text-[10px] text-text-muted bg-black/40 rounded-lg p-3 overflow-x-auto leading-relaxed">{`# 等价的 curl 复现（服务端按 _delay 睡眠）
curl '/api/timeline/window?from=-3500&to=0&_delay=1200&_tag=gen1' &
curl '/api/timeline/window?from=-1400&to=-525&_delay=150&_tag=gen2' &
curl '/api/timeline/window?from=-900&to=-550&_delay=50&_tag=gen3' &
# naive：gen1 最后落地覆盖；guarded：gen1 到达时世代已过期，丢弃`}</pre>
        </div>
      )}
    </div>
  );
}
