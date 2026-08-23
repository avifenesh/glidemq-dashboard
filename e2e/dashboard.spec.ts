import { test, expect } from './fixtures';

test.beforeEach(async ({ page, dashboardUrl }) => {
  await page.goto(`${dashboardUrl}/`);
  await expect(page.getByText('payments', { exact: true }).first()).toBeVisible();
});

test('overview shows queues and metric totals', async ({ page }) => {
  await expect(page).toHaveTitle('glide-mq dashboard');
  await expect(page.getByText('glide-mq', { exact: true })).toBeVisible();
  await expect(page.getByText('payments', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('email', { exact: true }).first()).toBeVisible();
  await expect(page.locator('#mCompleted')).toHaveText('10');
  await expect(page.locator('#mFailed')).toHaveText('3');
  await expect(page.locator('#mWaiting')).toHaveText('5');
  await expect(page.locator('#mActive')).toHaveText('2');
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
});

test('selecting a queue lists jobs, failed retry, and inspector', async ({ page }) => {
  await page.getByText('payments', { exact: true }).first().click();
  await expect(page.locator('#queueName')).toHaveText('payments');
  await expect(page.locator('#queueStateTag')).toHaveText('RUNNING');
  await expect(page.getByText('j-wait')).toBeVisible();
  await expect(page.getByText('j-fail')).toBeVisible();
  await expect(page.getByText('j-done')).toBeVisible();

  await page.locator('.filter-tab', { hasText: 'Failed' }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByText('j-fail')).toBeVisible();
  await expect(page.getByText('j-wait')).toHaveCount(0);

  await page.getByText('j-fail').click();
  await expect(page.locator('#inspectorTitle')).toHaveText('Job #j-fail');
  await expect(page.getByText('Job Data')).toBeVisible();
  await expect(page.getByText('card declined')).toBeVisible();
});

test('filter and queue navigation leave search mode', async ({ page }) => {
  await page.getByText('payments', { exact: true }).first().click();
  await page.locator('#searchInput').fill('charge');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('j-wait')).toBeVisible();

  await page.locator('.filter-tab', { hasText: 'Failed' }).click();
  await expect(page.getByText('j-fail')).toBeVisible();
  await expect(page.getByText('j-wait')).toHaveCount(0);

  await page.locator('#searchInput').fill('charge');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('j-wait')).toBeVisible();
  await page.getByText('email', { exact: true }).first().click();
  await expect(page.locator('#queueName')).toHaveText('email');
  await expect(page.getByText('j-wait')).toHaveCount(0);
});

test('pause updates the queue state tag and toast', async ({ page }) => {
  await page.getByText('payments', { exact: true }).first().click();
  await page.locator('#btnPauseResume').click();
  await expect(page.getByText('Queue paused')).toBeVisible();
  await expect(page.locator('#queueStateTag')).toHaveText('PAUSED');
  await expect(page.locator('#btnPauseResume')).toHaveText('Resume');
});

test('drain confirm overlay completes the drain', async ({ page }) => {
  await page.getByText('payments', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Drain' }).click();
  await expect(page.getByText('Drain Queue')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Queue drained')).toBeVisible();
});

test('workers, schedulers, DLQ, and metrics panels render seeded data', async ({ page }) => {
  await page.getByText('payments', { exact: true }).first().click();

  await page.getByText('Workers', { exact: true }).click();
  await expect(page.getByText('w1')).toBeVisible();
  await expect(page.getByText('127.0.0.1')).toBeVisible();

  await page.getByText('Schedulers', { exact: true }).click();
  await expect(page.getByText('daily')).toBeVisible();
  await expect(page.getByText('0 0 * * *')).toBeVisible();

  await page.getByText('DLQ', { exact: true }).click();
  await expect(page.getByRole('cell', { name: 'd1' })).toBeVisible();
  await expect(page.getByText('dead-job')).toBeVisible();
  await expect(page.getByText('max retries')).toBeVisible();

  await page.getByText('Metrics', { exact: true }).click();
  await expect(page.locator('#metricsContent').getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.locator('#metricsContent').getByText('100')).toBeVisible();
  await expect(page.getByText('Completed (last 60 minutes)')).toBeVisible();
});

test('events bar is present', async ({ page }) => {
  await expect(page.getByText('Events', { exact: true })).toBeVisible();
  await expect(page.locator('#eventCount')).toHaveText('0');
});
