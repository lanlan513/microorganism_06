/**
 * 确定性标本生成器（纯函数，无外部状态）。
 *
 * 输出可复现：同 dataVersion 下，任何进程生成同一组标本与同一份事件关联。
 */
import {
  type PortraitSpec,
  type Specimen,
} from '../../../../shared/timeline.js';
import {
  mulberry32,
  hashString,
} from './prng.js';
import { ARCHETYPES, type Archetype } from './archetypes.js';
import { TIMELINE_EVENTS } from './events.js';

/** 供「病毒需要宿主先存在」类规则使用：每个分类的最早出现时刻（Ma） */
export function categoryFirstAppearance(): Record<string, number> {
  const out: Record<string, number> = {
    bacteria: -3500,
    stromatolite: -3500,
    archaea: -3300,
    cyanobacteria: -2700,
    eukarya: -1800,
    fungi: -450,
    virus: -3000,
  };
  for (const a of ARCHETYPES) {
    out[a.category] = Math.min(out[a.category] ?? 0, a.span[0]);
  }
  return out;
}

function makePortrait(a: Archetype, code: string, r: () => number): PortraitSpec {
  const sizeUm = Math.round(a.sizeUm * (0.8 + r() * 0.4) * 100) / 100;
  const features = [...a.featurePool];
  // 由固定 PRNG 决定特征次序与第 4 个附加特征，保证跨进程一致
  for (let i = features.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [features[i], features[j]] = [features[j], features[i]];
  }
  const extras = ['群体胶被', '表面附着痕', '矿化包壳', '暗色内含物', '微弱荧光'];
  return {
    seed: hashString(code),
    shape: a.shape,
    color: a.color,
    sizeUm,
    membrane: a.membrane,
    features: [...features.slice(0, 3), extras[Math.floor(r() * extras.length)]],
  };
}

function eventIdsFor(first: number, last: number, a: Archetype): string[] {
  const ids = new Set<string>();
  for (const e of TIMELINE_EVENTS) {
    const eStart = e.t;
    const eEnd = e.tEnd ?? e.t;
    // 规则 1：事件起点落在标本存续区间内
    if (eStart >= first && eStart <= last) ids.add(e.id);
    // 规则 2：持续型事件与存续区间相交
    if (eEnd !== eStart && !(eEnd < first || eStart > last)) ids.add(e.id);
    // 规则 3：生命起源带的标本统一关联最早生命事件
    if (e.id === 'EV-LIFE' && first <= -3300) ids.add(e.id);
    // 规则 4：产氧类在 GOE 及之前出现者，关联产氧光合作用事件
    if (e.id === 'EV-OXY-PHOTO' && a.oxygenic && first <= -2700) ids.add(e.id);
  }
  // 按事件表顺序输出（TIMELINE_EVENTS 本身按 t 升序）
  return TIMELINE_EVENTS.map((e) => e.id).filter((id) => ids.has(id));
}

interface RawSpecimen extends Specimen {
  archetypeIdx: number;
  ordinal: number;
}

/** 生成全部标本（未排序）。 */
export function generateSpecimens(): Specimen[] {
  const raws: RawSpecimen[] = [];

  ARCHETYPES.forEach((a, archetypeIdx) => {
    const [spanStart, spanEnd] = a.span;
    for (let ordinal = 0; ordinal < a.count; ordinal++) {
      // 每个标本独立的固定随机源：种子由原型序号+序号决定
      const r = mulberry32((Math.imul(archetypeIdx + 1, 0x9e3779b1) ^ Math.imul(ordinal + 1, 0x85ebca77)) >>> 0);
      const first = Math.round((spanStart + r() * a.jitter) * 10) / 10;
      const dur = Math.round((a.durLo + r() * (a.durHi - a.durLo)) * 10) / 10;
      let last = Math.round((first + dur) * 10) / 10;
      last = Math.min(last, spanEnd + r() * a.jitter, 0);
      const formation = a.formations[Math.floor(r() * a.formations.length)];
      const code = `SP-${String(archetypeIdx + 1).padStart(2, '0')}-${String(ordinal + 1).padStart(4, '0')}`;
      raws.push({
        archetypeIdx,
        ordinal,
        id: -1,
        code,
        taxonName: a.taxonName,
        scientificName: a.scientificName,
        category: a.category,
        firstAppearT: first,
        lastAppearT: last,
        formation,
        habitat: a.habitat,
        metabolism: a.metabolism,
        oxygenic: a.oxygenic,
        anaerobic: a.anaerobic,
        oxygenRequirementPal: a.oxygenReq,
        description: a.description,
        portrait: makePortrait(a, code, mulberry32(hashString(code) ^ 0x1234abcd)),
        relatedEventIds: [],
        ...(a.hostCategory ? { hostCategory: a.hostCategory } : {}),
      });
    }
  });

  // 稳定排序后顺序分配 id —— id 只是服务端排序的投影，不参与检索
  raws.sort((x, y) =>
    x.firstAppearT - y.firstAppearT ||
    x.lastAppearT - y.lastAppearT ||
    x.code.localeCompare(y.code));

  return raws.map((raw, i) => {
    const a = ARCHETYPES[raw.archetypeIdx];
    const relatedEventIds = eventIdsFor(raw.firstAppearT, raw.lastAppearT, a);
    const { archetypeIdx: _ai, ordinal: _o, ...rest } = raw;
    void _ai; void _o;
    return {
      ...rest,
      id: i + 1,
      relatedEventIds,
    };
  });
}
