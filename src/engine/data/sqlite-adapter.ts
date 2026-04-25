// ─── SqliteDataAdapter — proper column-based SQLite storage ───
// Uses sql.js (WASM SQLite) for zero-native-dependency persistence.
// Each entity is stored in its own table with proper columns derived from EntityDefinition.

import type { Entity, SearchResult, EntityFieldDefinition } from './types.js';
import type { Criteria, CriteriaFilter, CriteriaSorting } from './criteria.js';
import type { DataAdapter } from './data-adapter.js';
import { getEntityDefinition, subscribeEntityRegistry } from './entity-registry.js';

// sql.js types
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

// ─── Field type → SQL type mapping ─────────────────────

function fieldTypeToSql(field: EntityFieldDefinition): string {
  switch (field.type) {
    case 'uuid':
    case 'string':
    case 'text':
    case 'datetime':
      return 'TEXT';
    case 'boolean':
    case 'integer':
      return 'INTEGER';
    case 'float':
      return 'REAL';
    case 'json':
      return 'TEXT'; // stored as JSON string
    default:
      return 'TEXT';
  }
}

function buildColumnDef(field: EntityFieldDefinition): string {
  let col = `"${field.name}" ${fieldTypeToSql(field)}`;
  if (field.primary) col += ' PRIMARY KEY';
  if (field.required && !field.primary) col += ' NOT NULL';
  return col;
}

// ─── Value serialization/deserialization ─────────────────

function serializeValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  switch (fieldType) {
    case 'json':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 1 : 0;
    default:
      return value;
  }
}

function deserializeValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined) return null;
  switch (fieldType) {
    case 'json':
      try { return JSON.parse(value as string); } catch { return null; }
    case 'boolean':
      return value === 1 || value === true;
    default:
      return value;
  }
}

/**
 * SQLite DataAdapter with proper column-based schema.
 *
 * - Tables use entity name directly (no extra prefix)
 * - Columns are derived from EntityDefinition.defineFields()
 * - Falls back to generic (id, data_json) for entities without a registered definition
 * - Criteria filtering uses JS evaluation for full Shopware Criteria compatibility
 */
export class SqliteDataAdapter implements DataAdapter {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private fs: typeof import('fs') | null = null;
  private initialized = false;
  private initPromise: Promise<void>;
  private tableSchemaCache = new Map<string, EntityFieldDefinition[]>();
  private unsubscribeRegistry: (() => void) | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.initPromise = this._init();
    this.unsubscribeRegistry = subscribeEntityRegistry((event) => {
      this.tableSchemaCache.delete(event.entity);
    });
  }

  /** Wait for async WASM initialization to complete. Must be called before seed(). */
  async ready(): Promise<void> {
    if (!this.initialized) await this.initPromise;
  }

  private async _init(): Promise<void> {
    const initSqlJs = (await import('sql.js')).default;
    const fs = await import('fs');
    const path = await import('path');
    this.fs = fs;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let SQL: SqlJsStatic;
    try {
      SQL = await initSqlJs();
    } catch {
      SQL = await (initSqlJs as any)();
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initialized = true;
  }

  private async ensureReady(): Promise<void> {
    if (!this.initialized) await this.initPromise;
  }

  // ─── Schema helpers ─────────────────────────────────────

  private getFields(entityName: string): EntityFieldDefinition[] | null {
    if (this.tableSchemaCache.has(entityName)) {
      return this.tableSchemaCache.get(entityName)!;
    }
    const def = getEntityDefinition(entityName);
    if (def && def.fields.length > 0) {
      this.tableSchemaCache.set(entityName, def.fields);
      return def.fields;
    }
    return null;
  }

  private getFieldMap(entityName: string): Map<string, EntityFieldDefinition> {
    const fields = this.getFields(entityName) ?? [];
    return new Map(fields.map((field) => [field.name, field]));
  }

  private ensureTable(entityName: string): void {
    const fields = this.getFields(entityName);
    if (fields) {
      // Proper column-based table from EntityDefinition
      const columns = fields.map((f) => buildColumnDef(f)).join(', ');
      this.db.run(`CREATE TABLE IF NOT EXISTS "${entityName}" (${columns})`);
    } else {
      // Fallback: generic JSON storage for unregistered entities
      this.db.run(`CREATE TABLE IF NOT EXISTS "${entityName}" (id TEXT PRIMARY KEY, data_json TEXT NOT NULL)`);
    }
  }

  private persist(): void {
    if (!this.fs) return;
    try {
      const data = this.db.export();
      this.fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (e) {
      console.warn('[SqliteDataAdapter] persist failed:', e);
    }
  }

  // ─── Row ↔ Entity conversion ────────────────────────────

  private rowToEntity<T extends Entity>(entityName: string, columns: string[], row: unknown[]): T {
    const fields = this.getFields(entityName);
    if (!fields) {
      // Fallback: JSON blob
      const dataIdx = columns.indexOf('data_json');
      if (dataIdx >= 0) return JSON.parse(row[dataIdx] as string) as T;
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj as T;
    }

    const entity: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      const colName = columns[i];
      const field = fields.find((f) => f.name === colName);
      entity[colName] = field ? deserializeValue(row[i], field.type) : row[i];
    }
    return entity as T;
  }

  private entityToParams(entityName: string, entity: Entity): { columns: string[]; placeholders: string[]; values: unknown[] } {
    const fields = this.getFields(entityName);
    if (!fields) {
      return {
        columns: ['"id"', '"data_json"'],
        placeholders: ['?', '?'],
        values: [entity.id, JSON.stringify(entity)],
      };
    }

    const columns: string[] = [];
    const placeholders: string[] = [];
    const values: unknown[] = [];

    for (const field of fields) {
      const val = (entity as Record<string, unknown>)[field.name];
      columns.push(`"${field.name}"`);
      placeholders.push('?');
      values.push(serializeValue(val ?? null, field.type));
    }

    return { columns, placeholders, values };
  }

  // ─── Public API ─────────────────────────────────────────

  /**
   * Seed initial data. Inserts only if ID doesn't already exist (INSERT OR IGNORE).
   */
  seed<T extends Entity>(entityName: string, data: T[]): void {
    this.ensureTable(entityName);
    if (data.length === 0) return;

    for (const entity of data) {
      const { columns, placeholders, values } = this.entityToParams(entityName, entity);
      this.db.run(
        `INSERT OR IGNORE INTO "${entityName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values,
      );
    }
    this.persist();
  }

  async search<T extends Entity>(entityName: string, criteria: Criteria): Promise<SearchResult<T>> {
    await this.ensureReady();
    this.ensureTable(entityName);

    const filters = criteria.filters ?? [];
    const sortings = criteria.sortings ?? [];
    const page = criteria.page ?? 1;
    const limit = criteria.limit ?? 25;
    const fields = this.getFieldMap(entityName);

    const optimizedWhere = buildSqlWhereClause(filters, fields);
    if (optimizedWhere) {
      const whereSql = optimizedWhere ? ` WHERE ${optimizedWhere}` : '';
      const sortingSql = buildSqlOrderByClause(sortings, fields);
      const normalizedLimit = Math.max(1, Math.min(limit, 1_000));
      const normalizedOffset = Math.max(0, (Math.max(1, page) - 1) * normalizedLimit);

      const rowsResult = this.db.exec(
        `SELECT * FROM "${entityName}"${whereSql}${sortingSql} LIMIT ${normalizedLimit} OFFSET ${normalizedOffset}`,
      );

      const countResult = this.db.exec(`SELECT COUNT(*) as total FROM "${entityName}"${whereSql}`);
      const total = countResult.length > 0 ? Number(countResult[0].values[0][0] ?? 0) : 0;

      let data: T[] = [];
      if (rowsResult.length > 0) {
        const { columns, values: rows } = rowsResult[0];
        data = rows.map((row) => this.rowToEntity<T>(entityName, columns, row));
      }

      return { data, total };
    }

    const result = this.db.exec(`SELECT * FROM "${entityName}"`);
    let items: T[] = [];
    if (result.length > 0) {
      const { columns, values: rows } = result[0];
      items = rows.map((row) => this.rowToEntity<T>(entityName, columns, row));
    }

    // Apply filters (JS-side for full Shopware Criteria compatibility)
    if (filters.length > 0) {
      items = items.filter((item) =>
        evaluateFilters(item as Record<string, unknown>, filters, 'AND'),
      );
    }

    const total = items.length;

    // Apply sorting
    if (sortings.length > 0) {
      items.sort((a, b) => compareBySortings(a as Record<string, unknown>, b as Record<string, unknown>, sortings));
    }

    // Pagination
    const start = (page - 1) * limit;
    items = items.slice(start, start + limit);

    return { data: items, total };
  }

  async save<T extends Entity>(entityName: string, entity: T): Promise<T> {
    await this.ensureReady();
    this.ensureTable(entityName);
    const { columns, placeholders, values } = this.entityToParams(entityName, entity);
    this.db.run(
      `INSERT OR REPLACE INTO "${entityName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values,
    );
    this.persist();
    return entity;
  }

  async get<T extends Entity>(entityName: string, id: string): Promise<T | null> {
    await this.ensureReady();
    this.ensureTable(entityName);
    const escaped = id.replace(/'/g, "''");
    const result = this.db.exec(`SELECT * FROM "${entityName}" WHERE id = '${escaped}'`);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToEntity<T>(entityName, result[0].columns, result[0].values[0]);
  }

  async delete(entityName: string, id: string): Promise<boolean> {
    await this.ensureReady();
    this.ensureTable(entityName);
    const escaped = id.replace(/'/g, "''");
    const before = this.db.exec(`SELECT COUNT(*) FROM "${entityName}" WHERE id = '${escaped}'`);
    const count = before.length > 0 ? (before[0].values[0][0] as number) : 0;
    if (count === 0) return false;
    this.db.run(`DELETE FROM "${entityName}" WHERE id = '${escaped}'`);
    this.persist();
    return true;
  }

  /** Get list of all entity tables in the DB */
  getEntityNames(): string[] {
    const result = this.db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    );
    if (result.length === 0) return [];
    return result[0].values.map((row) => row[0] as string);
  }

  /** Close the database */
  close(): void {
    if (this.unsubscribeRegistry) {
      this.unsubscribeRegistry();
      this.unsubscribeRegistry = null;
    }
    if (this.db) this.db.close();
  }
}

function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function isSupportedSqlFilter(filter: CriteriaFilter, fields: Map<string, EntityFieldDefinition>): boolean {
  if (!filter.field || !fields.has(filter.field)) return false;
  if (filter.type === 'equals' || filter.type === 'contains') return true;
  if (filter.type === 'equalsAny') return Array.isArray(filter.value);
  if (filter.type === 'range') return !!filter.parameters;
  return false;
}

function buildSqlWhereClause(filters: CriteriaFilter[], fields: Map<string, EntityFieldDefinition>): string | null {
  if (!filters.length) return '';

  const clauses: string[] = [];
  for (const filter of filters) {
    if (!isSupportedSqlFilter(filter, fields)) {
      return null;
    }

    const column = `"${filter.field}"`;
    switch (filter.type) {
      case 'equals':
        clauses.push(`${column} = ${escapeSqlValue(filter.value)}`);
        break;
      case 'equalsAny': {
        const values = (filter.value as unknown[]).map((v) => escapeSqlValue(v));
        if (!values.length) {
          clauses.push('1=0');
        } else {
          clauses.push(`${column} IN (${values.join(', ')})`);
        }
        break;
      }
      case 'contains':
        clauses.push(`${column} LIKE ${escapeSqlValue(`%${String(filter.value ?? '')}%`)}`);
        break;
      case 'range': {
        const params = filter.parameters ?? {};
        if (params.gte !== undefined) clauses.push(`${column} >= ${escapeSqlValue(params.gte)}`);
        if (params.lte !== undefined) clauses.push(`${column} <= ${escapeSqlValue(params.lte)}`);
        if (params.gt !== undefined) clauses.push(`${column} > ${escapeSqlValue(params.gt)}`);
        if (params.lt !== undefined) clauses.push(`${column} < ${escapeSqlValue(params.lt)}`);
        break;
      }
      default:
        return null;
    }
  }

  return clauses.length ? clauses.join(' AND ') : '';
}

function buildSqlOrderByClause(sortings: CriteriaSorting[], fields: Map<string, EntityFieldDefinition>): string {
  if (!sortings.length) return '';
  const parts: string[] = [];
  for (const sorting of sortings) {
    if (!fields.has(sorting.field)) continue;
    const order = sorting.order === 'DESC' ? 'DESC' : 'ASC';
    parts.push(`"${sorting.field}" ${order}`);
  }

  if (!parts.length) return '';
  return ` ORDER BY ${parts.join(', ')}`;
}

// ─── Criteria evaluation ────────────────────────────────

function evaluateFilter(
  entity: Record<string, unknown>,
  filter: CriteriaFilter,
): boolean {
  switch (filter.type) {
    case 'equals':
      return entity[filter.field!] === filter.value;
    case 'equalsAny':
      return Array.isArray(filter.value) && (filter.value as unknown[]).includes(entity[filter.field!]);
    case 'contains':
      return String(entity[filter.field!] ?? '').toLowerCase().includes(String(filter.value).toLowerCase());
    case 'range': {
      const val = entity[filter.field!] as number;
      const p = filter.parameters ?? {};
      if (p.gte !== undefined && val < (p.gte as number)) return false;
      if (p.lte !== undefined && val > (p.lte as number)) return false;
      if (p.gt !== undefined && val <= (p.gt as number)) return false;
      if (p.lt !== undefined && val >= (p.lt as number)) return false;
      return true;
    }
    case 'not':
      return !evaluateFilters(entity, filter.queries ?? [], filter.operator ?? 'AND');
    case 'multi':
      return evaluateFilters(entity, filter.queries ?? [], filter.operator ?? 'AND');
    default:
      return true;
  }
}

function evaluateFilters(
  entity: Record<string, unknown>,
  filters: CriteriaFilter[],
  operator: string,
): boolean {
  if (filters.length === 0) return true;
  if (operator.toUpperCase() === 'OR') return filters.some((f) => evaluateFilter(entity, f));
  return filters.every((f) => evaluateFilter(entity, f));
}

function compareBySortings(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  sortings: CriteriaSorting[],
): number {
  for (const s of sortings) {
    const aVal = a[s.field];
    const bVal = b[s.field];
    if (aVal === bVal) continue;
    const dir = s.order === 'DESC' ? -1 : 1;
    if (aVal == null) return dir;
    if (bVal == null) return -dir;
    if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
    return String(aVal).localeCompare(String(bVal)) * dir;
  }
  return 0;
}
