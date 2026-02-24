import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDashboard } from '../src/index';

// --- Mock factories ---

function mockJob(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'test-job',
    data: { key: 'value' },
    opts: {},
    progress: 0,
    attemptsMade: 0,
    failedReason: undefined,
    returnvalue: undefined,
    timestamp: Date.now(),
    processedOn: undefined,
    finishedOn: undefined,
    remove: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    promote: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue('waiting'),
    ...overrides,
  };
}

function mockQueue(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 5, active: 2, delayed: 1, completed: 10, failed: 3 }),
    isPaused: vi.fn().mockResolvedValue(false),
    getJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    getJobLogs: vi.fn().mockResolvedValue({ logs: [], count: 0 }),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    obliterate: vi.fn().mockResolvedValue(undefined),
    drain: vi.fn().mockResolvedValue(undefined),
    retryJobs: vi.fn().mockResolvedValue(5),
    clean: vi.fn().mockResolvedValue(['1', '2']),
    getWorkers: vi.fn().mockResolvedValue([]),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    getDeadLetterJobs: vi.fn().mockResolvedValue([]),
    getMetrics: vi.fn().mockResolvedValue({ count: 42 }),
    searchJobs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeApp(queues: unknown[], opts?: Record<string, unknown>) {
  const app = express();
  app.use('/dash', createDashboard(queues as any, opts as any));
  return app;
}

// --- Tests ---

describe('GET /', () => {
  it('returns HTML', async () => {
    const app = makeApp([mockQueue('q')]);
    const res = await request(app).get('/dash/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('glide-mq');
  });
});

describe('GET /api/queues', () => {
  it('returns all queues with counts', async () => {
    const q = mockQueue('payments');
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('payments');
    expect(res.body[0].counts).toEqual({ waiting: 5, active: 2, delayed: 1, completed: 10, failed: 3 });
    expect(res.body[0].paused).toBe(false);
  });

  it('returns 500 on error with safe message', async () => {
    const q = mockQueue('q', { getJobCounts: vi.fn().mockRejectedValue(new Error('Redis connection failed')) });
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Redis connection failed');
    expect(res.body.error).not.toContain('stack');
  });
});

describe('GET /api/queues/:name/jobs', () => {
  it('returns serialized jobs', async () => {
    const job = mockJob('j1');
    const q = mockQueue('q', { getJobs: vi.fn().mockResolvedValue([job]) });
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues/q/jobs?state=waiting');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('j1');
    expect(res.body[0].name).toBe('test-job');
  });

  it('returns 404 for unknown queue', async () => {
    const app = makeApp([mockQueue('q')]);
    const res = await request(app).get('/dash/api/queues/nonexistent/jobs');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid state', async () => {
    const app = makeApp([mockQueue('q')]);
    const res = await request(app).get('/dash/api/queues/q/jobs?state=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid state');
  });

  it('clamps pagination to MAX_PAGE_SIZE', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    await request(app).get('/dash/api/queues/q/jobs?state=waiting&start=0&end=99999');
    expect(q.getJobs).toHaveBeenCalledWith('waiting', 0, 200);
  });

  it('fetches all states when no state param provided', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues/q/jobs?start=0&end=50');
    expect(res.status).toBe(200);
    expect(q.getJobs).toHaveBeenCalledTimes(5);
  });
});

describe('GET /api/queues/:name/job/:id', () => {
  it('returns full job with state and logs', async () => {
    const job = mockJob('j1', { getState: vi.fn().mockResolvedValue('completed') });
    const q = mockQueue('q', {
      getJob: vi.fn().mockResolvedValue(job),
      getJobLogs: vi.fn().mockResolvedValue({ logs: ['log1', 'log2'], count: 2 }),
    });
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues/q/job/j1');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('completed');
    expect(res.body.logs).toEqual(['log1', 'log2']);
  });

  it('returns 404 for missing job', async () => {
    const app = makeApp([mockQueue('q')]);
    const res = await request(app).get('/dash/api/queues/q/job/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/queues/:name/pause', () => {
  it('pauses the queue', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    const res = await request(app).post('/dash/api/queues/q/pause');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paused');
    expect(q.pause).toHaveBeenCalled();
  });
});

describe('POST /api/queues/:name/resume', () => {
  it('resumes the queue', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    const res = await request(app).post('/dash/api/queues/q/resume');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resumed');
    expect(q.resume).toHaveBeenCalled();
  });
});

describe('DELETE /api/queues/:name/jobs/:id', () => {
  it('removes the job', async () => {
    const job = mockJob('j1');
    const q = mockQueue('q', { getJob: vi.fn().mockResolvedValue(job) });
    const app = makeApp([q]);
    const res = await request(app).delete('/dash/api/queues/q/jobs/j1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('removed');
    expect(job.remove).toHaveBeenCalled();
  });

  it('returns 404 for missing job', async () => {
    const app = makeApp([mockQueue('q')]);
    const res = await request(app).delete('/dash/api/queues/q/jobs/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/queues/:name/jobs/:id/retry', () => {
  it('retries the job', async () => {
    const job = mockJob('j1');
    const q = mockQueue('q', { getJob: vi.fn().mockResolvedValue(job) });
    const app = makeApp([q]);
    const res = await request(app).post('/dash/api/queues/q/jobs/j1/retry');
    expect(res.status).toBe(200);
    expect(job.retry).toHaveBeenCalled();
  });
});

describe('POST /api/queues/:name/jobs/:id/promote', () => {
  it('promotes a delayed job', async () => {
    const job = mockJob('j1');
    const q = mockQueue('q', { getJob: vi.fn().mockResolvedValue(job) });
    const app = makeApp([q]);
    const res = await request(app).post('/dash/api/queues/q/jobs/j1/promote');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('promoted');
    expect(job.promote).toHaveBeenCalled();
  });
});

describe('POST /api/queues/:name/obliterate', () => {
  it('obliterates the queue', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    const res = await request(app).post('/dash/api/queues/q/obliterate');
    expect(res.status).toBe(200);
    expect(q.obliterate).toHaveBeenCalledWith({ force: true });
  });
});

describe('GET /api/queues/:name/workers', () => {
  it('returns workers array', async () => {
    const workers = [{ id: 'w1', addr: '127.0.0.1', pid: 1234, startedAt: Date.now(), age: 5000, activeJobs: 2 }];
    const q = mockQueue('q', { getWorkers: vi.fn().mockResolvedValue(workers) });
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues/q/workers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('w1');
  });
});

describe('GET /api/queues/:name/schedulers', () => {
  it('returns schedulers array', async () => {
    const schedulers = [{ name: 'daily', entry: { pattern: '0 0 * * *', nextRun: Date.now() + 86400000 } }];
    const q = mockQueue('q', { getRepeatableJobs: vi.fn().mockResolvedValue(schedulers) });
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues/q/schedulers');
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('daily');
  });
});

describe('GET /api/queues/:name/dlq', () => {
  it('returns DLQ jobs', async () => {
    const job = mockJob('d1', { failedReason: 'max retries' });
    const q = mockQueue('q', { getDeadLetterJobs: vi.fn().mockResolvedValue([job]) });
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues/q/dlq');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('d1');
  });
});

describe('GET /api/queues/:name/metrics', () => {
  it('returns completed and failed counts', async () => {
    const q = mockQueue('q', {
      getMetrics: vi.fn().mockImplementation((type: string) =>
        Promise.resolve({ count: type === 'completed' ? 100 : 5 }),
      ),
    });
    const app = makeApp([q]);
    const res = await request(app).get('/dash/api/queues/q/metrics');
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(100);
    expect(res.body.failed).toBe(5);
  });
});

describe('GET /api/queues/:name/search', () => {
  it('calls searchJobs with query params', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    await request(app).get('/dash/api/queues/q/search?name=charge&state=waiting&limit=10');
    expect(q.searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'charge', state: 'waiting', limit: 10 }),
    );
  });
});

describe('POST /api/queues/:name/drain', () => {
  it('drains the queue', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    const res = await request(app)
      .post('/dash/api/queues/q/drain')
      .send({ delayed: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('drained');
    expect(q.drain).toHaveBeenCalledWith(true);
  });
});

describe('POST /api/queues/:name/retry-all', () => {
  it('retries all failed jobs', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    const res = await request(app)
      .post('/dash/api/queues/q/retry-all')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.retried).toBe(5);
  });
});

describe('POST /api/queues/:name/clean', () => {
  it('cleans old jobs', async () => {
    const q = mockQueue('q');
    const app = makeApp([q]);
    const res = await request(app)
      .post('/dash/api/queues/q/clean')
      .send({ grace: 3600000, limit: 100, type: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(2);
  });

  it('returns 400 for missing grace', async () => {
    const app = makeApp([mockQueue('q')]);
    const res = await request(app)
      .post('/dash/api/queues/q/clean')
      .send({ type: 'completed' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const app = makeApp([mockQueue('q')]);
    const res = await request(app)
      .post('/dash/api/queues/q/clean')
      .send({ grace: 1000, type: 'invalid' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events (SSE)', () => {
  it('returns SSE headers', async () => {
    const app = makeApp([mockQueue('q')]);
    const server = app.listen(0);
    const addr = server.address() as import('net').AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${addr.port}/dash/api/events`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      // Abort the streaming response so we don't hang
      if (res.body) {
        const reader = res.body.getReader();
        await reader.cancel();
      }
    } finally {
      server.close();
    }
  });
});

// --- Auth tests ---

describe('readOnly mode', () => {
  const mutationRoutes: [string, string][] = [
    ['post', '/dash/api/queues/q/pause'],
    ['post', '/dash/api/queues/q/resume'],
    ['post', '/dash/api/queues/q/obliterate'],
    ['delete', '/dash/api/queues/q/jobs/1'],
    ['post', '/dash/api/queues/q/jobs/1/retry'],
    ['post', '/dash/api/queues/q/jobs/1/promote'],
    ['post', '/dash/api/queues/q/drain'],
    ['post', '/dash/api/queues/q/retry-all'],
    ['post', '/dash/api/queues/q/clean'],
  ];

  it('blocks all mutation routes with 403', async () => {
    const app = makeApp([mockQueue('q')], { readOnly: true });
    for (const [method, path] of mutationRoutes) {
      const res = await (request(app) as any)[method](path);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('read-only');
    }
  });

  it('allows GET routes', async () => {
    const app = makeApp([mockQueue('q')], { readOnly: true });
    const res = await request(app).get('/dash/api/queues');
    expect(res.status).toBe(200);
  });
});

describe('authorize callback', () => {
  it('allows when authorize returns true', async () => {
    const q = mockQueue('q');
    const app = makeApp([q], { authorize: () => true });
    const res = await request(app).post('/dash/api/queues/q/pause');
    expect(res.status).toBe(200);
    expect(q.pause).toHaveBeenCalled();
  });

  it('blocks when authorize returns false', async () => {
    const q = mockQueue('q');
    const app = makeApp([q], { authorize: () => false });
    const res = await request(app).post('/dash/api/queues/q/pause');
    expect(res.status).toBe(403);
    expect(q.pause).not.toHaveBeenCalled();
  });

  it('works with async authorize', async () => {
    const q = mockQueue('q');
    const app = makeApp([q], { authorize: async () => false });
    const res = await request(app).post('/dash/api/queues/q/obliterate');
    expect(res.status).toBe(403);
    expect(q.obliterate).not.toHaveBeenCalled();
  });

  it('receives action string', async () => {
    const authFn = vi.fn().mockReturnValue(true);
    const q = mockQueue('q');
    const app = makeApp([q], { authorize: authFn });
    await request(app).post('/dash/api/queues/q/pause');
    expect(authFn).toHaveBeenCalledWith(expect.anything(), 'queue:pause');
  });
});
