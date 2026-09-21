import { Router } from 'express';
import { TimelineController } from '../src/timeline/timelineController.js';
const router = Router();

// 静态清单（事件/氧节点/层级/全量 checksum）
router.get('/timeline/manifest', TimelineController.manifest);

// 窗口区间查询（服务端索引 + 夹紧，前端不自算结论）
router.get('/timeline/viewport', TimelineController.viewport);
router.post('/timeline/viewport', TimelineController.viewport);

// 标本详情（「当时的模样」）
router.get('/timeline/specimen/:id(\\d+)', TimelineController.specimen);

// 反事实推演
router.get('/timeline/specimen/:id(\\d+)/counterfactual', TimelineController.counterfactual);
router.post('/timeline/counterfactual', TimelineController.counterfactual);

export default router;
