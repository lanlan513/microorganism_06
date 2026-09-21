import { useEffect, useRef } from 'react';
import type { GeoEvent, Ma, Specimen, TimelineMeta, TimelineWindow } from '../../shared/timeline';
import {
  GROUP_COLORS,
  maToX,
  TIMELINE_MAX_MA,
  TIMELINE_MIN_MA,
  xToMa,
} from '../../shared/timeline';
import { chooseTickStep, formatMa, tickMarks, visibleRange } from '../../shared/ticks';
import { bucketFor } from '../hooks/useTimeline';

interface Props {
  meta: TimelineMeta | null;
  windowData: TimelineWindow | null;
  atMa: Ma;
  ppm: number;
  loading: boolean;
  onView: (v: { atMa?: Ma; ppm?: number }) => void;
  onSelect: (id: string) => void;
}

const EVENT_COLORS: Record<GeoEvent['kind'], string> = {
  oxygenation: '#4cc9f0',
  glaciation: '#9ec5fe',
  extinction: '#ff5a5a',
  milestone: '#f1c40f',
};

const EVENT_SHORT: Record<GeoEvent['kind'], string> = {
  oxygenation: 'O₂',
  glaciation: '冰',
  extinction: '灭',
  milestone: '★',
};

interface HoverState {
  id: string | null;
  pointerMa: Ma | null;
}

export function TimelineCanvas({ meta, windowData, atMa, ppm, loading, onView, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 每帧读取最新 props，不在 rAF 里触发 React 渲染
  const stateRef = useRef({ meta, windowData, atMa, ppm, loading });
  stateRef.current = { meta, windowData, atMa, ppm, loading };
  const viewRef = useRef(onView);
  viewRef.current = onView;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const hoverRef = useRef<HoverState>({ id: null, pointerMa: null });
  const sizeRef = useRef({ w: 900, h: 480, dpr: 1 });
  const fpsRef = useRef({ frames: 0, last: performance.now(), fps: 60, tickCount: 0 });

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let raf = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: rect.width, h: 480, dpr };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(480 * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = '480px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // —— 指针交互：拖拽平移 / 滚轮缩放（以光标为锚点）/ 点选标本 ——
    const drag = { active: false, moved: false, startX: 0, startAt: 0, downId: null as string | null };

    const hitTest = (px: number, py: number): Specimen | null => {
      const s = stateRef.current;
      if (!s.windowData) return null;
      const { w, h } = sizeRef.current;
      const trackTop = 92;
      const trackBottom = h - 84;
      const maxLane = Math.max(0, ...s.windowData.specimens.map((x) => x.lane));
      const laneH = Math.min(17, (trackBottom - trackTop) / (maxLane + 1));
      for (const sp of s.windowData.specimens) {
        const x1 = maToX(sp.firstMa, s.ppm, s.atMa, w);
        const x2 = maToX(sp.lastMa, s.ppm, s.atMa, w);
        const y = trackTop + sp.lane * (laneH + 4);
        if (px >= x1 - 2 && px <= x2 + 2 && py >= y - 2 && py <= y + laneH + 2) return sp;
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      drag.active = true;
      drag.moved = false;
      drag.startX = px;
      drag.startAt = stateRef.current.atMa;
      drag.downId = hitTest(px, py)?.id ?? null;
      canvas.setPointerCapture(e.pointerId);
    };

    const onMovePointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { w } = sizeRef.current;
      const s = stateRef.current;
      hoverRef.current.pointerMa = xToMa(px, s.ppm, s.atMa, w);
      if (drag.active) {
        const dx = px - drag.startX;
        if (Math.abs(dx) > 4) drag.moved = true;
        const nextAt = drag.startAt - dx * s.ppm;
        viewRef.current({ atMa: Math.min(TIMELINE_MAX_MA, Math.max(TIMELINE_MIN_MA, nextAt)) });
      } else {
        const hit = hitTest(px, py);
        hoverRef.current.id = hit?.id ?? null;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    };

    const onUp = (e: PointerEvent) => {
      if (drag.active && !drag.moved && drag.downId) selectRef.current(drag.downId);
      drag.active = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const onLeave = () => {
      hoverRef.current.pointerMa = null;
      hoverRef.current.id = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const s = stateRef.current;
      const { w } = sizeRef.current;
      const anchorMa = xToMa(px, s.ppm, s.atMa, w);
      const factor = Math.exp(e.deltaY * 0.0012);
      const nextPpm = Math.min(20, Math.max(0.05, s.ppm * factor));
      // 保持光标所指的 Ma 不动：anchor = at' + (px - w/2) * ppm'
      const nextAt = anchorMa - (px - w / 2) * nextPpm;
      viewRef.current({
        ppm: nextPpm,
        atMa: Math.min(TIMELINE_MAX_MA, Math.max(TIMELINE_MIN_MA, nextAt)),
      });
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMovePointer);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // —— 绘制 ——
    const draw = () => {
      const { w, h, dpr } = sizeRef.current;
      const s = stateRef.current;
      const now = performance.now();
      const f = fpsRef.current;
      f.frames++;
      if (now - f.last >= 500) {
        f.fps = Math.round((f.frames * 1000) / (now - f.last));
        f.frames = 0;
        f.last = now;
      }

      ctx.fillStyle = '#081a18';
      ctx.fillRect(0, 0, w, h);

      const x = (ma: Ma) => maToX(ma, s.ppm, s.atMa, w);
      const vr = visibleRange(s.atMa, s.ppm, w, 200);

      // 图层 1：年代带（meta，服务端真源，永不随窗口加载闪烁）
      if (s.meta) {
        for (const b of s.meta.bands) {
          if (b.toMa < vr.from || b.fromMa > vr.to) continue;
          const bx1 = Math.max(0, x(b.fromMa));
          const bx2 = Math.min(w, x(b.toMa));
          ctx.fillStyle = b.eon === '太古宙' ? 'rgba(241,196,15,0.05)'
            : b.eon === '元古宙' ? 'rgba(155,89,182,0.06)'
              : 'rgba(0,255,200,0.05)';
          ctx.fillRect(bx1, 0, bx2 - bx1, 30);
          ctx.strokeStyle = 'rgba(255,255,255,0.10)';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx1 + 0.5, 0.5, bx2 - bx1 - 1, 29);
          if (bx2 - bx1 > 60) {
            ctx.fillStyle = 'rgba(232,245,242,0.65)';
            ctx.font = '11px "JetBrains Mono", monospace';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.period ?? b.era, bx1 + 6, 15);
          }
        }
        // 宙标签
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        for (const [from, to, label, color] of [
          [-3500, -2500, '太古宙', 'rgba(241,196,15,0.8)'],
          [-2500, -538.7, '元古宙', 'rgba(201,151,231,0.85)'],
          [-538.7, 0, '显生宙', 'rgba(0,255,200,0.85)'],
        ] as const) {
          const cx = (x(Math.max(from, vr.from)) + x(Math.min(to, vr.to))) / 2;
          if (cx > 30 && cx < w - 30) {
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.fillText(label, cx, 46);
          }
        }
        ctx.textAlign = 'left';
      }

      // 图层 2：氧曲线（底部 56px 带状图，log 标度；阈值虚线标注 GOE 量级）
      const oxyTop = h - 78;
      const oxyBottom = h - 30;
      if (s.meta) {
        ctx.fillStyle = 'rgba(76,201,240,0.05)';
        ctx.fillRect(0, oxyTop, w, oxyBottom - oxyTop);
        const palY = (pal: number) => {
          const t = (Math.log10(Math.max(pal, 0.0001)) + 4) / (Math.log10(200) + 4);
          return oxyBottom - t * (oxyBottom - oxyTop);
        };
        // 阈值线
        for (const [pal, label] of [[0.001, '无氧'], [2, 'GOE ~2%'], [100, '现代 100%']] as const) {
          const y = palY(pal);
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, 4, y - 1);
        }
        const pts = s.meta.oxygen;
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (p.ma < vr.from || p.ma > vr.to) {
            if (started) {
              // 钳到边缘以连续填充
            }
          }
          const px = x(p.ma);
          const py = palY(p.pal);
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = '#4cc9f0';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // 图层 3：网格 + 刻度（Path2D 批量描线，千格一次提交）
      const step = chooseTickStep(s.ppm, 112);
      const divisions = s.ppm <= 0.12 ? 10 : 5;
      const ticks = tickMarks(vr.from, vr.to, step, divisions);
      f.tickCount = ticks.length;
      const minorPath = new Path2D();
      const majorPath = new Path2D();
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      for (const t of ticks) {
        const px = x(t.ma);
        const path = t.kind === 'major' ? majorPath : minorPath;
        path.moveTo(px, 0);
        path.lineTo(px, h);
        if (t.kind === 'major') {
          ctx.fillStyle = 'rgba(232,245,242,0.7)';
          const label = formatMa(t.ma);
          ctx.fillText(label, Math.min(w - 78, Math.max(2, px - 30)), h - 22);
        }
      }
      ctx.strokeStyle = 'rgba(0,255,200,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke(minorPath);
      ctx.strokeStyle = 'rgba(0,255,200,0.28)';
      ctx.stroke(majorPath);

      // 图层 4：事件（meta 真源）
      if (s.meta) {
        for (const e of s.meta.events) {
          if (e.untilMa !== undefined) {
            const x1 = x(e.atMa);
            const x2 = x(e.untilMa);
            if (x2 < 0 || x1 > w) continue;
            ctx.fillStyle = `${EVENT_COLORS[e.kind]}1f`;
            ctx.fillRect(Math.max(0, x1), 58, Math.min(w, x2) - Math.max(0, x1), 26);
            ctx.strokeStyle = `${EVENT_COLORS[e.kind]}88`;
            ctx.strokeRect(Math.max(0, x1) + 0.5, 58.5, Math.min(w, x2) - Math.max(0, x1) - 1, 25);
          }
          const px = x(e.atMa);
          if (px < -40 || px > w + 40) continue;
          ctx.strokeStyle = `${EVENT_COLORS[e.kind]}aa`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(px, 58);
          ctx.lineTo(px, h - 80);
          ctx.stroke();
          ctx.setLineDash([]);
          // 标记头
          ctx.fillStyle = EVENT_COLORS[e.kind];
          ctx.beginPath();
          ctx.moveTo(px, 58);
          ctx.lineTo(px - 6, 66);
          ctx.lineTo(px + 6, 66);
          ctx.closePath();
          ctx.fill();
          const crowded = s.ppm > 0.3;
          const label = crowded ? EVENT_SHORT[e.kind] : e.label;
          if (!crowded || px > 30 && px < w - 30) {
            ctx.save();
            ctx.translate(px, 86);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = `${EVENT_COLORS[e.kind]}ee`;
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 4, 0);
            ctx.restore();
          }
        }
      }

      // 图层 5：标本（服务端窗口图层 —— 竞态演练时它是唯一会被冲掉的层）
      const trackTop = 92;
      const trackBottom = h - 84;
      const wd = s.windowData;
      if (wd) {
        const maxLane = Math.max(0, ...wd.specimens.map((sp) => sp.lane));
        const laneH = Math.min(17, (trackBottom - trackTop) / (maxLane + 1));
        for (const sp of wd.specimens) {
          const x1 = x(sp.firstMa);
          const x2 = x(Math.max(sp.lastMa, sp.firstMa + s.ppm * 4));
          const bx1 = Math.max(0, x1);
          const bx2 = Math.min(w, x2);
          if (bx2 < 0 || bx1 > w) continue;
          const y = trackTop + sp.lane * (laneH + 4);
          const color = GROUP_COLORS[sp.group];
          const isHover = hoverRef.current.id === sp.id;
          const isLiving = sp.lastMa === 0;
          ctx.globalAlpha = isHover ? 1 : 0.85;
          ctx.fillStyle = `${color}26`;
          ctx.strokeStyle = color;
          ctx.lineWidth = isHover ? 1.8 : 1;
          const r = Math.min(5, (bx2 - bx1) / 2);
          ctx.beginPath();
          ctx.roundRect(bx1, y, Math.max(3, bx2 - bx1), laneH, r);
          ctx.fill();
          ctx.stroke();
          if (isLiving && x2 < w) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x2, y + laneH / 2 - 4);
            ctx.lineTo(x2 + 8, y + laneH / 2);
            ctx.lineTo(x2, y + laneH / 2 + 4);
            ctx.closePath();
            ctx.fill();
          }
          if (bx2 - bx1 > 44) {
            ctx.fillStyle = 'rgba(232,245,242,0.92)';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            const name = sp.name;
            const maxW = bx2 - bx1 - 8;
            let txt = name;
            while (ctx.measureText(txt).width > maxW && txt.length > 1) txt = txt.slice(0, -1);
            ctx.fillText(txt === name ? name : `${txt.slice(0, -1)}…`, bx1 + 4, y + laneH / 2 + 0.5);
          }
          ctx.globalAlpha = 1;
        }
      } else {
        // 旧图层为空时的占位提示（guarded 模式下旧图层在，所以不会闪这一层）
        ctx.fillStyle = 'rgba(232,245,242,0.35)';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.loading ? '正在请求服务端窗口图层…' : '该图层暂无数据', w / 2, (trackTop + trackBottom) / 2);
        ctx.textAlign = 'left';
      }

      // 图层 6：中心游标（当前视图时间点，分享链接 at= 的位置）
      const cx = w / 2;
      ctx.strokeStyle = 'rgba(0,255,200,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
      ctx.fillStyle = '#00ffc8';
      ctx.beginPath();
      ctx.moveTo(cx - 7, 0);
      ctx.lineTo(cx + 7, 0);
      ctx.lineTo(cx, 9);
      ctx.closePath();
      ctx.fill();

      // hover 时间竖线与标签
      if (hoverRef.current.pointerMa !== null && !drag.active) {
        const px = x(hoverRef.current.pointerMa);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // HUD：fps / 刻度数 / 分层 / 集合哈希（服务端返回）
      const bucket = bucketFor(s.atMa, s.ppm);
      ctx.fillStyle = 'rgba(8,26,24,0.75)';
      ctx.fillRect(8, 54, 232, 34);
      ctx.strokeStyle = 'rgba(0,255,200,0.25)';
      ctx.strokeRect(8.5, 54.5, 231, 33);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = f.fps >= 55 ? '#00ffc8' : f.fps >= 30 ? '#f1c40f' : '#ff5a5a';
      ctx.fillText(`${f.fps} fps`, 14, 60);
      ctx.fillStyle = 'rgba(232,245,242,0.7)';
      ctx.fillText(`刻度 ${f.tickCount} · 层 ${bucket.key} · ppm ${s.ppm.toFixed(3)}`, 62, 60);
      ctx.fillStyle = wd ? 'rgba(232,245,242,0.55)' : 'rgba(255,90,90,0.7)';
      ctx.fillText(
        wd ? `标本 ${wd.count} · hash ${wd.hash}` : '标本图层未提交',
        14, 74,
      );

      // 加载指示（不清空图层）
      if (s.loading) {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(w - 18, 66, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(241,196,15,0.9)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('加载中…（已绘图层保留）', w - 28, 66);
        ctx.textAlign = 'left';
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMovePointer);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas ref={canvasRef} className="w-full rounded-xl border border-glow-primary/20 touch-none select-none" />
    </div>
  );
}
