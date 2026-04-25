// ─── RAG Document Loader Pipeline ────────────────────────
// Processes documents (PDF, DOCX, CSV, MD, TXT, XLSX) into
// chunked text with content hashing for deduplication.
// Uses LangChain document loaders + text splitters.

// @ts-ignore — optional dependency, types may not be installed
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Document } from '@langchain/core/documents';
import type { ChunkStrategy } from '../../data/entity/rag/rag-document.entity.js';

/**
 * Options for the document processing pipeline.
 */
export interface DocumentPipelineOptions {
  /** Chunking strategy */
  chunkStrategy?: ChunkStrategy;
  /** Max characters per chunk (default: 1000) */
  chunkSize?: number;
  /** Overlap between chunks (default: 200) */
  chunkOverlap?: number;
  /** 중앙 정책 소스 (파일 유형별 chunk 정책) */
  policySource?: ChunkPolicySource;
  /** 파일당 최대 chunk 수 제한 (기본: 2000) */
  maxChunksPerFile?: number;
}

export interface ChunkPolicy {
  chunkStrategy: ChunkStrategy;
  chunkSize: number;
  chunkOverlap: number;
}

export interface ChunkPolicySource {
  resolve(fileName: string, mimeType: string): Promise<Partial<ChunkPolicy> | null | undefined>;
}

const DEFAULT_CHUNK_POLICY: ChunkPolicy = {
  chunkStrategy: 'recursive',
  chunkSize: 1000,
  chunkOverlap: 200,
};

const CHUNK_POLICY_PRESETS: Array<{
  when: (fileName: string, mimeType: string) => boolean;
  policy: Partial<ChunkPolicy>;
}> = [
  {
    when: (fileName, mimeType) => mimeType === 'application/pdf' || fileName.endsWith('.pdf'),
    policy: { chunkSize: 1400, chunkOverlap: 220 },
  },
  {
    when: (fileName, mimeType) =>
      mimeType === 'text/csv'
      || fileName.endsWith('.csv')
      || fileName.endsWith('.xlsx')
      || fileName.endsWith('.xls'),
    policy: { chunkSize: 1800, chunkOverlap: 120 },
  },
  {
    when: (fileName, mimeType) =>
      mimeType.startsWith('text/')
      || fileName.endsWith('.md')
      || fileName.endsWith('.txt'),
    policy: { chunkSize: 1000, chunkOverlap: 180 },
  },
];

class PresetChunkPolicySource implements ChunkPolicySource {
  async resolve(fileName: string, mimeType: string): Promise<Partial<ChunkPolicy> | null> {
    const lowerFile = fileName.toLowerCase();
    const lowerMime = mimeType.toLowerCase();
    const found = CHUNK_POLICY_PRESETS.find((item) => item.when(lowerFile, lowerMime));
    return found?.policy ?? null;
  }
}

/**
 * Processed chunk output from the pipeline.
 */
export interface ProcessedChunk {
  /** Chunk text content */
  content: string;
  /** SHA-256 hash of content */
  contentHash: string;
  /** Detected theme/topic (placeholder — host app can override with LLM) */
  theme: string;
  /** Section heading or context */
  section: string;
  /** Section position (0-based) */
  sectionPosition: number;
  /** Chunking strategy used */
  chunkStrategy: ChunkStrategy;
  /** Extra metadata (page number, source, etc.) */
  metadata: Record<string, unknown>;
}

/**
 * Compute SHA-256 hash of a string.
 */
async function sha256(text: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = new TextEncoder().encode(text);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Extract text content from raw file data based on MIME type.
 * Returns an array of LangChain Documents.
 */
async function loadDocumentFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<Document[]> {
  const { Document } = await import('@langchain/core/documents');
  const textDecoder = new TextDecoder('utf-8');

  // ---- Plain text / Markdown ----
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  ) {
    const text = textDecoder.decode(buffer);
    return [new Document({ pageContent: text, metadata: { source: fileName } })];
  }

  // ---- PDF ----
  if (mimeType === 'application/pdf') {
    try {
      // @ts-ignore — optional dependency
      const { PDFLoader } = await import('@langchain/community/document_loaders/fs/pdf');
      const blob = new Blob([buffer] as any, { type: mimeType });
      const loader = new PDFLoader(blob, { splitPages: true });
      return await loader.load();
    } catch {
      // Fallback: try pdf-parse directly
      // @ts-ignore — optional dependency
      const pdfParse = (await import('pdf-parse')).default;
      const result = await pdfParse(Buffer.from(buffer as ArrayBuffer));
      return [new Document({ pageContent: result.text, metadata: { source: fileName, pages: result.numpages } })];
    }
  }

  // ---- DOCX ----
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    try {
      // @ts-ignore — optional dependency
      const { DocxLoader } = await import('@langchain/community/document_loaders/fs/docx');
      const blob = new Blob([buffer] as any, { type: mimeType });
      const loader = new DocxLoader(blob);
      return await loader.load();
    } catch {
      // Fallback mammoth
      // @ts-ignore — optional dependency
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer as ArrayBuffer) });
      return [new Document({ pageContent: result.value, metadata: { source: fileName } })];
    }
  }

  // ---- CSV ----
  if (mimeType === 'text/csv' || fileName.endsWith('.csv')) {
    const text = textDecoder.decode(buffer);
    return [new Document({ pageContent: text, metadata: { source: fileName, type: 'csv' } })];
  }

  // ---- XLSX ----
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
  ) {
    try {
      // @ts-ignore — optional dependency
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'array' });
      const docs: Document[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        docs.push(new Document({ pageContent: csv, metadata: { source: fileName, sheet: sheetName } }));
      }
      return docs;
    } catch {
      return [new Document({ pageContent: '[XLSX parsing failed]', metadata: { source: fileName } })];
    }
  }

  // ---- Fallback: treat as text ----
  try {
    const text = textDecoder.decode(buffer);
    return [new Document({ pageContent: text, metadata: { source: fileName } })];
  } catch {
    return [];
  }
}

/**
 * Extract section headings from text (Markdown headings, numbered sections, etc.)
 */
function extractSection(text: string): string {
  // Try Markdown headings
  const headingMatch = text.match(/^#{1,6}\s+(.+)/m);
  if (headingMatch) return headingMatch[1].trim();

  // First line as fallback section
  const firstLine = text.split('\n')[0]?.trim();
  return firstLine?.substring(0, 100) || 'untitled';
}

/**
 * DocumentPipeline — processes raw files into chunked, hashed text
 * ready for embedding and RAG indexing.
 */
export class DocumentPipeline {
  private readonly policySource: ChunkPolicySource;
  private readonly maxChunksPerFile: number;
  private readonly basePolicy: ChunkPolicy;

  constructor(options: DocumentPipelineOptions = {}) {
    this.basePolicy = {
      chunkStrategy: options.chunkStrategy ?? DEFAULT_CHUNK_POLICY.chunkStrategy,
      chunkSize: options.chunkSize ?? DEFAULT_CHUNK_POLICY.chunkSize,
      chunkOverlap: options.chunkOverlap ?? DEFAULT_CHUNK_POLICY.chunkOverlap,
    };
    this.policySource = options.policySource ?? new PresetChunkPolicySource();
    this.maxChunksPerFile = Math.max(1, options.maxChunksPerFile ?? 2000);
  }

  private async resolveChunkPolicy(fileName: string, mimeType: string): Promise<ChunkPolicy> {
    const external = await this.policySource.resolve(fileName, mimeType);
    const merged: ChunkPolicy = {
      chunkStrategy: external?.chunkStrategy ?? this.basePolicy.chunkStrategy,
      chunkSize: external?.chunkSize ?? this.basePolicy.chunkSize,
      chunkOverlap: external?.chunkOverlap ?? this.basePolicy.chunkOverlap,
    };

    if (merged.chunkOverlap >= merged.chunkSize) {
      merged.chunkOverlap = Math.max(0, merged.chunkSize - 1);
    }

    return merged;
  }

  private buildSplitter(policy: ChunkPolicy): RecursiveCharacterTextSplitter {
    return new RecursiveCharacterTextSplitter({
      chunkSize: policy.chunkSize,
      chunkOverlap: policy.chunkOverlap,
    });
  }

  /**
   * Process a file buffer into chunked documents.
   */
  async process(
    buffer: ArrayBuffer | Uint8Array,
    mimeType: string,
    fileName: string,
    theme?: string,
  ): Promise<ProcessedChunk[]> {
    const chunkPolicy = await this.resolveChunkPolicy(fileName, mimeType);

    // 1. Load raw documents
    const rawDocs = await loadDocumentFromBuffer(buffer, mimeType, fileName);
    if (!rawDocs.length) return [];

    // 2. Split into chunks
    const splitter = this.buildSplitter(chunkPolicy);
    const chunks = await splitter.splitDocuments(rawDocs);
    const limitedChunks = chunks.slice(0, this.maxChunksPerFile);

    // 3. Process each chunk
    const results: ProcessedChunk[] = [];
    for (let i = 0; i < limitedChunks.length; i++) {
      const chunk = limitedChunks[i];
      const content = chunk.pageContent;
      if (!content.trim()) continue;

      const contentHash = await sha256(content);
      const section = extractSection(content);

      results.push({
        content,
        contentHash,
        theme: theme || fileName.replace(/\.[^.]+$/, ''),
        section,
        sectionPosition: i,
        chunkStrategy: chunkPolicy.chunkStrategy,
        metadata: {
          ...chunk.metadata,
          source: fileName,
          chunkSize: chunkPolicy.chunkSize,
          chunkOverlap: chunkPolicy.chunkOverlap,
        },
      });
    }

    return results;
  }

  /**
   * Check if a content hash already exists (deduplication).
   * Host app should provide the actual check against the DB.
   */
  deduplicate(chunks: ProcessedChunk[], existingHashes: Set<string>): ProcessedChunk[] {
    return chunks.filter(c => !existingHashes.has(c.contentHash));
  }
}
