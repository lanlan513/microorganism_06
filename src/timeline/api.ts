import type {
  CounterfactualRequest,
  CounterfactualResult,
  ViewportResponse,
} from '../../shared/timeline';

export interface TimelineManifest {
  dataVersion: string;
  axis: { min: number; max: 0; spanLimits: { min: number; max: number } };
  levels: string[];
  events: import('../../shared/timeline').TimelineEvent[];
  oxygenNodes: { t: number; pal: number }[];
  countByCategory: Record<string, number>;
  totalSpecimens: number;
  checksum: string;
}

export interface ViewportParams {
  at: number;
  span: number;
  reqId?: number;
  delayMs?: number;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = await res.json();
  if (!body.success || body.data === undefined) {
    throw new Error(body.error || `请求失败 ${res.status}`);
  }
  return body.data as T;
}

export const timelineApi = {
  manifest: (): Promise<TimelineManifest> => requestJson('/api/timeline/manifest'),

  /** POST：body 可携带 reqId（代际令牌）与受控 delayMs（竞态对照） */
  viewport: (p: ViewportParams, signal?: AbortSignal): Promise<ViewportResponse> =>
    requestJson('/api/timeline/viewport', {
      method: 'POST',
      body: JSON.stringify(p),
      signal,
    }),

  specimen: (id: number): Promise<import('../../shared/timeline').Specimen> =>
    requestJson(`/api/timeline/specimen/${id}`),

  counterfactual: (
    req: CounterfactualRequest,
    signal?: AbortSignal
  ): Promise<CounterfactualResult> =>
    requestJson('/api/timeline/counterfactual', {
      method: 'POST',
      body: JSON.stringify(req),
      signal,
    }),
};
