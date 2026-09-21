import type { Request, Response } from 'express';
import {
  evaluateCounterfactual,
  getEra,
  getIndexStats,
  getMeta,
  getSpecimen,
  getWindow,
} from '../services/TimelineService.js';
import { TIMELINE_MAX_MA, TIMELINE_MIN_MA } from '../../../shared/timeline.js';
import type { CounterfactualInput } from '../../../shared/timeline.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 5000)));

function parseMa(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export class TimelineController {
  static meta(_req: Request, res: Response) {
    res.json({ success: true, data: getMeta() });
  }

  static async window(req: Request, res: Response) {
    const from = parseMa(req.query.from);
    const to = parseMa(req.query.to);
    if (from === null || to === null) {
      return res.status(400).json({ success: false, error: 'from/to 必须是数字（Ma）' });
    }
    if (from > to) {
      return res.status(400).json({ success: false, error: `区间非法：from(${from}) > to(${to})` });
    }
    if (from < TIMELINE_MIN_MA || to > TIMELINE_MAX_MA) {
      return res.status(400).json({
        success: false,
        error: `区间越界：允许 [${TIMELINE_MIN_MA}, ${TIMELINE_MAX_MA}]`,
      });
    }
    if (to - from > 4000) {
      return res.status(400).json({ success: false, error: '窗口跨度最大 4000 Ma' });
    }

    // 复现竞态用：人工延迟（毫秒），并原样回显 _tag，方便辨认"迟到的旧响应"
    const delay = req.query._delay !== undefined ? Number(req.query._delay) : 0;
    if (Number.isFinite(delay) && delay > 0) await sleep(delay);
    const tag = typeof req.query._tag === 'string' ? req.query._tag : null;

    res.json({ success: true, data: getWindow(from, to), tag });
  }

  static era(req: Request, res: Response) {
    const at = parseMa(req.query.at);
    if (at === null) {
      return res.status(400).json({ success: false, error: 'at 必须是数字（Ma）' });
    }
    if (at < TIMELINE_MIN_MA || at > TIMELINE_MAX_MA) {
      return res.status(400).json({ success: false, error: `at 越界：允许 [${TIMELINE_MIN_MA}, ${TIMELINE_MAX_MA}]` });
    }
    res.json({ success: true, data: getEra(at) });
  }

  static specimen(req: Request, res: Response) {
    const s = getSpecimen(req.params.id);
    if (!s) return res.status(404).json({ success: false, error: '标本不存在' });
    res.json({ success: true, data: s });
  }

  static counterfactual(req: Request, res: Response) {
    const body = req.body as Partial<CounterfactualInput>;
    if (!body || typeof body.id !== 'string') {
      return res.status(400).json({ success: false, error: '缺少 id' });
    }
    if (!Number.isInteger(body.shiftMa) || (body.shiftMa as number) <= 0) {
      return res.status(400).json({ success: false, error: 'shiftMa 必须是正整数' });
    }
    const result = evaluateCounterfactual(body.id, body.shiftMa);
    if ('error' in result) return res.status(404).json({ success: false, error: result.error });
    res.json({ success: true, data: result });
  }

  static indexStats(_req: Request, res: Response) {
    res.json({ success: true, data: getIndexStats() });
  }
}
