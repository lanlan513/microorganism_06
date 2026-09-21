import type {
  CounterfactualInput,
  CounterfactualResult,
  EraSnapshot,
  Specimen,
  TimelineMeta,
  TimelineWindow,
} from '../../shared/timeline';
import type { Ma } from '../../shared/timeline';
import type { ApiResponse } from '../../shared/types';

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json()) as ApiResponse<T> & { tag?: string | null };
  if (!res.ok || !body.success || body.data === undefined) {
    throw new Error(body.error || `请求失败 ${res.status}`);
  }
  return body.data;
}

export interface WindowOptions {
  signal?: AbortSignal;
  /** 人工服务端延迟（ms），竞态对照复现用 */
  delayMs?: number;
  tag?: string;
}

export const timelineApi = {
  getMeta: () => request<TimelineMeta>('/timeline/meta'),

  async getWindow(fromMa: Ma, toMa: Ma, opts: WindowOptions = {}): Promise<TimelineWindow> {
    const q = new URLSearchParams({ from: String(fromMa), to: String(toMa) });
    if (opts.delayMs) q.set('_delay', String(opts.delayMs));
    if (opts.tag) q.set('_tag', opts.tag);
    const res = await fetch(`/api/timeline/window?${q.toString()}`, { signal: opts.signal });
    if (!res.ok) throw new Error((await res.json()).error || '窗口查询失败');
    const body = (await res.json()) as ApiResponse<TimelineWindow>;
    if (!body.data) throw new Error('窗口查询无数据');
    return body.data;
  },

  getEra: (atMa: Ma) => request<EraSnapshot>(`/timeline/era?at=${atMa}`),
  getSpecimen: (id: string) => request<Specimen>(`/timeline/specimen/${id}`),
  counterfactual: (input: CounterfactualInput) =>
    request<CounterfactualResult>('/timeline/counterfactual', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
