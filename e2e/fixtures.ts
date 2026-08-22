import { test as base, expect } from '@playwright/test';
import type { Server } from 'node:http';
import { makeApp } from '../tests/helpers/app';

type Fixtures = {
  dashboardUrl: string;
};

function resolved<T>(value: T) {
  return () => Promise.resolve(value);
}

function mockJob(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'test-job',
    data: { key: 'value' },
    opts: {},
    progress: 0,
    attemptsMade: 0,
    timestamp: Date.now(),
    remove: resolved(undefined),
    retry: resolved(undefined),
    promote: resolved(undefined),
    getState: resolved('waiting'),
    ...overrides,
  };
}

function mockQueue(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    getJobCounts: resolved({ waiting: 5, active: 2, delayed: 1, completed: 10, failed: 3 }),
    isPaused: resolved(false),
    getJobs: resolved([]),
    getJob: resolved(null),
    getJobLogs: resolved({ logs: [], count: 0 }),
    pause: resolved(undefined),
    resume: resolved(undefined),
    obliterate: resolved(undefined),
    drain: resolved(undefined),
    retryJobs: resolved(5),
    clean: resolved(['1', '2']),
    getWorkers: resolved([]),
    getRepeatableJobs: resolved([]),
    getDeadLetterJobs: resolved([]),
    getMetrics: resolved({ count: 42, data: [], meta: { resolution: 'minute' } }),
    getFlowUsage: resolved({ tokens: {}, totalTokens: 0, costs: {}, totalCost: 0, jobCount: 0, models: {} }),
    getFlowBudget: resolved(null),
    getUsageSummary: resolved({
      startTime: 0,
      endTime: 60000,
      bucketSizeMs: 60000,
      queues: [name],
      jobCount: 1,
      tokens: { input: 100 },
      totalTokens: 100,
      costs: { total: 0.01 },
      totalCost: 0.01,
      costUnit: 'usd',
      models: { 'gpt-5.4': 1 },
      perQueue: {
        [name]: {
          jobCount: 1,
          tokens: { input: 100 },
          totalTokens: 100,
          costs: { total: 0.01 },
          totalCost: 0.01,
          costUnit: 'usd',
          models: { 'gpt-5.4': 1 },
        },
      },
    }),
    readStream: resolved([]),
    searchJobs: resolved([]),
    ...overrides,
  };
}

function createSeededApp() {
  const waiting = mockJob('j-wait', { name: 'charge', getState: resolved('waiting') });
  const completed = mockJob('j-done', {
    name: 'charge',
    returnvalue: { ok: true },
    getState: resolved('completed'),
  });
  const failed = mockJob('j-fail', {
    name: 'charge',
    failedReason: 'card declined',
    getState: resolved('failed'),
  });
  const delayed = mockJob('j-delay', { name: 'charge', getState: resolved('delayed') });
  const jobsById = new Map([waiting, completed, failed, delayed].map((job) => [job.id, job]));
  const jobsByState: Record<string, typeof waiting[]> = {
    waiting: [waiting],
    active: [],
    delayed: [delayed],
    completed: [completed],
    failed: [failed],
  };

  const payments = mockQueue('payments', {
    getJobs: (state: string) => Promise.resolve(jobsByState[state] ?? []),
    getJob: (id: string) => Promise.resolve(jobsById.get(id) ?? null),
    getJobLogs: resolved({ logs: ['charged'], count: 1 }),
    getWorkers: resolved([
      { id: 'w1', addr: '127.0.0.1', pid: 1234, startedAt: Date.now(), age: 5000, activeJobs: 2 },
    ]),
    getRepeatableJobs: resolved([
      { name: 'daily', entry: { pattern: '0 0 * * *', nextRun: Date.now() + 86400000, template: { name: 'digest' } } },
    ]),
    getDeadLetterJobs: resolved([
      mockJob('d1', { name: 'dead-job', failedReason: 'max retries' }),
    ]),
    getMetrics: (type: string) =>
      Promise.resolve({
        count: type === 'completed' ? 100 : 5,
        data: [{ timestamp: Date.now(), count: 3, avgDuration: 120 }],
        meta: { resolution: 'minute' },
      }),
  });

  const email = mockQueue('email', {
    getJobCounts: resolved({ waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 }),
    isPaused: resolved(true),
  });

  return makeApp([payments, email]);
}

export const test = base.extend<Fixtures>({
  dashboardUrl: async ({}, use) => {
    const app = createSeededApp();
    const server = await new Promise<Server>((resolve, reject) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started));
      started.on('error', reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('dashboard fixture failed to bind a port');
    }
    await use(`http://127.0.0.1:${addr.port}/dash`);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
      server.closeAllConnections();
    });
  },
});

export { expect };
