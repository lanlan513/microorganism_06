import { Router } from 'express';
import { MicrobeController } from '../src/controllers/MicrobeController.js';
import { TimelineController } from '../src/controllers/TimelineController.js';

const router = Router();

// —— 既有微生物馆接口 ——
router.get('/microbes', MicrobeController.getAll);
router.get('/microbes/stats', MicrobeController.getStats);
router.get('/microbes/category/:category', MicrobeController.getByCategory);
router.get('/microbes/:id', MicrobeController.getById);
router.get('/microbes/:id/related', MicrobeController.getRelated);
router.get('/stats', MicrobeController.getStats);

// —— 三十五亿年时间走廊（事实结论只在服务端产生） ——
router.get('/timeline/meta', TimelineController.meta);
router.get('/timeline/window', TimelineController.window);
router.get('/timeline/era', TimelineController.era);
router.get('/timeline/specimen/:id', TimelineController.specimen);
router.post('/timeline/counterfactual', TimelineController.counterfactual);
router.get('/timeline/index-stats', TimelineController.indexStats);

export default router;
