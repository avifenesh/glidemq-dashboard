import { test as base } from '@playwright/test';
import type { Server } from 'node:http';
import { makeApp } from '../tests/helpers/app';
import { mockJob, mockQueue } from '../tests/helpers/queue-fixtures';

type Fixtures = {
  dashboardUrl: string;
};

function resolved<T>(value: T) {
  return () => Promise.resolve(value);
}

function createSeededApp() {
  const waiting = mockJob(resolved, 'j-wait', { name: 'charge', getState: resolved('waiting') });
  const completed = mockJob(resolved, 'j-done', {
    name: 'charge',
    returnvalue: { ok: true },
    getState: resolved('completed'),
  });
  const failed = mockJob(resolved, 'j-fail', {
    name: 'charge',
    failedReason: 'card declined',
    getState: resolved('failed'),
  });
  const delayed = mockJob(resolved, 'j-delay', { name: 'charge', getState: resolved('delayed') });
  const jobsById = new Map([waiting, completed, failed, delayed].map((job) => [job.id, job]));
  const jobsByState: Record<string, typeof waiting[]> = {
    waiting: [waiting],
    active: [],
    delayed: [delayed],
    completed: [completed],
    failed: [failed],
  };

  const payments = mockQueue(resolved, 'payments', {
    getJobs: (state: unknown) => Promise.resolve(jobsByState[String(state)] ?? []),
    searchJobs: resolved([failed]),
    getJob: (id: unknown) => Promise.resolve(jobsById.get(String(id)) ?? null),
    getJobLogs: resolved({ logs: ['charged'], count: 1 }),
    getWorkers: resolved([
      { id: 'w1', addr: '127.0.0.1', pid: 1234, startedAt: Date.now(), age: 5000, activeJobs: 2 },
    ]),
    getRepeatableJobs: resolved([
      { name: 'daily', entry: { pattern: '0 0 * * *', nextRun: Date.now() + 86400000, template: { name: 'digest' } } },
    ]),
    getDeadLetterJobs: resolved([
      mockJob(resolved, 'd1', { name: 'dead-job', failedReason: 'max retries' }),
    ]),
    getMetrics: (type: unknown) =>
      Promise.resolve({
        count: type === 'completed' ? 100 : 5,
        data: [{ timestamp: Date.now(), count: 3, avgDuration: 120 }],
        meta: { resolution: 'minute' },
      }),
  });

  const email = mockQueue(resolved, 'email', {
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

export { expect } from '@playwright/test';
