import fs from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = process.env.CMH_ENGINE_URL || 'http://127.0.0.1:4000'
const MODELS_DIR = process.env.CMH_MODELS_DIR || path.resolve(process.cwd(), 'models')

const now = () => Date.now()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function jsonFetch(url, init = {}) {
  const res = await fetch(url, init)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { ok: res.ok, status: res.status, data }
}

async function waitUntil(fn, timeoutMs = 15_000, intervalMs = 250) {
  const start = now()
  while (now() - start <= timeoutMs) {
    if (await fn()) return now() - start
    await sleep(intervalMs)
  }
  return -1
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    checks: {},
  }

  // baseline
  const health = await jsonFetch(`${BASE_URL}/api/health`)
  report.checks.health = { status: health.status, ok: health.ok }
  if (!health.ok) {
    console.error(JSON.stringify(report, null, 2))
    process.exit(1)
  }

  const local = await jsonFetch(`${BASE_URL}/api/local-models?debug=1`)
  const localModels = Array.isArray(local.data?.data) ? local.data.data : []
  report.checks.localModelsCount = localModels.length

  const tempName = `__tmp_refactor_ctx4096_${Date.now()}.gguf`
  const tempPath = path.join(MODELS_DIR, tempName)
  await fs.writeFile(tempPath, '')

  const appearMs = await waitUntil(async () => {
    const resp = await jsonFetch(`${BASE_URL}/api/local-models?debug=1`)
    const items = Array.isArray(resp.data?.data) ? resp.data.data : []
    return items.some((m) => String(m?.filePath || '').endsWith(tempName))
  })

  await fs.unlink(tempPath).catch(() => {})

  const disappearMs = await waitUntil(async () => {
    const resp = await jsonFetch(`${BASE_URL}/api/local-models?debug=1`)
    const items = Array.isArray(resp.data?.data) ? resp.data.data : []
    return !items.some((m) => String(m?.filePath || '').endsWith(tempName))
  })

  report.checks.modelWatcherLatencyMs = {
    add: appearMs,
    unlink: disappearMs,
    ok: appearMs >= 0 && disappearMs >= 0,
  }

  const localModelId = String(localModels[0]?.id || '')
  const cloudNoKeyProbe = await jsonFetch(`${BASE_URL}/api/providers`)
  const providers = Array.isArray(cloudNoKeyProbe.data?.providers) ? cloudNoKeyProbe.data.providers : []
  const cloudNoKey = providers.find((p) => p?.type === 'cloud-api' && !p?.hasApiKey)

  report.checks.cloudNoKey = cloudNoKey
    ? await jsonFetch(`${BASE_URL}/api/providers/${cloudNoKey.id}/remote-models`)
    : { skipped: true }

  if (localModelId) {
    const hugePrompt = 'x'.repeat(200_000)
    const bigReq = {
      messages: [{ id: 'u-big', role: 'user', content: hugePrompt }],
      modelId: localModelId,
      rawModelId: localModelId,
      temperature: 0.2,
      maxTokens: 32,
    }
    report.checks.longPromptContextGuard = await jsonFetch(`${BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bigReq),
    })

    const thinkOff = {
      messages: [{ id: 'u-off', role: 'user', content: 'hello' }],
      modelId: localModelId,
      rawModelId: localModelId,
      thinkingEnabled: false,
      temperature: 0.2,
      maxTokens: 32,
    }
    const thinkOn = {
      ...thinkOff,
      thinkingEnabled: true,
      messages: [{ id: 'u-on', role: 'user', content: 'hello' }],
    }

    const [offRes, onRes] = await Promise.all([
      jsonFetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thinkOff),
      }),
      jsonFetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thinkOn),
      }),
    ])

    report.checks.thinkingParams = {
      off: { status: offRes.status, ok: offRes.ok },
      on: { status: onRes.status, ok: onRes.ok },
      ok: offRes.status < 500 && onRes.status < 500,
    }

    const warmupParallel = await Promise.all([
      jsonFetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'u-k1', role: 'user', content: 'ping1' }],
          modelId: localModelId,
          rawModelId: localModelId,
          maxTokens: 8,
        }),
      }),
      jsonFetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'u-k2', role: 'user', content: 'ping2' }],
          modelId: localModelId,
          rawModelId: localModelId,
          maxTokens: 8,
        }),
      }),
    ])

    report.checks.warmupKeepaliveConflict = {
      statuses: warmupParallel.map((r) => r.status),
      ok: warmupParallel.every((r) => r.status < 500),
    }
  } else {
    report.checks.longPromptContextGuard = { skipped: true }
    report.checks.thinkingParams = { skipped: true }
    report.checks.warmupKeepaliveConflict = { skipped: true }
  }

  const output = path.resolve(process.cwd(), 'test-results', 'refactor-f-items-report.json')
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, JSON.stringify(report, null, 2), 'utf8')

  console.log(`REPORT=${output}`)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
