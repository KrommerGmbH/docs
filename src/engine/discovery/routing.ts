import type { MDNSServiceInfo } from './mdns.js'

export type DiscoveryRouteSource = 'mdns' | 'tailscale'

export interface DiscoveryRouteCandidate {
  source: DiscoveryRouteSource
  host: string
  port: number
  online?: boolean
  latencyMs?: number
}

export interface DiscoveryRoute {
  source: DiscoveryRouteSource
  host: string
  port: number
  url: string
  score: number
}

export interface ResolveDiscoveryRouteOptions {
  preferMdns?: boolean
  preferredPort?: number
}

const DEFAULT_PORT = 4000

export function resolveBestDiscoveryRoute(
  candidates: DiscoveryRouteCandidate[],
  opts: ResolveDiscoveryRouteOptions = {},
): { best: DiscoveryRoute | null; ranked: DiscoveryRoute[] } {
  const normalized = candidates
    .filter((c) => !!c.host && Number.isFinite(c.port))
    .map((c) => ({
      source: c.source,
      host: c.host.trim(),
      port: c.port || opts.preferredPort || DEFAULT_PORT,
      score: scoreDiscoveryRouteCandidate(c, opts),
    }))
    .sort((a, b) => b.score - a.score)

  const ranked: DiscoveryRoute[] = normalized.map((c) => ({
    source: c.source,
    host: c.host,
    port: c.port,
    url: `http://${c.host}:${c.port}`,
    score: c.score,
  }))

  return {
    best: ranked[0] ?? null,
    ranked,
  }
}

export function scoreDiscoveryRouteCandidate(
  candidate: DiscoveryRouteCandidate,
  opts: ResolveDiscoveryRouteOptions = {},
): number {
  let score = 0

  if (candidate.online !== false) score += 40

  if (candidate.source === 'mdns') {
    score += opts.preferMdns === false ? 10 : 30
  } else if (candidate.source === 'tailscale') {
    score += 18
  }

  if (isLoopback(candidate.host)) score += 25
  else if (isPrivateIp(candidate.host)) score += 16

  if (opts.preferredPort && candidate.port === opts.preferredPort) {
    score += 6
  }

  if (typeof candidate.latencyMs === 'number' && Number.isFinite(candidate.latencyMs)) {
    score -= Math.min(20, Math.max(0, Math.round(candidate.latencyMs / 25)))
  }

  return score
}

export function createCandidateFromMdns(service: MDNSServiceInfo): DiscoveryRouteCandidate | null {
  const host = pickBestMdnsHost(service)
  if (!host) return null
  return {
    source: 'mdns',
    host,
    port: service.port || DEFAULT_PORT,
    online: true,
  }
}

export function createCandidatesFromTailscalePeers(
  peers: Array<{ hostname: string; ip: string; online: boolean }>,
  preferredPort = DEFAULT_PORT,
): DiscoveryRouteCandidate[] {
  return peers
    .filter((peer) => !!peer.ip)
    .map((peer) => ({
      source: 'tailscale' as const,
      host: peer.ip,
      port: preferredPort,
      online: peer.online,
    }))
}

function pickBestMdnsHost(service: MDNSServiceInfo): string {
  if (service.addresses && service.addresses.length > 0) {
    const sorted = [...service.addresses].sort((a, b) => {
      const ap = hostPriority(a)
      const bp = hostPriority(b)
      return bp - ap
    })
    return sorted[0] || service.host
  }
  return service.host
}

function hostPriority(host: string): number {
  if (isLoopback(host)) return 100
  if (isPrivateIp(host)) return 80
  if (host.includes(':')) return 50
  return 40
}

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host.toLowerCase() === 'localhost'
}

function isPrivateIp(host: string): boolean {
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  const m = host.match(/^172\.(\d{1,3})\./)
  if (m) {
    const second = Number(m[1])
    return second >= 16 && second <= 31
  }
  return false
}
