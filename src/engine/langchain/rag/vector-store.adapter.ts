// ─── RAG Vector Store Adapter ────────────────────────────
// Entity-backed vector store that stores embeddings in the
// cmh_rag_document entity via the DAL RepositoryFactory.
// Supports multi-vector similarity search (theme, section, content).

import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';

export interface EmbeddingProvider {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export class LangChainEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly embeddings: EmbeddingsInterface) {}

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }
}

/**
 * Vector similarity search result.
 */
export interface VectorSearchResult {
  /** RAG document entity ID */
  id: string;
  /** Chunk content */
  content: string;
  /** Cosine similarity score (0-1) */
  score: number;
  /** Source metadata */
  metadata: Record<string, unknown>;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Repository interface (matches DAL RepositoryFactory.create() output).
 */
interface Repository {
  search(criteria: any): Promise<{ data: any[] }>;
  save(entity: any): Promise<void>;
  delete(id: string): Promise<void>;
}

function toEmbeddingProvider(embeddings: EmbeddingsInterface | EmbeddingProvider): EmbeddingProvider {
  const candidate = embeddings as EmbeddingProvider;
  if (typeof candidate.embedDocuments === 'function' && typeof candidate.embedQuery === 'function') {
    return candidate;
  }
  return new LangChainEmbeddingProvider(embeddings as EmbeddingsInterface);
}

async function embedInBatches(
  provider: EmbeddingProvider,
  texts: string[],
  batchSize: number,
): Promise<number[][]> {
  const resolvedBatchSize = Math.max(1, batchSize);
  if (texts.length <= resolvedBatchSize) {
    return provider.embedDocuments(texts);
  }

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += resolvedBatchSize) {
    const batch = texts.slice(i, i + resolvedBatchSize);
    const partial = await provider.embedDocuments(batch);
    vectors.push(...partial);
  }
  return vectors;
}

type LibsqlClientLike = {
  execute(args: string | { sql: string; args?: Record<string, unknown> | unknown[] }): Promise<{ rows?: Array<Record<string, unknown>> }>;
};

async function loadLibsqlClient(url: string, authToken?: string): Promise<LibsqlClientLike | null> {
  try {
    const importer = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    const mod = await importer('@libsql/client');
    if (typeof mod?.createClient !== 'function') return null;
    return mod.createClient({ url, authToken }) as LibsqlClientLike;
  } catch {
    return null;
  }
}

/**
 * EntityVectorStore — uses cmh_rag_document entity as backend.
 *
 * This is NOT a LangChain VectorStore subclass because the multi-vector
 * schema (theme/section/content vectors) doesn't fit the standard
 * single-embedding interface. Instead, it provides a similar API.
 */
export class EntityVectorStore {
  private readonly embeddingProvider: EmbeddingProvider;

  constructor(
    embeddings: EmbeddingsInterface | EmbeddingProvider,
    private readonly repository: Repository,
    private readonly options: { embeddingBatchSize?: number } = {},
  ) {
    this.embeddingProvider = toEmbeddingProvider(embeddings);
  }

  /**
   * Embed and store chunks into the entity store.
   */
  async addDocuments(
    documents: Array<{
      id: string;
      mediaId: string;
      theme: string;
      section: string;
      sectionPosition: number;
      content: string;
      contentHash: string;
      chunkStrategy: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    // Batch embed all content
    const contents = documents.map(d => d.content);
    const themes = documents.map(d => d.theme);
    const sections = documents.map(d => d.section);
    const batchSize = this.options.embeddingBatchSize ?? 64;

    const [contentVectors, themeVectors, sectionVectors] = await Promise.all([
      embedInBatches(this.embeddingProvider, contents, batchSize),
      embedInBatches(this.embeddingProvider, themes, batchSize),
      embedInBatches(this.embeddingProvider, sections, batchSize),
    ]);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      await this.repository.save({
        id: doc.id,
        mediaId: doc.mediaId,
        theme: doc.theme,
        themeVector: themeVectors[i],
        section: doc.section,
        sectionVector: sectionVectors[i],
        sectionPosition: doc.sectionPosition,
        content: doc.content,
        contentVector: contentVectors[i],
        contentHash: doc.contentHash,
        chunkStrategy: doc.chunkStrategy,
        status: 'indexed',
        metadata: doc.metadata || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Similarity search using content vectors.
   */
  async similaritySearch(
    query: string,
    topK: number = 5,
    vectorField: 'contentVector' | 'themeVector' | 'sectionVector' = 'contentVector',
  ): Promise<VectorSearchResult[]> {
    const queryVector = await this.embeddingProvider.embedQuery(query);

    // Load all indexed documents (for small-scale; production should use SQL/vector DB)
    const result = await this.repository.search({ limit: 10000 });
    const docs = result.data.filter((d: any) => d.status === 'indexed' && d[vectorField]);

    // Score and rank
    const scored = docs.map((doc: any) => ({
      id: doc.id,
      content: doc.content,
      score: cosineSimilarity(queryVector, doc[vectorField]),
      metadata: {
        theme: doc.theme,
        section: doc.section,
        sectionPosition: doc.sectionPosition,
        mediaId: doc.mediaId,
        ...(doc.metadata || {}),
      },
    }));

    scored.sort((a: VectorSearchResult, b: VectorSearchResult) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Multi-vector search — combines scores from content, section, and theme vectors.
   * Weights: content=0.6, section=0.25, theme=0.15
   */
  async multiVectorSearch(
    query: string,
    topK: number = 5,
  ): Promise<VectorSearchResult[]> {
    const queryVector = await this.embeddingProvider.embedQuery(query);

    const result = await this.repository.search({ limit: 10000 });
    const docs = result.data.filter((d: any) => d.status === 'indexed' && d.contentVector);

    const scored = docs.map((doc: any) => {
      const contentScore = doc.contentVector ? cosineSimilarity(queryVector, doc.contentVector) : 0;
      const sectionScore = doc.sectionVector ? cosineSimilarity(queryVector, doc.sectionVector) : 0;
      const themeScore = doc.themeVector ? cosineSimilarity(queryVector, doc.themeVector) : 0;

      return {
        id: doc.id,
        content: doc.content,
        score: contentScore * 0.6 + sectionScore * 0.25 + themeScore * 0.15,
        metadata: {
          theme: doc.theme,
          section: doc.section,
          sectionPosition: doc.sectionPosition,
          mediaId: doc.mediaId,
          contentScore,
          sectionScore,
          themeScore,
          ...(doc.metadata || {}),
        },
      };
    });

    scored.sort((a: VectorSearchResult, b: VectorSearchResult) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Convert to LangChain-compatible retriever format.
   */
  asRetriever(topK: number = 5, useMultiVector: boolean = true) {
    const store = this;
    return {
      async invoke(query: string): Promise<Document[]> {
        const results = useMultiVector
          ? await store.multiVectorSearch(query, topK)
          : await store.similaritySearch(query, topK);

        return results.map(r => new Document({
          pageContent: r.content,
          metadata: { ...r.metadata, score: r.score },
        }));
      },
    };
  }
}

/**
 * LibSQLVectorStore — @libsql/client 기반 저장소.
 *
 * 주의:
 * - 현재 단계에서는 벡터 연산을 DB native 함수에 의존하지 않고 애플리케이션에서 코사인 계산한다.
 * - 런타임에 @libsql/client 미설치면 생성 실패하며 상위에서 EntityVectorStore로 폴백해야 한다.
 */
export class LibsqlVectorStore {
  private constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly client: LibsqlClientLike,
    private readonly tableName: string,
    private readonly options: { embeddingBatchSize?: number } = {},
  ) {}

  static async create(
    embeddings: EmbeddingsInterface | EmbeddingProvider,
    options: { url: string; authToken?: string; tableName?: string; embeddingBatchSize?: number },
  ): Promise<LibsqlVectorStore | null> {
    const client = await loadLibsqlClient(options.url, options.authToken);
    if (!client) return null;

    const tableName = options.tableName ?? 'cmh_rag_vectors';
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        content_vector TEXT,
        metadata_json TEXT,
        created_at TEXT
      )
    `);

    return new LibsqlVectorStore(toEmbeddingProvider(embeddings), client, tableName, {
      embeddingBatchSize: options.embeddingBatchSize,
    });
  }

  async addDocuments(
    documents: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>,
  ): Promise<void> {
    const vectors = await embedInBatches(
      this.embeddingProvider,
      documents.map((d) => d.content),
      this.options.embeddingBatchSize ?? 64,
    );
    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      await this.client.execute({
        sql: `INSERT OR REPLACE INTO ${this.tableName} (id, content, content_vector, metadata_json, created_at)
              VALUES (?, ?, ?, ?, ?)` ,
        args: [
          d.id,
          d.content,
          JSON.stringify(vectors[i] ?? []),
          JSON.stringify(d.metadata ?? {}),
          new Date().toISOString(),
        ],
      });
    }
  }

  async similaritySearch(query: string, topK = 5): Promise<VectorSearchResult[]> {
    const qv = await this.embeddingProvider.embedQuery(query);
    const result = await this.client.execute(`SELECT id, content, content_vector, metadata_json FROM ${this.tableName}`);
    const rows = result.rows ?? [];

    const scored: VectorSearchResult[] = rows
      .map((row) => {
        const vectorRaw = row.content_vector;
        const vector = typeof vectorRaw === 'string' ? (JSON.parse(vectorRaw) as number[]) : [];
        const metadataRaw = row.metadata_json;
        const metadata = typeof metadataRaw === 'string' ? (JSON.parse(metadataRaw) as Record<string, unknown>) : {};
        return {
          id: String(row.id ?? ''),
          content: String(row.content ?? ''),
          score: cosineSimilarity(qv, vector),
          metadata,
        };
      })
      .filter((r) => r.id && r.content)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  asRetriever(topK = 5) {
    const store = this;
    return {
      async invoke(query: string): Promise<Document[]> {
        const results = await store.similaritySearch(query, topK);
        return results.map((r) => new Document({
          pageContent: r.content,
          metadata: { ...r.metadata, score: r.score },
        }));
      },
    };
  }
}

export async function createPreferredVectorStore(options: {
  embeddings: EmbeddingsInterface | EmbeddingProvider;
  entityRepository: Repository;
  libsql?: { url: string; authToken?: string; tableName?: string };
  embeddingBatchSize?: number;
}): Promise<EntityVectorStore | LibsqlVectorStore> {
  if (options.libsql?.url) {
    const libsqlStore = await LibsqlVectorStore.create(options.embeddings, {
      ...options.libsql,
      embeddingBatchSize: options.embeddingBatchSize,
    });
    if (libsqlStore) return libsqlStore;
  }

  return new EntityVectorStore(options.embeddings, options.entityRepository, {
    embeddingBatchSize: options.embeddingBatchSize,
  });
}
