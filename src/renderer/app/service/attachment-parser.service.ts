/**
 * Attachment Parser Service
 *
 * 첨부 파일 분류, 이미지 검증, 텍스트/PDF 추출.
 * Store와 분리하여 외부 API, cronJob에서도 재사용 가능.
 */
import type { AttachedFile } from '../store/chat.store'

// ── 이미지 ───────────────────────────────────────────────

export function isImageAttachment(file: AttachedFile): boolean {
  const mime = (file.type ?? '').toLowerCase()
  const dataUrl = (file.dataUrl ?? '').toLowerCase()
  return mime.startsWith('image/') || dataUrl.startsWith('data:image/')
}

export function toImageDataUrl(file: AttachedFile): string | null {
  const dataUrl = (file.dataUrl ?? '').trim()
  if (!dataUrl) return null
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) return null
  return dataUrl
}

// ── 텍스트 파일 ──────────────────────────────────────────

const TEXT_MIME_PREFIXES = [
  'text/', 'application/json', 'application/xml', 'application/javascript',
  'application/typescript', 'application/x-yaml', 'application/yaml', 'application/csv',
]

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'html', 'htm', 'css',
  'js', 'ts', 'jsx', 'tsx', 'svg', 'log', 'ini', 'toml', 'env', 'sh', 'bat',
  'ps1', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'rs', 'go', 'php', 'sql',
  'graphql', 'proto', 'tex', 'vue', 'scss', 'less', 'sass',
])

export function isTextAttachment(file: AttachedFile): boolean {
  const mime = (file.type ?? '').toLowerCase()
  if (TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

/** Base64 DataURL → UTF-8 텍스트 디코딩 */
export function extractTextFromDataUrl(file: AttachedFile): string | null {
  const dataUrl = (file.dataUrl ?? '').trim()
  if (!dataUrl) return null
  const match = /^data:[^;]*;base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  try {
    const binary = atob(match[1])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return null
  }
}

// ── PDF ──────────────────────────────────────────────────

export function isPdfAttachment(file: AttachedFile): boolean {
  const mime = (file.type ?? '').toLowerCase()
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? ''
  return mime === 'application/pdf' || ext === 'pdf'
}

/** PDF DataURL → 텍스트 추출 (간이: 텍스트 스트림만 추출) */
export function extractTextFromPdfDataUrl(file: AttachedFile): string | null {
  const dataUrl = (file.dataUrl ?? '').trim()
  if (!dataUrl) return null
  const match = /^data:[^;]*;base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  try {
    const binary = atob(match[1])
    const chunks: string[] = []

    // 방법 1: 괄호 텍스트 리터럴
    const parenRegex = /\(([^)]{1,500})\)/g
    let m: RegExpExecArray | null
    while ((m = parenRegex.exec(binary)) !== null) {
      const t = m[1].replace(/\\([nrt\\()])/g, (_, c: string) => {
        const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', '(': '(', ')': ')' }
        return map[c] ?? c
      })
      if (t.trim() && !/^[\x00-\x08\x0e-\x1f]+$/.test(t)) chunks.push(t)
    }

    // 방법 2: stream...endstream 블록에서 텍스트 시도
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g
    while ((m = streamRegex.exec(binary)) !== null) {
      const raw = m[1]
      const printable = raw.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '')
      if (printable.trim().length > 20) chunks.push(printable.trim())
    }

    const result = chunks.join(' ').replace(/\s+/g, ' ').trim()
    return result.length > 10 ? result : null
  } catch {
    return null
  }
}

// ── 통합 텍스트 블록 빌드 ────────────────────────────────

/** 첨부 파일 배열 → 모델 전송용 텍스트 블록 생성 (이미지 제외) */
function smartTruncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  const head = Math.max(400, Math.floor(maxChars * 0.72))
  const tail = Math.max(200, maxChars - head)
  return `${content.slice(0, head)}\n\n... [truncated] ...\n\n${content.slice(-tail)}`
}

export function buildAttachmentTextBlock(
  attachments: AttachedFile[],
  opts?: { skipImages?: boolean; maxPerFileChars?: number; maxTotalChars?: number },
): string {
  const blocks: string[] = []
  const maxPerFileChars = Math.max(2_000, opts?.maxPerFileChars ?? 20_000)
  const maxTotalChars = Math.max(8_000, opts?.maxTotalChars ?? 60_000)
  let totalChars = 0

  for (const a of attachments) {
    if (totalChars >= maxTotalChars) break

    // 이미지: skipImages=true면 건너뜀, 아니면 텍스트 설명으로 대체
    if (isImageAttachment(a)) {
      if (opts?.skipImages) continue
      const block = `--- File: ${a.name} ---\n[Image file: ${a.name}, type: ${a.type || 'image'}, size: ${formatFileSize(a.size)}. This image was attached but cannot be visually processed by the current model.]`
      blocks.push(block)
      totalChars += block.length
      continue
    }

    let content: string | null = null

    if (isPdfAttachment(a)) {
      content = extractTextFromPdfDataUrl(a)
      if (!content) content = `[PDF file: ${a.name} — text extraction failed, ${formatFileSize(a.size)}]`
    } else if (isTextAttachment(a)) {
      content = extractTextFromDataUrl(a)
      if (!content) content = `[File: ${a.name} — could not read content]`
    } else {
      content = `[Attached file: ${a.name}, type: ${a.type}, size: ${formatFileSize(a.size)}]`
    }

    if (content) {
      const remaining = Math.max(0, maxTotalChars - totalChars)
      if (remaining <= 0) break
      const safeMax = Math.min(maxPerFileChars, remaining)
      const processed = smartTruncate(content, safeMax)
      const block = `--- File: ${a.name} ---\n[meta] type=${a.type || 'unknown'}, size=${formatFileSize(a.size)}\n${processed}`
      blocks.push(block)
      totalChars += block.length
    }
  }

  if (attachments.length > 0 && blocks.length === 0) {
    return '[Attached files exist, but no extractable text was available within current limits.]'
  }

  return blocks.join('\n\n')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
