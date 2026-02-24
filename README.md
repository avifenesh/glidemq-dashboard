# @glidemq/dashboard

Web dashboard for monitoring and managing [glide-mq](https://github.com/avifenesh/glide-mq) queues. Express middleware that serves a real-time UI and REST API.

## Installation

```bash
npm install @glidemq/dashboard
```

**Peer dependencies:** `glide-mq >= 0.8.0`, `express ^4 || ^5`

## Quick Start

```typescript
import express from 'express';
import { Queue } from 'glide-mq';
import { createDashboard } from '@glidemq/dashboard';

const app = express();
const queue = new Queue('payments', { connection: { addresses: [{ host: 'localhost', port: 6379 }] } });

app.use('/dashboard', createDashboard([queue]));
app.listen(3000);
// Open http://localhost:3000/dashboard
```

## Options

```typescript
createDashboard(queues: Queue[], opts?: DashboardOptions): Router
```

| Option | Type | Description |
|--------|------|-------------|
| `queueEvents` | `QueueEvents[]` | Instances to stream real-time SSE events from |
| `readOnly` | `boolean` | When `true`, all mutation routes return 403 |
| `authorize` | `(req, action) => boolean \| Promise<boolean>` | Custom auth callback for mutation routes |

### Authorization

Every mutation endpoint (POST/DELETE) calls the `authorize` callback with the Express request and an action string before executing. Return `false` to deny (403).

**Action strings:** `queue:pause`, `queue:resume`, `queue:obliterate`, `queue:drain`, `queue:retryAll`, `queue:clean`, `job:remove`, `job:retry`, `job:promote`

```typescript
// Read-only mode - no mutations allowed
app.use('/dashboard', createDashboard(queues, { readOnly: true }));

// Custom auth - check session cookie
app.use('/dashboard', createDashboard(queues, {
  authorize: (req, action) => {
    const user = req.session?.user;
    if (!user) return false;
    // Only admins can obliterate
    if (action === 'queue:obliterate') return user.role === 'admin';
    return true;
  },
}));
```

## API Endpoints

### Read

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Dashboard UI |
| GET | `/api/queues` | All queues with job counts |
| GET | `/api/queues/:name/jobs` | Jobs by state (query: `state`, `start`, `end`) |
| GET | `/api/queues/:name/job/:id` | Single job with logs and state |
| GET | `/api/queues/:name/workers` | Connected workers |
| GET | `/api/queues/:name/schedulers` | Job schedulers (repeatable jobs) |
| GET | `/api/queues/:name/dlq` | Dead letter queue jobs |
| GET | `/api/queues/:name/metrics` | Completed/failed throughput counts |
| GET | `/api/queues/:name/search` | Search jobs (query: `name`, `state`, `data`, `limit`) |
| GET | `/api/events` | SSE event stream (real-time) |

### Mutations (guarded by `readOnly` / `authorize`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/queues/:name/pause` | Pause queue |
| POST | `/api/queues/:name/resume` | Resume queue |
| POST | `/api/queues/:name/obliterate` | Destroy queue and all data |
| POST | `/api/queues/:name/drain` | Remove all waiting jobs |
| POST | `/api/queues/:name/retry-all` | Bulk retry failed jobs |
| POST | `/api/queues/:name/clean` | Clean old completed/failed jobs |
| DELETE | `/api/queues/:name/jobs/:id` | Remove a job |
| POST | `/api/queues/:name/jobs/:id/retry` | Retry a failed job |
| POST | `/api/queues/:name/jobs/:id/promote` | Promote a delayed job |

## Features

- Queue overview with aggregated job counts
- Job inspector with data, logs, and details tabs
- Real-time event stream via SSE
- Workers monitoring panel
- Job schedulers view
- Dead letter queue panel
- Throughput metrics
- Job search by name
- Bulk actions: drain, retry all, clean
- Per-job actions: retry, remove, promote
- Dark theme, responsive layout
- Express 4 and 5 compatible

## License

Apache-2.0
