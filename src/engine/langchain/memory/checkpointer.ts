// ─── Checkpointer Factory ────────────────────────────────
// Phase 5.5 — 환경별 체크포인터 팩토리.

import { MemorySaver } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

export type CheckpointerType = 'memory' | 'sqlite' | 'postgres';

export interface CheckpointerOptions {
  type: CheckpointerType;
  /** SQLite DB 파일 경로 (sqlite 전용) */
  dbPath?: string;
  /** Postgres 연결 문자열 (postgres 전용) */
  connectionString?: string;
}

type SqliteSaverLike = {
  fromConnString?: (conn: string) => Promise<BaseCheckpointSaver> | BaseCheckpointSaver;
  fromConnectionString?: (conn: string) => Promise<BaseCheckpointSaver> | BaseCheckpointSaver;
  new (...args: unknown[]): BaseCheckpointSaver;
};

async function loadSqliteSaver(): Promise<SqliteSaverLike | null> {
  try {
    const importer = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    const mod = await importer('@langchain/langgraph-checkpoint-sqlite');
    return (mod?.SqliteSaver ?? mod?.default ?? null) as SqliteSaverLike | null;
  } catch {
    return null;
  }
}

/**
 * 환경별 체크포인터 생성.
 *
 * - `memory`: 개발/테스트용 (MemorySaver)
 * - `sqlite`: Electron 배포용 (Phase 5.5+ 에서 @langchain/langgraph-checkpoint-sqlite 설치 후)
 * - `postgres`: Docker 배포용 (Phase 5.5+ 에서 @langchain/langgraph-checkpoint-postgres 설치 후)
 *
 * 현재는 MemorySaver만 구현. SQLite/Postgres는 패키지 설치 후 동적 import로 확장.
 */
export async function createCheckpointer(
  options: CheckpointerOptions = { type: 'memory' },
): Promise<BaseCheckpointSaver> {
  switch (options.type) {
    case 'sqlite': {
      const SqliteSaver = await loadSqliteSaver();
      if (!SqliteSaver) {
        console.warn('[checkpointer] SQLite saver package not found, falling back to MemorySaver');
        return new MemorySaver();
      }

      const conn = options.dbPath ?? ':memory:';
      if (typeof SqliteSaver.fromConnString === 'function') {
        return await SqliteSaver.fromConnString(conn);
      }
      if (typeof SqliteSaver.fromConnectionString === 'function') {
        return await SqliteSaver.fromConnectionString(conn);
      }

      try {
        return new SqliteSaver(conn as unknown as never);
      } catch {
        console.warn('[checkpointer] SQLite saver init failed, falling back to MemorySaver');
      }
      return new MemorySaver();
    }
    case 'postgres': {
      // TODO: pnpm add @langchain/langgraph-checkpoint-postgres 후 활성화
      // const { PostgresSaver } = await import('@langchain/langgraph-checkpoint-postgres');
      // return PostgresSaver.fromConnString(options.connectionString!);
      console.warn('[checkpointer] Postgres not yet available, falling back to MemorySaver');
      return new MemorySaver();
    }
    case 'memory':
    default:
      return new MemorySaver();
  }
}
