import express from 'express';
import { Queue, Worker } from 'glide-mq';
import { createDashboard } from './src/index';

const connection = { addresses: [{ host: 'localhost', port: 6379 }] };

const fast = new Queue('fast-queue', { connection });
const slow = new Queue('slow-queue', { connection });
const flaky = new Queue('flaky-queue', { connection });

const fastWorker = new Worker('fast-queue', async (job) => {
  await new Promise(r => setTimeout(r, 30 + Math.random() * 70));
  return { processed: job.name, seq: job.data.i };
}, { connection, concurrency: 5, blockTimeout: 1000 });

const slowWorker = new Worker('slow-queue', async (job) => {
  await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
  return { result: 'done', size: job.data.size };
}, { connection, concurrency: 1, blockTimeout: 1000 });

const flakyWorker = new Worker('flaky-queue', async (job) => {
  await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
  if (Math.random() < 0.3) throw new Error('Random failure on attempt ' + (job.attemptsMade + 1));
  return { ok: true };
}, { connection, concurrency: 3, blockTimeout: 1000 });

fastWorker.on('error', () => {});
slowWorker.on('error', () => {});
flakyWorker.on('error', () => {});

async function seed() {
  for (let i = 0; i < 30; i++) {
    await fast.add('task', { i, ts: Date.now() });
  }
  for (let i = 0; i < 10; i++) {
    await slow.add('batch', { size: Math.floor(Math.random() * 1000) }, { delay: i * 1500 });
  }
  for (let i = 0; i < 20; i++) {
    await flaky.add('work', { i }, {
      attempts: 3, backoff: { type: 'exponential', delay: 500 },
    });
  }
  console.log('Seeded: 30 fast, 10 slow (delayed), 20 flaky (with retries)');
}

const app = express();
app.use('/dashboard', createDashboard([fast, slow, flaky], {
  // readOnly: true,               // Uncomment to disable all mutations
  // authorize: (req, action) => { // Uncomment for custom auth
  //   return req.headers['x-admin-key'] === 'secret';
  // },
}));

app.listen(3000, async () => {
  console.log('Dashboard: http://localhost:3000/dashboard');
  await seed();
});
