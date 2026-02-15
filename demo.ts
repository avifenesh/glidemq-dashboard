import express from 'express';
import { Queue, Worker } from 'glide-mq';
import { createDashboard } from './src/index';

const connection = { addresses: [{ host: 'localhost', port: 6379 }] };

const payments = new Queue('payments', { connection });
const emails = new Queue('emails', { connection });
const reports = new Queue('reports', { connection });

// Workers
const paymentWorker = new Worker('payments', async (job) => {
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
  if (Math.random() < 0.2) throw new Error('Payment declined');
  return { txn: 'txn_' + job.id };
}, { connection, concurrency: 3, blockTimeout: 1000 });

const emailWorker = new Worker('emails', async (job) => {
  await new Promise(r => setTimeout(r, 50));
  return { sent: true };
}, { connection, concurrency: 5, blockTimeout: 1000 });

const reportWorker = new Worker('reports', async (job) => {
  await new Promise(r => setTimeout(r, 500));
  return { rows: Math.floor(Math.random() * 1000) };
}, { connection, concurrency: 1, blockTimeout: 1000 });

paymentWorker.on('error', () => {});
emailWorker.on('error', () => {});
reportWorker.on('error', () => {});

// Seed some jobs
async function seed() {
  for (let i = 0; i < 20; i++) {
    await payments.add('charge', { amount: Math.floor(Math.random() * 500), customer: `cust_${i}` }, {
      attempts: 3, backoff: { type: 'exponential', delay: 500 },
    });
  }
  for (let i = 0; i < 30; i++) {
    await emails.add('welcome', { to: `user${i}@example.com`, template: 'welcome' });
  }
  for (let i = 0; i < 5; i++) {
    await reports.add('daily', { date: '2026-02-15', type: 'revenue' }, { delay: i * 2000 });
  }
  console.log('Seeded: 20 payments, 30 emails, 5 delayed reports');
}

// Express app
const app = express();
app.use('/dashboard', createDashboard([payments, emails, reports]));

app.listen(3000, async () => {
  console.log('Dashboard: http://localhost:3000/dashboard');
  await seed();
});
