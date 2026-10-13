import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitService } from '../../git-service';
import { TempRepo, commit, createTempRepo, runGit } from './helpers';

describe('GitService integration — search & stats', () => {
  let repo: TempRepo;
  let svc: GitService;

  beforeEach(() => {
    repo = createTempRepo();
    svc = new GitService(repo.path);
  });
  afterEach(() => repo.cleanup());

  describe('searchCommits', () => {
    it('filters by message substring (case-insensitive)', async () => {
      commit(repo.path, 'fix: handle null user');
      commit(repo.path, 'feat: add login flow');
      commit(repo.path, 'refactor: rename helper');

      const results = await svc.searchCommits('feat');
      const subjects = results.map(c => c.subject);
      expect(subjects).toContain('feat: add login flow');
      expect(subjects).not.toContain('fix: handle null user');
    });

    it('filters by author', async () => {
      commit(repo.path, 'one');
      runGit(repo.path, ['commit', '--allow-empty', '-m', 'two', '--author=Alice <alice@example.com>']);
      runGit(repo.path, ['commit', '--allow-empty', '-m', 'three', '--author=Bob <bob@example.com>']);

      const results = await svc.searchCommits('', { author: 'Alice' });
      expect(results.length).toBe(1);
      expect(results[0].author.name).toBe('Alice');
    });

    it('respects the limit option', async () => {
      for (let i = 0; i < 5; i++) commit(repo.path, `match ${i}`);
      const results = await svc.searchCommits('match', { limit: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('searchByFile', () => {
    it('returns commits that touched the given path', async () => {
      commit(repo.path, 'unrelated', { 'a.txt': 'a\n' });
      const c2 = commit(repo.path, 'create target', { 'target.txt': '1\n' });
      const c3 = commit(repo.path, 'modify target', { 'target.txt': '2\n' });

      const results = await svc.searchByFile('target.txt');
      const hashes = results.map(c => c.hash);
      expect(hashes).toContain(c2);
      expect(hashes).toContain(c3);
      expect(results.find(c => c.subject === 'unrelated')).toBeUndefined();
    });

    it('returns empty for an unknown path', async () => {
      commit(repo.path, 'init');
      const results = await svc.searchByFile('does-not-exist.txt');
      expect(results).toEqual([]);
    });
  });

  describe('searchByHash', () => {
    it('returns the matching commit', async () => {
      commit(repo.path, 'first');
      const target = commit(repo.path, 'find me');

      const found = await svc.searchByHash(target);
      expect(found).not.toBeNull();
      expect(found?.hash).toBe(target);
      expect(found?.subject).toBe('find me');
    });

    it('returns null for an unknown hash', async () => {
      commit(repo.path, 'init');
      const found = await svc.searchByHash('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
      expect(found).toBeNull();
    });
  });

  describe('statsCommitsByAuthor', () => {
    it('aggregates commit counts by author', async () => {
      runGit(repo.path, ['commit', '--allow-empty', '-m', '1', '--author=Alice <a@x.com>']);
      runGit(repo.path, ['commit', '--allow-empty', '-m', '2', '--author=Alice <a@x.com>']);
      runGit(repo.path, ['commit', '--allow-empty', '-m', '3', '--author=Bob <b@x.com>']);

      const stats = await svc.statsCommitsByAuthor();
      const alice = stats.find(s => s.author === 'Alice');
      const bob = stats.find(s => s.author === 'Bob');
      expect(alice?.count).toBe(2);
      expect(bob?.count).toBe(1);
      expect(alice?.email).toBe('a@x.com');
    });

    it('counts authors deterministically across multiple commits', async () => {
      runGit(repo.path, ['commit', '--allow-empty', '-m', 'solo', '--author=Charlie <c@x.com>']);
      const stats = await svc.statsCommitsByAuthor();
      expect(stats.length).toBe(1);
      expect(stats[0].author).toBe('Charlie');
      expect(stats[0].count).toBe(1);
    });
  });

  describe('statsCommitsByDay', () => {
    it('groups by author day and identity, including boundaries but excluding old and future dates', async () => {
      const add = (date: string, author = 'Alice <a@x.com>') => runGit(repo.path, [
        'commit', '--allow-empty', '-m', date, `--author=${author}`, `--date=${date}`,
      ]);
      add('2023-10-15T12:00:00Z');
      add('2023-10-16T00:01:00+14:00');
      add('2024-02-29T23:59:00-12:00');
      add('2024-02-29T23:59:00-12:00');
      add('2024-02-29T10:00:00Z', 'Bob <b@x.com>');
      add('2024-10-14T23:59:00-12:00');
      add('2024-10-15T00:01:00+14:00');
      // All committer dates are 2024-01-01; the calendar must use author dates.
      const stats = await svc.statsCommitsByDay(new Date(2024, 9, 14));
      expect(stats.startDate).toBe('2023-10-16');
      expect(stats.endDate).toBe('2024-10-14');
      expect(stats.byDay).toHaveLength(4);
      expect(stats.byDay).toEqual(expect.arrayContaining([
        { date: '2023-10-16', author: 'Alice', email: 'a@x.com', count: 1 },
        { date: '2024-02-29', author: 'Alice', email: 'a@x.com', count: 2 },
        { date: '2024-02-29', author: 'Bob', email: 'b@x.com', count: 1 },
        { date: '2024-10-14', author: 'Alice', email: 'a@x.com', count: 1 },
      ]));
    });

    it('uses the same mailmap identity as the contributor list', async () => {
      commit(repo.path, 'mailmap', { '.mailmap': 'Alice <alice@example.com> Alias <old@example.com>\n' });
      runGit(repo.path, ['commit', '--allow-empty', '-m', 'alias', '--author=Alias <old@example.com>']);
      const stats = await svc.statsCommitsByDay(new Date(2024, 0, 1));
      const author = (await svc.statsCommitsByAuthor()).find(a => a.author === 'Alice');
      expect(author).toEqual({ author: 'Alice', email: 'alice@example.com', count: 1 });
      expect(stats.byDay).toContainEqual({ date: '2024-01-01', ...author });
    });

    it('returns an empty calendar range for a repository with no commits', async () => {
      const stats = await svc.statsCommitsByDay(new Date(2024, 0, 1));
      expect(stats.byDay).toEqual([]);
      expect(stats.endDate).toBe('2024-01-01');
    });
  });
});
