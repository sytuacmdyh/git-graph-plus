import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import App from '../App.svelte';
import { uiStore } from '../lib/stores/ui.svelte';
import { i18n } from '../lib/i18n/index.svelte';

const stats = {
  byAuthor: [{ author: 'Alice', email: 'alice@example.com', count: 2 }],
  startDate: '2025-10-14', endDate: '2026-10-13',
  byDay: [{ date: '2026-10-13', author: 'Alice', email: 'alice@example.com', count: 2 }],
};

function deliverStats() {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'statsData', payload: stats } }));
}

function requestedTypes() {
  return globalThis.__postedMessages.map(m => (m.data as { type: string }).type);
}

beforeEach(() => {
  i18n.setLocale('en');
  uiStore.viewMode = 'stats';
  uiStore.operating = null;
  uiStore.setError(null);
  globalThis.__postedMessages = [];
});

afterEach(cleanup);

describe('Stats refresh in the app', () => {
  it('retries a pending stats request with the toolbar and finishes on statsData', async () => {
    const { container } = render(App);
    expect(container.querySelector('.stats-view .spinner')).not.toBeNull();
    globalThis.__postedMessages = [];
    const refresh = container.querySelector('.codicon-refresh')!.closest('button')!;
    await fireEvent.click(refresh);
    expect(requestedTypes()).toEqual(['getStats']);
    expect(uiStore.operating).toBe('refresh');
    deliverStats();
    await waitFor(() => expect(container.querySelectorAll('.heatmap-cell')).toHaveLength(365));
    expect(uiStore.operating).toBeNull();
  });

  it('uses the same stats refresh path for Ctrl+R', async () => {
    render(App);
    globalThis.__postedMessages = [];
    await fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    expect(requestedTypes()).toEqual(['getStats']);
    expect(uiStore.operating).toBe('refresh');
    deliverStats();
    await waitFor(() => expect(uiStore.operating).toBeNull());
  });
});
