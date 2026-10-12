import { describe, it, expect, vi } from 'vitest';
import type { Memento } from 'vscode';
import { RepoFilterState } from '../repo-filter-state';

function storageMock() {
  const values = new Map<string, unknown>();
  const get = vi.fn((key: string) => values.get(key));
  const update = vi.fn(async (key: string, value: unknown) => { values.set(key, value); });
  return { values, get, update, storage: { get, update } as unknown as Memento };
}

describe('RepoFilterState', () => {
  it('normalizes absolute paths while preserving case on Linux', () => {
    const state = new RepoFilterState();
    state.set('/repo/sub/..', { branches: ['main'], remoteFilter: ['local'] });
    expect(state.get('/repo/')).toEqual({ branches: ['main'], remoteFilter: ['local'] });
    expect(state.get('/Repo')).toEqual({ branches: [], remoteFilter: [] });
  });

  it('normalizes Windows separators and case', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const state = new RepoFilterState();
      state.set('C:\\Projects\\Repo\\', { branches: ['main'], remoteFilter: [] });
      expect(state.get('c:/projects/repo')).toEqual({ branches: ['main'], remoteFilter: [] });
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('defaults missing or malformed records to All and deduplicates valid names', () => {
    const { storage, get } = storageMock();
    get.mockReturnValueOnce({ branches: ['main', '', null, 'main'], remoteFilter: 'origin' });
    const state = new RepoFilterState(storage);
    expect(state.get('/repo')).toEqual({ branches: ['main'], remoteFilter: [] });
    expect(state.get('/other')).toEqual({ branches: [], remoteFilter: [] });
  });

  it('keeps cached selections independent from callers mutating returned arrays', () => {
    const state = new RepoFilterState();
    const selection = { branches: ['main'], remoteFilter: ['local'] };
    state.set('/repo', selection);
    selection.branches.push('dev');
    state.get('/repo').remoteFilter.length = 0;
    expect(state.get('/repo')).toEqual({ branches: ['main'], remoteFilter: ['local'] });
  });

  it('serializes rapid writes, exposes the latest selection immediately, and avoids duplicate saves', async () => {
    const { storage, update, values } = storageMock();
    let finishFirst!: () => void;
    update.mockImplementationOnce((key, value) => new Promise<void>(resolve => {
      finishFirst = () => { values.set(key, value); resolve(); };
    }));
    const state = new RepoFilterState(storage);
    state.set('/repo', { branches: ['main'], remoteFilter: [] });
    state.set('/repo', { branches: ['dev'], remoteFilter: ['local'] });
    state.set('/repo', { branches: ['dev'], remoteFilter: ['local'] });
    expect(state.get('/repo')).toEqual({ branches: ['dev'], remoteFilter: ['local'] });
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    finishFirst();
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(new RepoFilterState(storage).get('/repo')).toEqual({ branches: ['dev'], remoteFilter: ['local'] });
  });

  it('keeps session filters after a failed write and still saves later updates', async () => {
    const { storage, update } = storageMock();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      update.mockRejectedValueOnce(new Error('disk unavailable'));
      const state = new RepoFilterState(storage);
      state.set('/repo', { branches: ['main'], remoteFilter: [] });
      await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
      expect(state.get('/repo').branches).toEqual(['main']);
      state.set('/repo', { branches: ['dev'], remoteFilter: [] });
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(new RepoFilterState(storage).get('/repo').branches).toEqual(['dev']);
    } finally {
      warn.mockRestore();
    }
  });
});
