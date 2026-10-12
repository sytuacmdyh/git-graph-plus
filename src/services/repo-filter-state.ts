// Modified by sytuacmdyh for Git Graph YZC: independent extension identity.
import * as path from 'path';
import type { Memento } from 'vscode';

export interface RepoFilters {
  branches: string[];
  remoteFilter: string[];
}

/** Workspace-owned storage with an immediate cache and ordered disk writes. */
export class RepoFilterState {
  private readonly cache = new Map<string, RepoFilters>();
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly storage?: Pick<Memento, 'get' | 'update'>) {}

  private key(repoPath: string): string {
    const normalized = process.platform === 'win32'
      ? path.win32.resolve(repoPath).replace(/\\/g, '/').toLowerCase()
      : path.resolve(repoPath);
    return `gitGraphYzc.repoFilters.v1:${normalized}`;
  }

  get(repoPath: string): RepoFilters {
    const key = this.key(repoPath);
    let value = this.cache.get(key);
    if (!value) {
      const saved = this.storage?.get<Partial<RepoFilters> | null>(key);
      const names = (items: unknown): string[] => Array.isArray(items)
        ? [...new Set(items.filter((item): item is string => typeof item === 'string' && item.length > 0))]
        : [];
      value = { branches: names(saved?.branches), remoteFilter: names(saved?.remoteFilter) };
      this.cache.set(key, value);
    }
    return { branches: [...value.branches], remoteFilter: [...value.remoteFilter] };
  }

  set(repoPath: string, filters: RepoFilters): void {
    const key = this.key(repoPath);
    const value = { branches: [...filters.branches], remoteFilter: [...filters.remoteFilter] };
    if (JSON.stringify(this.cache.get(key)) === JSON.stringify(value)) return;
    this.cache.set(key, value);
    const storage = this.storage;
    if (!storage) return;
    this.writes = this.writes
      .then(() => storage.update(key, value))
      .catch(err => { console.warn('Git Graph YZC: failed to save repository filters:', err); });
  }
}
