import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, waitFor, fireEvent } from '@testing-library/svelte';
import StatsView from '../StatsView.svelte';
import { i18n } from '../../../lib/i18n/index.svelte';

const authors = [
  { author: 'Alice', email: 'a@x.com', count: 30 },
  { author: 'Alice', email: 'other@x.com', count: 10 },
  { author: 'Inactive', email: 'old@x.com', count: 5 },
];
const days = [
  { date: '2024-02-29', author: 'Alice', email: 'a@x.com', count: 3 },
  { date: '2024-02-29', author: 'Alice', email: 'other@x.com', count: 2 },
  { date: '2024-10-14', author: 'Alice', email: 'a@x.com', count: 1 },
];

function deliverStats(byAuthor = authors, byDay = days) {
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'statsData', payload: { byAuthor, byDay, startDate: '2023-10-16', endDate: '2024-10-14' } },
  }));
}

beforeEach(() => {
  i18n.setLocale('en');
  globalThis.__postedMessages = [];
});

afterEach(cleanup);

describe('StatsView', () => {
  it('requests stats data and shows a spinner before data arrives', () => {
    const { container } = render(StatsView);
    expect(globalThis.__postedMessages.some(m => (m.data as { type?: string }).type === 'getStats')).toBe(true);
    expect(container.querySelector('.loading .spinner')).not.toBeNull();
  });

  it('ends loading on a stats error and allows a successful retry', async () => {
    const { container } = render(StatsView);
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'error', payload: { source: 'getStats', message: 'Statistics unavailable' } },
    }));
    await waitFor(() => expect(container.querySelector('.loading .spinner')).toBeNull());
    expect(container.textContent).toContain('Statistics unavailable');
    globalThis.__postedMessages = [];
    await fireEvent.click(container.querySelector('.stats-retry')!);
    expect(globalThis.__postedMessages.some(m => (m.data as { type?: string }).type === 'getStats')).toBe(true);
    expect(container.querySelector('.loading .spinner')).not.toBeNull();
    deliverStats();
    await waitFor(() => expect(container.querySelectorAll('.heatmap-cell')).toHaveLength(365));
    expect(container.textContent).not.toContain('Statistics unavailable');
  });

  it('renders a complete year including zero days and leap day, with all contributors selected', async () => {
    const { container } = render(StatsView);
    deliverStats();
    await waitFor(() => expect(container.querySelectorAll('.heatmap-cell')).toHaveLength(365));
    expect(container.querySelectorAll('.heatmap-week')).toHaveLength(53);
    expect(container.querySelectorAll('.author-row')).toHaveLength(3);
    expect(container.querySelector('.heatmap-cell')?.getAttribute('data-date')).toBe('2023-10-16');
    expect(Array.from(container.querySelectorAll('.heatmap-cell')).at(-1)?.getAttribute('data-date')).toBe('2024-10-14');
    expect(container.querySelector('[data-date="2024-02-29"]')?.getAttribute('data-count')).toBe('5');
    expect(container.querySelector('[data-date="2023-10-16"]')?.getAttribute('data-count')).toBe('0');
    expect(container.textContent).toContain('6 commits in the last year');
    expect(container.textContent).toContain('45 commits');
    expect(container.querySelector('.all-contributors')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('.heatmap-legend-cell')).toHaveLength(5);
    expect(container.querySelector('[data-date="2024-02-29"]')?.getAttribute('aria-label')).toBe('5 commits on February 29, 2024');
  });

  it('filters by exact contributor, switches contributors, and restores all commits', async () => {
    const { container } = render(StatsView);
    deliverStats();
    await waitFor(() => expect(container.querySelectorAll('.author-row')).toHaveLength(3));
    const rows = container.querySelectorAll<HTMLButtonElement>('.author-row');
    const count = () => container.querySelector('[data-date="2024-02-29"]')?.getAttribute('data-count');
    await fireEvent.click(rows[0]);
    expect(count()).toBe('3');
    expect(rows[0].getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('4 commits in the last year');
    await fireEvent.click(rows[1]);
    expect(count()).toBe('2');
    expect(rows[0].getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(rows[1]);
    expect(count()).toBe('5');
    await fireEvent.click(rows[2]);
    expect(count()).toBe('0');
    expect(container.textContent).toContain('0 commits in the last year');
    await fireEvent.click(container.querySelector('.all-contributors')!);
    expect(count()).toBe('5');
  });

  it('renders a zero-filled calendar for an empty repository', async () => {
    const { container } = render(StatsView);
    deliverStats([], []);
    await waitFor(() => expect(container.querySelectorAll('.heatmap-cell')).toHaveLength(365));
    expect(container.querySelectorAll('[data-count="0"]')).toHaveLength(365);
    expect(container.textContent).toContain('0 commits in the last year');
    expect(container.textContent).not.toContain('NaN');
  });
});
