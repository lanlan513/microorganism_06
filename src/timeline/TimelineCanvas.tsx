import { useEffect, useRef, useCallback } from 'react';
import type { Specimen, TimelineEvent } from '../../shared/timeline';
import { hitTest, renderFrame, type RenderStats } from './renderer';

interface Props {
  /** 当前已上屏数据（服务端权威窗口 + 内容）；加载中时保持旧引用 => 旧图层不被冲掉 */
  data: {
    from: number;
    to: number;
    specimens: Specimen[];
    events: TimelineEvent[];
    oxygen: { t: number; pal: number }[];
  } | null;
  dense: boolean;
  selectedId: number | null;
  hoverId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number | null) => void;
  /** 拖动/缩放落定（或节流进行中）的提交：页面层据此发新代际请求 */
  onCommit: (at: number, span: number) => void;
  onStats?: (s: RenderStats & { fps: number }) => void;
}

const SPAN_MIN = 10;
const SPAN_MAX = 3500;

export function TimelineCanvas({ data, dense, selectedId, hoverId, onHover, onSelect, onCommit, onStats }: Props) {
  const screenRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 瞬时视图（拖动 60fps 用），初始与服务端窗口对齐
  const liveRef = useRef<{ at: number; span: number } | null>(null);
  const dataRef = useRef(data);
  const metaRef = useRef({ dense, selectedId, hoverId });
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastCommitRef = useRef(0);

  dataRef.current = data;
  metaRef.current = { dense, selectedId, hoverId };

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = useCallback(() => {
    const screen = screenRef.current;
    const d = dataRef.current;
    if (!screen || !d) return;
    if (!bufferRef.current) bufferRef.current = document.createElement('canvas');
    const { w, h } = sizeRef.current;
    const live = liveRef.current;
    // 拖动中用瞬时窗口投影；落定后 live 被服务端窗口覆盖
    const half = (live?.span ?? d.to - d.from) / 2;
    const at = live?.at ?? (d.from + d.to) / 2;
    const from = at - half;
    const to = at + half;
    const stats = renderFrame(screen, bufferRef.current, {
      width: w,
      height: h,
      dpr: Math.min(2, window.devicePixelRatio || 1),
      from,
      to,
      specimens: d.specimens,
      events: d.events,
      oxygen: d.oxygen,
      dense: metaRef.current.dense,
      selectedId: metaRef.current.selectedId,
      hoverId: metaRef.current.hoverId,
    });
    if (onStats) {
      const now = performance.now();
      const frames = fpsBuf.current;
      frames.push(now);
      while (frames.length > 2 && now - frames[0] > 1000) frames.shift();
      const fps = frames.length > 1 ? Math.round(((frames.length - 1) * 1000) / (now - frames[0])) : 60;
      onStats({ ...stats, fps });
    }
  }, [onStats]);

  const fpsBuf = useRef<number[]>([]);

  // 新数据到达 / 尺寸变化 / 选择态 => 重绘
  useEffect(() => {
    // 服务端新窗口到达：瞬时态对齐到权威窗口（原子上屏由 renderer 保证）
    if (data) liveRef.current = { at: (data.from + data.to) / 2, span: data.to - data.from };
    scheduleDraw();
  }, [data, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [dense, selectedId, hoverId, scheduleDraw]);

  // 尺寸观察
  useEffect(() => {
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      scheduleDraw();
    });
    ro.observe(wrap);
    const rect = wrap.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };
    scheduleDraw();
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // 指针拖拽
  useEffect(() => {
    const screen = screenRef.current!;
    let dragging = false;
    let startX = 0;
    let startAt = 0;
    let moved = false;

    const down = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      const d = dataRef.current;
      const live = liveRef.current;
      startAt = live?.at ?? (d ? (d.from + d.to) / 2 : -1750);
      screen.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const rect = screen.getBoundingClientRect();
      if (dragging) {
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 3) moved = true;
        const d = dataRef.current;
        const { w } = sizeRef.current;
        const span = liveRef.current?.span ?? (d ? d.to - d.from : 1000);
        const deltaT = -(dx / w) * span;
        const half = span / 2;
        const raw = startAt + deltaT;
        // 本地只做硬边界夹紧用于手感；权威夹紧仍由服务端 /viewport 返回
        const at = Math.min(-half, Math.max(-3500 + half, raw));
        liveRef.current = { at, span };
        scheduleDraw();
        // 拖动途中节流提交，让新区间数据在后台按代际规则加载
        const now = performance.now();
        if (now - lastCommitRef.current > 220) {
          lastCommitRef.current = now;
          onCommit(at, span);
        }
      } else {
        // hover 命中
        const d = dataRef.current;
        if (d) {
          const live = liveRef.current;
          const half = (live?.span ?? d.to - d.from) / 2;
          const at = live?.at ?? (d.from + d.to) / 2;
          const id = hitTest(
            e.clientX - rect.left,
            e.clientY - rect.top,
            at - half,
            at + half,
            rect.width,
            rect.height,
            d.specimens
          );
          onHover(id);
          screen.style.cursor = id ? 'pointer' : 'grab';
        }
      }
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const live = liveRef.current;
      if (live) onCommit(live.at, live.span);
      if (!moved) {
        const rect = screen.getBoundingClientRect();
        const d = dataRef.current;
        if (d && live) {
          const half = live.span / 2;
          const id = hitTest(
            e.clientX - rect.left,
            e.clientY - rect.top,
            live.at - half,
            live.at + half,
            rect.width,
            rect.height,
            d.specimens
          );
          onSelect(id);
        }
      }
    };

    screen.addEventListener('pointerdown', down);
    screen.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    screen.style.cursor = 'grab';
    return () => {
      screen.removeEventListener('pointerdown', down);
      screen.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [onCommit, onHover, onSelect, scheduleDraw]);

  // 滚轮缩放（以光标处时间点为锚）
  useEffect(() => {
    const screen = screenRef.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = screen.getBoundingClientRect();
      const d = dataRef.current;
      if (!d) return;
      const live = liveRef.current ?? { at: (d.from + d.to) / 2, span: d.to - d.from };
      const cursorFrac = (e.clientX - rect.left) / rect.width;
      const tCursor = live.at - live.span / 2 + cursorFrac * live.span;
      const factor = Math.exp(e.deltaY * 0.0012);
      const newSpan = Math.min(SPAN_MAX, Math.max(SPAN_MIN, live.span * factor));
      const newAt = tCursor + (0.5 - cursorFrac) * newSpan;
      const half = newSpan / 2;
      const at = Math.min(-half, Math.max(-3500 + half, newAt));
      liveRef.current = { at, span: newSpan };
      scheduleDraw();
      onCommit(at, newSpan);
    };
    screen.addEventListener('wheel', wheel, { passive: false });
    return () => screen.removeEventListener('wheel', wheel);
  }, [onCommit, scheduleDraw]);

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-none select-none">
      <canvas ref={screenRef} className="block h-full w-full" />
    </div>
  );
}
