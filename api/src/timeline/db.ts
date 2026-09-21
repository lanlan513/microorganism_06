/**
 * 时间走廊数据库：内存 SQLite，进程启动时按确定性数据集构建一次。
 *
 * 检索全部走 SQL 区间查询并命中索引；前端不允许自己筛结论。
 */
import Database from 'better-sqlite3';
import type { Database as DBType } from 'better-sqlite3';
import { generateSpecimens } from './data/generator.js';
import { TIMELINE_EVENTS, OXYGEN_NODES } from './data/events.js';
import type { Specimen, TimelineEvent } from '../../../shared/timeline.js';

let dbInstance: DBType | null = null;

interface SpecimenRow {
  id: number;
  code: string;
  first_t: number;
  last_t: number;
  category: string;
  data: string;
}

export function getDb(): DBType {
  if (dbInstance) return dbInstance;

  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  db.exec(`
    CREATE TABLE specimens (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      first_t REAL NOT NULL,
      last_t REAL NOT NULL,
      category TEXT NOT NULL,
      data TEXT NOT NULL
    );
    -- 区间检索主索引：firstAppear <= :to 走 first_t；另备 last_t 索引供双向过滤
    CREATE INDEX idx_specimens_first ON specimens(first_t);
    CREATE INDEX idx_specimens_last ON specimens(last_t);
    CREATE INDEX idx_specimens_category ON specimens(category);

    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      t REAL NOT NULL,
      t_end REAL,
      type TEXT NOT NULL,
      ord INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX idx_events_t ON events(t);

    -- 事件—标本关联（服务端资产，前端不得自造）
    CREATE TABLE specimen_events (
      specimen_id INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      ord INTEGER NOT NULL,
      PRIMARY KEY (specimen_id, event_id)
    );
    CREATE INDEX idx_se_event ON specimen_events(event_id);

    CREATE TABLE oxygen_nodes (
      t REAL PRIMARY KEY,
      pal REAL NOT NULL
    );
  `);

  const specimens = generateSpecimens();
  const insSpec = db.prepare(
    `INSERT INTO specimens (id, code, first_t, last_t, category, data) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insEvent = db.prepare(
    `INSERT INTO events (id, t, t_end, type, ord, data) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insLink = db.prepare(
    `INSERT INTO specimen_events (specimen_id, event_id, ord) VALUES (?, ?, ?)`
  );
  const insO2 = db.prepare(`INSERT INTO oxygen_nodes (t, pal) VALUES (?, ?)`);

  const tx = db.transaction((rows: Specimen[]) => {
    for (const s of rows) {
      const { id, code, firstAppearT, lastAppearT, category, relatedEventIds, ...rest } = s;
      insSpec.run(id, code, firstAppearT, lastAppearT, category, JSON.stringify(rest));
      relatedEventIds.forEach((eid, ord) => insLink.run(id, eid, ord));
    }
    TIMELINE_EVENTS.forEach((e, ord) => {
      const { id, t, tEnd, type } = e;
      insEvent.run(id, t, tEnd ?? null, type, ord, JSON.stringify(e));
    });
    for (const n of OXYGEN_NODES) insO2.run(n.t, n.pal);
  });
  tx(specimens);

  dbInstance = db;
  return db;
}

const linksStmt = () =>
  getDb().prepare(
    `SELECT event_id FROM specimen_events WHERE specimen_id = ? ORDER BY ord`
  );

function hydrate(row: SpecimenRow): Specimen {
  const partial = JSON.parse(row.data) as Omit<Specimen, 'id' | 'code' | 'firstAppearT' | 'lastAppearT' | 'category' | 'relatedEventIds'>;
  const relatedEventIds = (linksStmt().all(row.id) as { event_id: string }[]).map((r) => r.event_id);
  return {
    ...partial,
    id: row.id,
    code: row.code,
    firstAppearT: row.first_t,
    lastAppearT: row.last_t,
    category: row.category as Specimen['category'],
    relatedEventIds,
  };
}

/** 区间查询：存续区间与 [from,to] 相交（含端点）的标本，确定顺序 */
export function specimensInRange(from: number, to: number): Specimen[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM specimens
       WHERE first_t <= ? AND last_t >= ?
       ORDER BY first_t ASC, last_t ASC, code ASC`
    )
    .all(to, from) as SpecimenRow[];
  return rows.map(hydrate);
}

export function specimenById(id: number): Specimen | undefined {
  const row = getDb().prepare(`SELECT * FROM specimens WHERE id = ?`).get(id) as
    | SpecimenRow
    | undefined;
  return row ? hydrate(row) : undefined;
}

export function specimenByCode(code: string): Specimen | undefined {
  const row = getDb().prepare(`SELECT * FROM specimens WHERE code = ?`).get(code) as
    | SpecimenRow
    | undefined;
  return row ? hydrate(row) : undefined;
}

export function allSpecimens(): Specimen[] {
  const rows = getDb()
    .prepare(`SELECT * FROM specimens ORDER BY first_t ASC, last_t ASC, code ASC`)
    .all() as SpecimenRow[];
  return rows.map(hydrate);
}

/** 与窗口相交的事件（点事件看 t；持续事件看 [t,tEnd]） */
export function eventsInRange(from: number, to: number): TimelineEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT data FROM events
       WHERE t <= ? AND COALESCE(t_end, t) >= ?
       ORDER BY ord ASC`
    )
    .all(to, from) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as TimelineEvent);
}

export function allEvents(): TimelineEvent[] {
  const rows = getDb().prepare(`SELECT data FROM events ORDER BY ord ASC`).all() as
    { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as TimelineEvent);
}
