/**
 * 时间轴事件与氧气曲线（固定、确定性）。
 * t 单位 Ma（负 = 过去）。
 */
import type { TimelineEvent } from '../../../../shared/timeline.js';

export const TIMELINE_EVENTS: TimelineEvent[] = [
  { id: 'EV-LIFE', t: -3500, type: 'first-life', title: '最早的生命迹象', titleEn: 'Earliest life', description: '皮尔巴拉克拉通的碳同位素与疑似叠层石，指向已能分裂与代谢的单细胞生命。' },
  { id: 'EV-MATS', t: -3480, type: 'first-life', title: '微生物席与叠层石', titleEn: 'Microbial mats', description: '微生物席在浅海铺开，形成最早的层状构造生态系统。' },
  { id: 'EV-ANOX-PHOTO', t: -3400, type: 'evolution', title: '不产氧光合作用', titleEn: 'Anoxygenic photosynthesis', description: '利用硫化氢与铁的光合反应出现，太阳还没给大气制造氧气。' },
  { id: 'EV-ARCHAEA', t: -3200, type: 'evolution', title: '产甲烷古菌兴起', titleEn: 'Methanogenic archaea', description: '古菌在热泉与厌氧环境中扩张，甲烷成为早期温室气体主力。' },
  { id: 'EV-OXY-PHOTO', t: -2700, type: 'evolution', title: '产氧光合作用出现', titleEn: 'Oxygenic photosynthesis', description: '蓝细菌演化出以水为电子供体的光合系统，氧气第一次作为废物被排出。' },
  { id: 'EV-GOE', t: -2400, tEnd: -2100, type: 'oxygen', title: '大氧化事件', titleEn: 'Great Oxidation Event', description: '海洋还原缓冲被耗尽，游离氧冲入大气，从近零跃升至约 1% PAL；厌氧生物大规模退守。' },
  { id: 'EV-HURONIAN', t: -2400, tEnd: -2100, type: 'glaciation', title: '休伦大冰期', titleEn: 'Huronian glaciation', description: '甲烷被氧化削弱温室效应，地球经历最早的漫长冰期，可能多次低纬度冰封。' },
  { id: 'EV-LECA', t: -1800, type: 'evolution', title: '最后共同真核祖先', titleEn: 'LECA', description: '内共生造就线粒体，真核细胞诞生；部分支系再吞入蓝细菌形成叶绿体。' },
  { id: 'EV-BORING', t: -1800, tEnd: -800, type: 'evolution', title: '枯燥的十亿年', titleEn: 'Boring Billion', description: '氧气长期低位、海洋大面积缺氧硫化，真核微生物有但世界变化缓慢。' },
  { id: 'EV-SNOWBALL', t: -720, tEnd: -635, type: 'glaciation', title: '雪球地球', titleEn: 'Snowball Earth', description: '斯图特与马里诺冰期让冰川抵达赤道，生命瓶颈与随后的快速反弹并存。' },
  { id: 'EV-NEOP-O2', t: -600, type: 'oxygen', title: '新元古代第二次增氧', titleEn: 'Neoproterozoic oxygenation', description: '深海氧化与藻类繁盛，氧气升至数个百分点，为复杂生命铺路。' },
  { id: 'EV-EDIACARA', t: -570, type: 'evolution', title: '埃迪卡拉生物群', titleEn: 'Ediacaran biota', description: '最早的大型多细胞软体生物群，多在寒武纪前消失。' },
  { id: 'EV-CAMBRIAN', t: -541, type: 'evolution', title: '寒武纪大爆发', titleEn: 'Cambrian explosion', description: '绝大多数现生动物门类在短短两千万年内出现。' },
  { id: 'EV-LAND', t: -470, type: 'evolution', title: '生物登陆', titleEn: 'Land colonization', description: '隐孢子与地衣状微生物先于维管植物登上陆地。' },
  { id: 'EV-EXT-ORDOVICIAN', t: -443, type: 'extinction', title: '奥陶纪末大灭绝', titleEn: 'Late Ordovician extinction', severity: 4, description: '冰期与海退交替，约 85% 海洋物种消失。Big Five 之一。' },
  { id: 'EV-EXT-DEVONIAN', t: -372, tEnd: -359, type: 'extinction', title: '泥盆纪晚期大灭绝', titleEn: 'Late Devonian extinction', severity: 4, description: '脉冲式海洋缺氧，约 75% 物种消失；珊瑚礁系统重创。Big Five 之一。' },
  { id: 'EV-EXT-PERMIAN', t: -252, type: 'extinction', title: '二叠纪末大灭绝', titleEn: 'End-Permian extinction', severity: 5, description: '西伯利亚暗色岩喷发引发温室与海洋酸化缺氧，约 96% 海洋物种消失，为规模最大的一次。' },
  { id: 'EV-EXT-TRIASSIC', t: -201, type: 'extinction', title: '三叠纪末大灭绝', titleEn: 'End-Triassic extinction', severity: 3, description: '中央大西洋岩浆省活动，约 80% 物种消失，恐龙随后接管陆地。' },
  { id: 'EV-EXT-KPG', t: -66, type: 'extinction', title: '白垩纪末大灭绝', titleEn: 'Cretaceous–Paleogene extinction', severity: 5, description: '希克苏鲁伯撞击与德干暗色岩叠加，非鸟恐龙灭绝，约 76% 物种消失。' },
  { id: 'EV-TODAY', t: 0, type: 'present', title: '今天', titleEn: 'Present', description: '现代微生物世界：细菌、古菌、真菌、病毒与我们共享这颗星球。' },
];

/** 氧气曲线节点（PAL = 相对现代大气氧分压） */
export const OXYGEN_NODES: { t: number; pal: number }[] = [
  { t: -3500, pal: 0.000001 },
  { t: -2700, pal: 0.00001 },
  { t: -2450, pal: 0.00002 },
  { t: -2400, pal: 0.002 },
  { t: -2100, pal: 0.015 },
  { t: -1800, pal: 0.008 },
  { t: -1000, pal: 0.01 },
  { t: -800, pal: 0.008 },
  { t: -635, pal: 0.02 },
  { t: -550, pal: 0.08 },
  { t: -500, pal: 0.15 },
  { t: -400, pal: 0.2 },
  { t: -300, pal: 0.3 },
  { t: -250, pal: 0.23 },
  { t: -200, pal: 0.19 },
  { t: -150, pal: 0.21 },
  { t: -100, pal: 0.21 },
  { t: -66, pal: 0.19 },
  { t: -50, pal: 0.21 },
  { t: 0, pal: 0.21 },
];

/** 确定性氧含量插值：log10(PAL) 分段线性 */
export function oxygenAt(t: number): number {
  const n = OXYGEN_NODES;
  if (t <= n[0].t) return n[0].pal;
  if (t >= n[n.length - 1].t) return n[n.length - 1].pal;
  let i = 0;
  while (i < n.length - 1 && t > n[i + 1].t) i++;
  const a = n[i];
  const b = n[i + 1];
  const f = (t - a.t) / (b.t - a.t);
  const lv = Math.log10(a.pal) + (Math.log10(b.pal) - Math.log10(a.pal)) * f;
  return Math.pow(10, lv);
}
