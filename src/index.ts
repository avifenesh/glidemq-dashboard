import { readFileSync } from 'fs';
import { join } from 'path';
import type { Router, Request, Response } from 'express';
import type { Queue, QueueEvents, Job, SearchJobsOptions } from 'glide-mq';

const MAX_PAGE_SIZE = 200;

let dashboardHtmlCache: string | null = null;
function getDashboardHtml(): string {
  if (dashboardHtmlCache) return dashboardHtmlCache;
  dashboardHtmlCache = readFileSync(join(__dirname, 'dashboard-ui.html'), 'utf8');
  return dashboardHtmlCache;
}

export interface DashboardOptions {
  /** QueueEvents instances to stream SSE events from. One per queue. */
  queueEvents?: QueueEvents[];
  /** When true, all mutation routes (POST, DELETE) return 403. */
  readOnly?: boolean;
  /**
   * Authorization callback. Called before mutation routes execute.
   * Return true to allow, false to deny (403).
   */
  authorize?: (req: Request, action: string) => boolean | Promise<boolean>;
}

/** Extract a single string param from Express req.params (handles Express 4 and 5 types). */
function param(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}

function safeError(res: Response, err: unknown, status = 500): void {
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
}

function serializeJob(j: Job): Record<string, unknown> {
  return {
    id: j.id,
    name: j.name,
    data: j.data,
    opts: j.opts,
    progress: j.progress,
    attemptsMade: j.attemptsMade,
    failedReason: j.failedReason,
    returnvalue: j.returnvalue,
    timestamp: j.timestamp,
    processedOn: j.processedOn,
    finishedOn: j.finishedOn,
  };
}

type ActionString =
  | 'queue:pause' | 'queue:resume' | 'queue:obliterate'
  | 'queue:drain' | 'queue:retryAll' | 'queue:clean'
  | 'job:remove' | 'job:retry' | 'job:promote';

async function guardMutation(
  req: Request,
  res: Response,
  opts: DashboardOptions | undefined,
  action: ActionString,
): Promise<boolean> {
  if (opts?.readOnly) {
    res.status(403).json({ error: 'Dashboard is in read-only mode' });
    return false;
  }
  if (opts?.authorize) {
    const allowed = await opts.authorize(req, action);
    if (!allowed) {
      res.status(403).json({ error: 'Unauthorized' });
      return false;
    }
  }
  return true;
}

const VALID_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const;
type JobState = (typeof VALID_STATES)[number];

/**
 * Create an Express Router that serves a dashboard UI and REST API
 * for monitoring and managing glide-mq queues.
 */
export function createDashboard(
  queues: Queue[],
  opts?: DashboardOptions,
): Router {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');
  const router = express.Router();

  const queueMap = new Map<string, Queue>();
  for (const q of queues) {
    queueMap.set(q.name, q);
  }

  const queueEvents = opts?.queueEvents ?? [];

  // --- HTML dashboard ---
  router.get('/', (_req: Request, res: Response) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'");
    res.type('html').send(getDashboardHtml());
  });

  // Body parser for mutation endpoints
  router.use(express.json());

  // ===== READ ENDPOINTS =====

  // --- List all queues with job counts ---
  router.get('/api/queues', async (_req: Request, res: Response) => {
    try {
      const result = await Promise.all(
        queues.map(async (q) => {
          const counts = await q.getJobCounts();
          const paused = await q.isPaused();
          return { name: q.name, counts, paused };
        }),
      );
      res.json(result);
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Get jobs for a queue by state ---
  router.get('/api/queues/:name/jobs', async (req: Request, res: Response) => {
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }

    const state = req.query.state as string | undefined;
    if (state && !VALID_STATES.includes(state as JobState)) {
      res.status(400).json({ error: `Invalid state: ${state}. Must be one of: ${VALID_STATES.join(', ')}` });
      return;
    }

    const start = parseInt(req.query.start as string, 10) || 0;
    const end = parseInt(req.query.end as string, 10);
    const endVal = isNaN(end) ? 20 : Math.min(end, start + MAX_PAGE_SIZE);

    try {
      if (state) {
        const jobs = await queue.getJobs(state as JobState, start, endVal);
        res.json(jobs.map((j) => ({ ...serializeJob(j), state })));
      } else {
        const tagged: Record<string, unknown>[] = [];
        await Promise.all(
          VALID_STATES.map(async (s) => {
            const jobs = await queue.getJobs(s, 0, endVal);
            for (const j of jobs) tagged.push({ ...serializeJob(j), state: s });
          }),
        );
        tagged.sort((a, b) => ((b.timestamp as number) ?? 0) - ((a.timestamp as number) ?? 0));
        res.json(tagged.slice(start, endVal));
      }
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Get single job ---
  router.get('/api/queues/:name/job/:id', async (req: Request, res: Response) => {
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }

    const jobId = param(req, 'id');
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      const logs = await queue.getJobLogs(jobId);
      const state = await job.getState();
      res.json({ ...serializeJob(job), state, logs: logs.logs });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Get workers for a queue ---
  router.get('/api/queues/:name/workers', async (req: Request, res: Response) => {
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    try {
      const workers = await queue.getWorkers();
      res.json(workers);
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Get job schedulers ---
  router.get('/api/queues/:name/schedulers', async (req: Request, res: Response) => {
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    try {
      const schedulers = await queue.getRepeatableJobs();
      res.json(schedulers);
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Get dead letter queue jobs ---
  router.get('/api/queues/:name/dlq', async (req: Request, res: Response) => {
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const start = parseInt(req.query.start as string, 10) || 0;
    const end = parseInt(req.query.end as string, 10);
    const endVal = isNaN(end) ? 20 : Math.min(end, start + MAX_PAGE_SIZE);
    try {
      const jobs = await queue.getDeadLetterJobs(start, endVal);
      res.json(jobs.map(serializeJob));
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Get metrics ---
  router.get('/api/queues/:name/metrics', async (req: Request, res: Response) => {
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    try {
      const [completed, failed] = await Promise.all([
        queue.getMetrics('completed'),
        queue.getMetrics('failed'),
      ]);
      res.json({ completed: completed.count, failed: failed.count });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Search jobs ---
  router.get('/api/queues/:name/search', async (req: Request, res: Response) => {
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }

    const searchOpts: SearchJobsOptions = {};
    if (req.query.state) {
      const state = req.query.state as string;
      if (VALID_STATES.includes(state as JobState)) {
        searchOpts.state = state as JobState;
      }
    }
    if (req.query.name) searchOpts.name = req.query.name as string;
    if (req.query.data) {
      try { searchOpts.data = JSON.parse(req.query.data as string); } catch { /* ignore invalid JSON */ }
    }
    searchOpts.limit = Math.min(parseInt(req.query.limit as string, 10) || 50, MAX_PAGE_SIZE);

    try {
      const jobs = await queue.searchJobs(searchOpts);
      res.json(jobs.map(serializeJob));
    } catch (err) {
      safeError(res, err);
    }
  });

  // ===== MUTATION ENDPOINTS =====

  // --- Pause queue ---
  router.post('/api/queues/:name/pause', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'queue:pause'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    try {
      await queue.pause();
      res.json({ status: 'paused' });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Resume queue ---
  router.post('/api/queues/:name/resume', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'queue:resume'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    try {
      await queue.resume();
      res.json({ status: 'resumed' });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Remove job ---
  router.delete('/api/queues/:name/jobs/:id', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'job:remove'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const jobId = param(req, 'id');
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      await job.remove();
      res.json({ status: 'removed' });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Retry job ---
  router.post('/api/queues/:name/jobs/:id/retry', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'job:retry'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const jobId = param(req, 'id');
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      await job.retry();
      res.json({ status: 'retried' });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Promote delayed job ---
  router.post('/api/queues/:name/jobs/:id/promote', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'job:promote'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const jobId = param(req, 'id');
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      await job.promote();
      res.json({ status: 'promoted' });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Obliterate queue ---
  router.post('/api/queues/:name/obliterate', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'queue:obliterate'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    try {
      await queue.obliterate({ force: true });
      res.json({ status: 'obliterated' });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Drain waiting jobs ---
  router.post('/api/queues/:name/drain', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'queue:drain'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const delayed = req.body?.delayed === true;
    try {
      await queue.drain(delayed);
      res.json({ status: 'drained' });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Bulk retry failed jobs ---
  router.post('/api/queues/:name/retry-all', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'queue:retryAll'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }
    const count = parseInt(req.body?.count, 10) || 0;
    try {
      const retried = await queue.retryJobs(count > 0 ? { count } : undefined);
      res.json({ status: 'ok', retried });
    } catch (err) {
      safeError(res, err);
    }
  });

  // --- Clean old jobs ---
  router.post('/api/queues/:name/clean', async (req: Request, res: Response) => {
    if (!(await guardMutation(req, res, opts, 'queue:clean'))) return;
    const queue = queueMap.get(param(req, 'name'));
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' });
      return;
    }

    const grace = parseInt(req.body?.grace, 10);
    const limit = parseInt(req.body?.limit, 10) || 100;
    const type = req.body?.type;

    if (isNaN(grace) || grace < 0) {
      res.status(400).json({ error: 'grace must be a non-negative integer (ms)' });
      return;
    }
    if (type !== 'completed' && type !== 'failed') {
      res.status(400).json({ error: 'type must be "completed" or "failed"' });
      return;
    }

    try {
      const removed = await queue.clean(grace, Math.min(limit, 1000), type);
      res.json({ status: 'ok', removed: removed.length });
    } catch (err) {
      safeError(res, err);
    }
  });

  // ===== SSE EVENT STREAM =====

  router.get('/api/events', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');

    const listeners: { qe: QueueEvents; event: string; handler: (payload: unknown) => void }[] = [];
    const eventNames = ['completed', 'failed', 'progress', 'active', 'waiting', 'stalled', 'removed'];

    for (const qe of queueEvents) {
      for (const eventName of eventNames) {
        const handler = (payload: unknown) => {
          const data = JSON.stringify({ queue: qe.name, event: eventName, payload });
          res.write(`data: ${data}\n\n`);
        };
        qe.on(eventName, handler);
        listeners.push({ qe, event: eventName, handler });
      }
    }

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    function cleanup() {
      clearInterval(heartbeat);
      for (const { qe, event, handler } of listeners) {
        qe.removeListener(event, handler);
      }
    }

    req.on('close', cleanup);
    res.on('error', cleanup);
  });

  return router;
}
