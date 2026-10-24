import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { TestQueue } from 'glide-mq/testing';
import { makeApp } from './helpers/app';

describe('GlideMQ 0.20 compatibility', () => {
  it('serves scheduler inventory from the real testing SDK', async () => {
    const queue = new TestQueue('dashboard-sdk-compatibility');
    try {
      await queue.upsertJobScheduler('one', { every: 60_000 });
      await queue.upsertJobScheduler('two', { every: 120_000 });
      expect(await queue.getRepeatableJobsBounded(2)).toHaveLength(2);
      await expect(queue.getRepeatableJobsBounded(1)).rejects.toThrow();
      await expect(queue.getRepeatableJobsBounded(0)).rejects.toThrow();
      const res = await request(makeApp([queue])).get('/dash/api/queues/dashboard-sdk-compatibility/schedulers');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    } finally {
      await queue.close();
    }
  });
});
