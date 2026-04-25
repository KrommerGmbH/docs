import type {
  SecurityAction,
  SecurityAuditEntry,
  SecurityGateCallbacks,
} from '../types/index.js';
import type { Logger } from '../core/logger.js';

/**
 * Security Gate — validates agent actions before execution.
 * Host app provides the actual validation callbacks.
 * Library provides the pipeline structure.
 */
export class SecurityGate {
  private readonly actionTimestamps = new Map<string, number[]>();
  private readonly deniedStreak = new Map<string, number>();

  constructor(
    private readonly callbacks: SecurityGateCallbacks,
    private readonly logger: Logger,
  ) {}

  private detectAnomaly(action: SecurityAction): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = []
    const now = Date.now()
    const key = `${action.agentId}:${action.type}`
    const bucket = this.actionTimestamps.get(key) ?? []
    const recent = bucket.filter((ts) => now - ts < 10_000)
    recent.push(now)
    this.actionTimestamps.set(key, recent)

    if (recent.length >= 8) {
      reasons.push('burst-rate')
    }

    const text = `${action.action} ${action.description} ${JSON.stringify(action.data ?? {})}`.toLowerCase()
    const sensitiveKeywords = ['delete', 'drop', 'truncate', 'rm -rf', 'shutdown', 'credential', 'apikey', 'token']
    if (sensitiveKeywords.some((keyword) => text.includes(keyword))) {
      reasons.push('sensitive-keyword')
    }

    const denied = this.deniedStreak.get(action.agentId) ?? 0
    if (denied >= 3) {
      reasons.push('denied-streak')
    }

    return { suspicious: reasons.length > 0, reasons }
  }

  /**
   * Validate an action request from an agent.
   * Returns true if the action is approved, false if denied.
   */
  async validate(action: SecurityAction): Promise<boolean> {
    this.logger.debug({ action: action.type, agent: action.agentId }, 'security:validate');

    const anomaly = this.detectAnomaly(action)
    if (anomaly.suspicious) {
      this.logger.warn(
        { action: action.type, agent: action.agentId, reasons: anomaly.reasons },
        'security:anomaly-detected',
      )
    }

    // Step 1: pre-filter (fast deny for known-bad patterns)
    if (this.callbacks.preFilter) {
      const allowed = await this.callbacks.preFilter(action);
      if (!allowed) {
        this.logger.warn({ action: action.type, agent: action.agentId }, 'security:pre-filter-denied');
        this.deniedStreak.set(action.agentId, (this.deniedStreak.get(action.agentId) ?? 0) + 1)
        return false;
      }
    }

    // Step 2: level-based flow
    if (action.securityLevel === 'auto') {
      return this.callbacks.validate(action);
    }

    if (action.securityLevel === 'notify') {
      await this.callbacks.onNotify?.(action);
      return this.callbacks.validate(action);
    }

    if (action.securityLevel === 'approve') {
      const approved = await this.callbacks.onApprove?.(action);
      if (approved === false) {
        this.logger.warn({ action: action.type, agent: action.agentId }, 'security:user-denied');
        this.deniedStreak.set(action.agentId, (this.deniedStreak.get(action.agentId) ?? 0) + 1)
        await this.auditLog(action, false);
        return false;
      }
    }

    // Step 3: main validation
    const result = await this.callbacks.validate(action);

    if (result) {
      this.deniedStreak.set(action.agentId, 0)
    } else {
      this.deniedStreak.set(action.agentId, (this.deniedStreak.get(action.agentId) ?? 0) + 1)
    }

    // Step 4: audit log
    await this.auditLog(action, result);

    return result;
  }

  getDiagnostics(): {
    deniedStreakByAgent: Record<string, number>
    burstBuckets: number
  } {
    return {
      deniedStreakByAgent: Object.fromEntries(this.deniedStreak.entries()),
      burstBuckets: this.actionTimestamps.size,
    }
  }

  private async auditLog(action: SecurityAction, approved: boolean): Promise<void> {
    if (this.callbacks.onAudit) {
      await this.callbacks.onAudit({
        action,
        approved,
        timestamp: new Date(),
      });
    }
  }
}
