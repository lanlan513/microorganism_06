import type { Request, Response } from 'express';
import {
  getViewport,
  getManifest,
  counterfactual,
  getSpecimenOrError,
} from './timelineService.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 竞态对照专用：受控服务端延迟（硬上限 3000ms，防止被滥用） */
function delayOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(3000, Math.floor(n));
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const TimelineController = {
  async viewport(req: Request, res: Response) {
    try {
      const src = req.method === 'POST' ? req.body ?? {} : req.query;
      const at = num(src.at, -1750);
      const span = num(src.span, 1000);
      const reqId = num(src.reqId, NaN);
      const delay = delayOf(src.delayMs);
      if (delay) await sleep(delay);
      const data = getViewport(at, span, Number.isFinite(reqId) ? reqId : undefined);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  manifest(_req: Request, res: Response) {
    try {
      res.json({ success: true, data: getManifest() });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },

  specimen(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, error: '无效的标本 ID' });
    }
    const data = getSpecimenOrError(id);
    if (!data) return res.status(404).json({ success: false, error: '标本不存在' });
    res.json({ success: true, data });
  },

  async counterfactual(req: Request, res: Response) {
    try {
      const specimenId =
        req.method === 'POST'
          ? Number(req.body?.specimenId)
          : Number(req.params.id);
      const earlierByMaRaw =
        req.method === 'POST' ? req.body?.earlierByMa : req.query.earlierByMa;
      const earlierByMa = earlierByMaRaw !== undefined ? Number(earlierByMaRaw) : undefined;
      if (!Number.isInteger(specimenId)) {
        return res.status(400).json({ success: false, error: '无效的标本 ID' });
      }
      const result = counterfactual({
        specimenId,
        ...(earlierByMa !== undefined && Number.isFinite(earlierByMa) ? { earlierByMa } : {}),
      });
      if ('error' in result) {
        return res.status(result.status).json({ success: false, error: result.error });
      }
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },
};
