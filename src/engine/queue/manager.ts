import { Queue, QueueEvents, type JobsOptions } from 'bullmq';
import type { RedisConfig, InferenceJob } from '../types/index.js';
import { QueueError } from '../types/errors.js';
import type { Logger } from '../core/logger.js';
import { createRedisConnection } from './connection.js';

const QUEUE_NAME = 'cmh-inference';
const DLQ_NAME = 'cmh-inference-dlq';

/**
 * BullMQ Queue Manager — registers inference jobs.
 */
export class QueueManager {
  private queue: Queue | null = null;
  private dlq: Queue | null = null;
  private queueEvents: QueueEvents | null = null;

  constructor(
    private readonly config: RedisConfig,
    private readonly logger: Logger,
  ) {}

  async init(): Promise<void> {
    try {
      const connection = createRedisConnection(this.config);
      this.queue = new Queue(QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      });

      this.dlq = new Queue(DLQ_NAME, {
        connection,
        defaultJobOptions: {
          removeOnComplete: { count: 5000 },
          removeOnFail: { count: 5000 },
          attempts: 1,
        },
      });

      this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
      this.queueEvents.on('failed', async ({ jobId, failedReason }) => {
        try {
          if (!this.queue || !this.dlq || !jobId) return;
          const job = await this.queue.getJob(jobId);
          if (!job) return;

          const maxAttempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
          // 최종 실패(재시도 소진)된 작업만 DLQ로 이동
          if ((job.attemptsMade ?? 0) < maxAttempts) {
            return;
          }

          await this.dlq.add('inference-dead-letter', {
            originalQueue: QUEUE_NAME,
            originalJobId: job.id,
            failedReason,
            attemptsMade: job.attemptsMade,
            payload: job.data,
            movedAt: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.warn({ error, jobId }, 'queue:dlq-move-failed');
        }
      });

      // Verify connection
      await this.queue.waitUntilReady();
      await this.dlq.waitUntilReady();
      this.logger.info('BullMQ queue connected');
    } catch (error) {
      throw new QueueError(
        `Failed to initialize queue: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Add an inference job to the queue.
   */
  async addJob(
    job: InferenceJob,
    options?: Partial<JobsOptions>,
  ): Promise<string> {
    if (!this.queue) throw new QueueError('Queue not initialized');

    const added = await this.queue.add(
      'inference',
      job,
      {
        priority: job.priority ?? 0,
        ...options,
      },
    );

    this.logger.debug({ jobId: added.id, priority: job.priority }, 'job:added');
    return added.id!;
  }

  /**
   * Get the current queue size (waiting + active).
   */
  async getJobCounts(): Promise<{ waiting: number; active: number; completed: number; failed: number; delayed: number; deadletter: number }> {
    if (!this.queue) throw new QueueError('Queue not initialized');
    const counts = await this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const dlqCounts = this.dlq
      ? await this.dlq.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
      : { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };

    return {
      waiting: counts['waiting'] ?? 0,
      active: counts['active'] ?? 0,
      completed: counts['completed'] ?? 0,
      failed: counts['failed'] ?? 0,
      delayed: counts['delayed'] ?? 0,
      deadletter: (dlqCounts['waiting'] ?? 0) + (dlqCounts['active'] ?? 0) + (dlqCounts['failed'] ?? 0),
    };
  }

  async getDiagnostics(): Promise<{
    queue: string;
    dlq: string;
    jobs: { waiting: number; active: number; completed: number; failed: number; delayed: number; deadletter: number };
  }> {
    const jobs = await this.getJobCounts();
    return {
      queue: QUEUE_NAME,
      dlq: DLQ_NAME,
      jobs,
    };
  }

  async close(): Promise<void> {
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
    }

    if (this.dlq) {
      await this.dlq.close();
      this.dlq = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
      this.logger.info('BullMQ queue closed');
    }
  }
}
