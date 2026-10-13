import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, rmSync, readFileSync, utimesSync } from 'fs';
import { join } from 'path';
import { GitService } from '../../git-service';
import { TempRepo, commit, createTempRepo, runGit } from './helpers';

describe('GitService file history', () => {
  let repo: TempRepo;
  let svc: GitService;
  beforeEach(() => { repo = createTempRepo(); svc = new GitService(repo.path); });
  afterEach(() => repo?.cleanup());

  it('recognizes exact files and orders creation, edits and deletion like the graph', async () => {
    const created = commit(repo.path, 'create', { 'dir/file': 'one' });
    commit(repo.path, 'unrelated', { 'elsewhere': 'x' });
    const edited = commit(repo.path, 'edit', { 'dir/file': 'two' });
    runGit(repo.path, ['rm', 'dir/file']);
    const deleted = commit(repo.path, 'delete');
    expect(await svc.getFileHistory('dir/file', { sortOrder: 'topological' })).toEqual({
      recognized: true, path: 'dir/file', hashes: [deleted, edited, created],
    });
    expect((await svc.getFileHistory('dir')).recognized).toBe(false);
    expect((await svc.getFileHistory('file')).recognized).toBe(false);
    expect((await svc.getFileHistory('missing')).recognized).toBe(false);
  });

  it('follows consecutive renames, including a later deletion', async () => {
    const created = commit(repo.path, 'create old', { 'old.txt': 'same content\n' });
    runGit(repo.path, ['mv', 'old.txt', 'middle.txt']);
    const first = commit(repo.path, 'first rename');
    runGit(repo.path, ['mv', 'middle.txt', 'new.txt']);
    const second = commit(repo.path, 'second rename');
    runGit(repo.path, ['rm', 'new.txt']);
    const deleted = commit(repo.path, 'delete new');
    expect((await svc.getFileHistory('new.txt', { sortOrder: 'topological' })).hashes)
      .toEqual([deleted, second, first, created]);
  });

  it('walks divergent tips independently and deduplicates common history', async () => {
    const created = commit(repo.path, 'base', { 'old.txt': 'original\n' });
    runGit(repo.path, ['switch', '-c', 'feature']);
    runGit(repo.path, ['mv', 'old.txt', 'new.txt']);
    const renameFeature = commit(repo.path, 'feature rename');
    const feature = commit(repo.path, 'feature edit', { 'new.txt': 'feature\n' });
    runGit(repo.path, ['switch', 'main']);
    runGit(repo.path, ['mv', 'old.txt', 'new.txt']);
    const renameMain = commit(repo.path, 'main rename');
    const main = commit(repo.path, 'main edit', { 'new.txt': 'main\n' });
    const result = await svc.getFileHistory('new.txt', { sortOrder: 'topological' });
    expect(new Set(result.hashes)).toEqual(new Set([created, renameFeature, feature, renameMain, main]));
    expect(result.hashes.filter(h => h === created)).toHaveLength(1);
    const graph = await svc.log({ sortOrder: 'topological' });
    expect(result.hashes).toEqual(graph.filter(c => result.hashes.includes(c.hash)).map(c => c.hash));
    expect((await svc.getFileHistory('new.txt', { branches: ['feature'], sortOrder: 'topological' })).hashes)
      .toEqual([feature, renameFeature, created]);
  });

  it('includes branch contributions across a merge', async () => {
    const base = commit(repo.path, 'base', { 'target': 'a\nb\nc\n' });
    runGit(repo.path, ['switch', '-c', 'feature']);
    const feature = commit(repo.path, 'feature', { 'target': 'feature\nb\nc\n' });
    runGit(repo.path, ['switch', 'main']);
    commit(repo.path, 'unrelated', { 'other': 'x' });
    runGit(repo.path, ['merge', '--no-ff', 'feature', '-m', 'merge']);
    const history = await svc.getFileHistory('target', { branches: ['main'] });
    expect(history.hashes).toContain(base);
    expect(history.hashes).toContain(feature);
    expect(new Set(history.hashes).size).toBe(history.hashes.length);
  });

  it('restricts sources and branches with the same precedence as the graph', async () => {
    const base = commit(repo.path, 'base', { 'target': 'one' });
    runGit(repo.path, ['switch', '-c', 'remote-only']);
    const remote = commit(repo.path, 'remote', { 'target': 'remote' });
    runGit(repo.path, ['update-ref', 'refs/remotes/origin/topic', remote]);
    runGit(repo.path, ['switch', 'main']);
    runGit(repo.path, ['branch', '-D', 'remote-only']);
    const local = commit(repo.path, 'local', { 'target': 'local' });
    expect(new Set((await svc.getFileHistory('target', { remoteFilter: ['origin'] })).hashes))
      .toEqual(new Set([remote, base]));
    expect(new Set((await svc.getFileHistory('target', { remoteFilter: ['local'] })).hashes))
      .toEqual(new Set([local, base]));
    expect(new Set((await svc.getFileHistory('target', { remoteFilter: ['origin'], branches: ['main'] })).hashes))
      .toEqual(new Set([local, base]));
  });

  it('recognizes root files and treats Unicode, spaces and metacharacters literally', async () => {
    const hash = commit(repo.path, 'paths', {
      'README': 'root', '目录/a [1]*.txt': 'special', '目录/a 1other.txt': 'other',
    });
    expect((await svc.getFileHistory('README')).hashes).toEqual([hash]);
    expect(await svc.getFileHistory('./目录\\a [1]*.txt')).toEqual({ recognized: true, path: '目录/a [1]*.txt', hashes: [hash] });
    expect((await svc.getFileHistory('目录/a*.txt')).recognized).toBe(false);
    expect((await svc.getFileHistory('目录/')).recognized).toBe(false);
  });

  it('rejects absolute paths, traversal and control characters', async () => {
    for (const path of ['/etc/passwd', 'C:\\repo\\file', '../file', 'dir/../file', 'a\0b', 'a\nb']) {
      await expect(svc.getFileHistory(path)).rejects.toThrow();
    }
  });

  it('returns no history for an untracked file and recognizes a newly staged file', async () => {
    writeFileSync(join(repo.path, 'new.txt'), 'new');
    expect(await svc.getFileHistory('new.txt')).toEqual({ recognized: false, path: 'new.txt', hashes: [] });
    runGit(repo.path, ['add', 'new.txt']);
    expect(await svc.getFileHistory('new.txt')).toEqual({ recognized: true, path: 'new.txt', hashes: [] });
  });

  it('does not rewrite the watched index when reading working-tree status', async () => {
    commit(repo.path, 'base', { 'target.txt': 'unchanged' });
    // Force a stat refresh without modifying the content. A normal git status
    // persists the new stat data, generating another filesystem watcher event.
    utimesSync(join(repo.path, 'target.txt'), new Date(1000000000000), new Date(1000000000000));
    const index = join(repo.path, '.git', 'index');
    const before = readFileSync(index);
    await svc.getUncommittedDiff();
    expect(readFileSync(index).equals(before)).toBe(true);
  });

  it('reuses filename detection for repeated non-file searches', async () => {
    commit(repo.path, 'base', { 'target.txt': 'one' });
    const calls = vi.spyOn(svc as any, 'exec');
    await svc.getFileHistory('not-a-file');
    await svc.getFileHistory('not-a-file');
    const historicalScans = calls.mock.calls.filter(([args]) => (args as string[]).includes('--raw'));
    expect(historicalScans).toHaveLength(1);
  });

  it('uses the warmed filename index for different search terms without scanning history again', async () => {
    commit(repo.path, 'create', { 'deleted.txt': 'old', 'target.txt': 'one' });
    runGit(repo.path, ['rm', 'deleted.txt']);
    commit(repo.path, 'delete');
    await svc.prepareFileHistory({ sortOrder: 'topological' });
    const calls = vi.spyOn(svc as any, 'exec');
    expect((await svc.getFileHistory('missing-one', { sortOrder: 'topological' })).recognized).toBe(false);
    expect((await svc.getFileHistory('missing-two', { sortOrder: 'topological' })).recognized).toBe(false);
    expect(calls.mock.calls.every(([args]) => (args as string[])[0] === 'rev-list' && (args as string[]).includes('--no-walk'))).toBe(true);
    expect((await svc.getFileHistory('deleted.txt', { sortOrder: 'topological' })).recognized).toBe(true);
  });

  it('invalidates filename and result caches after index or branch tips change', async () => {
    const first = commit(repo.path, 'base', { 'target.txt': 'one' });
    expect((await svc.getFileHistory('target.txt')).hashes).toEqual([first]);
    expect((await svc.getFileHistory('new.txt')).recognized).toBe(false);
    writeFileSync(join(repo.path, 'new.txt'), 'new');
    runGit(repo.path, ['add', 'new.txt']);
    expect(await svc.getFileHistory('new.txt')).toEqual({ recognized: true, path: 'new.txt', hashes: [] });
    const second = commit(repo.path, 'edit', { 'target.txt': 'two' });
    expect((await svc.getFileHistory('target.txt', { sortOrder: 'topological' })).hashes).toEqual([second, first]);
    runGit(repo.path, ['reset', '--hard', first]);
    expect((await svc.getFileHistory('new.txt')).recognized).toBe(false);
    expect((await svc.getFileHistory('target.txt')).hashes).toEqual([first]);
  });

  it('shares concurrent filename scans and completed file histories', async () => {
    commit(repo.path, 'base', { 'target.txt': 'one' });
    const calls = vi.spyOn(svc as any, 'exec');
    await Promise.all([svc.getFileHistory('missing-one'), svc.getFileHistory('missing-two')]);
    expect(calls.mock.calls.filter(([args]) => (args as string[]).includes('--raw'))).toHaveLength(1);
    const [a, b] = await Promise.all([svc.getFileHistory('target.txt'), svc.getFileHistory('target.txt')]);
    expect(a).toEqual(b);
    const historyWalks = calls.mock.calls.filter(([args]) => (args as string[]).includes('--follow')).length;
    await svc.getFileHistory('target.txt');
    expect(calls.mock.calls.filter(([args]) => (args as string[]).includes('--follow'))).toHaveLength(historyWalks);
  });

  it('retains more than 100 matching commits', async () => {
    const hashes: string[] = [];
    for (let i = 0; i < 105; i++) hashes.push(commit(repo.path, `edit ${i}`, { 'target': `${i}` }));
    expect((await svc.getFileHistory('target', { sortOrder: 'topological' })).hashes).toEqual(hashes.reverse());
  });

  it('preserves the old path of a staged rename with non-ASCII names', async () => {
    commit(repo.path, 'old', { '旧 文件.txt': 'original' });
    runGit(repo.path, ['mv', '旧 文件.txt', '新 文件.txt']);
    expect((await svc.getUncommittedDiff()).staged).toEqual([
      { path: '新 文件.txt', status: 'R', oldPath: '旧 文件.txt' },
    ]);
    // A deletion remains an exact historical match after the file leaves the index.
    runGit(repo.path, ['reset', '--hard']);
    rmSync(join(repo.path, '旧 文件.txt'));
    expect((await svc.getFileHistory('旧 文件.txt')).recognized).toBe(true);
  });
});
