import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'

const ROUTE_TARGETS = ['manager', 'worker', 'supporter', 'profiler', '__end__'] as const

const routeSchema = z.object({
  target: z.enum(ROUTE_TARGETS),
})

const routeParser = StructuredOutputParser.fromZodSchema(routeSchema)

export type SupervisorRouteTarget = (typeof ROUTE_TARGETS)[number]

export function getSupervisorRouteFormatInstructions(): string {
  return routeParser.getFormatInstructions()
}

export async function parseSupervisorRouteOutput(raw: string): Promise<SupervisorRouteTarget | null> {
  const content = (raw ?? '').trim()
  if (!content) return null

  // 1) 단일 토큰 응답(하위호환)
  const single = content.toLowerCase()
  if ((ROUTE_TARGETS as readonly string[]).includes(single)) {
    return single as SupervisorRouteTarget
  }

  // 2) 코드블록 JSON 응답 정규화
  const normalized = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    const parsed = await routeParser.parse(normalized)
    return parsed.target
  } catch {
    // 3) 마지막 폴백: 문자열 내 target 키워드 추출
    const m = normalized.toLowerCase().match(/(?:"target"\s*:\s*"|\b)(manager|worker|supporter|profiler|__end__)(?:"|\b)/)
    return (m?.[1] as SupervisorRouteTarget | undefined) ?? null
  }
}
