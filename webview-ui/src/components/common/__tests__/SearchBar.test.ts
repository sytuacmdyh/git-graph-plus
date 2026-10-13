import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SearchBar from '../SearchBar.svelte';
import { i18n } from '../../../lib/i18n/index.svelte';
import { commitStore } from '../../../lib/stores/commits.svelte';
import type { Commit, BranchInfo } from '../../../lib/types';

function commit(over: Partial<Commit>): Commit {
  return {
    hash: 'h',
    abbreviatedHash: 'h',
    author: { name: 'A', email: 'a@x.com', date: '' },
    committer: { name: 'A', email: 'a@x.com', date: '' },
    subject: 'subject',
    body: '',
    parents: [],
    refs: [],
    ...over,
  };
}

function setCommits(commits: Commit[]) {
  commitStore.commits = commits;
}

const baseProps = {
  onResults: vi.fn(),
  onNavigate: vi.fn(),
};

beforeEach(() => {
  i18n.setLocale('en');
  setCommits([]);
  vi.useFakeTimers();
});

describe('SearchBar — basic search', () => {
  it('typing then waiting 150ms triggers a search (debounce)', async () => {
    setCommits([
      commit({ hash: 'h1', subject: 'fix login bug' }),
      commit({ hash: 'h2', subject: 'add feature' }),
    ]);
    const onResults = vi.fn();
    const onNavigate = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults, onNavigate });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'login' } });
    vi.advanceTimersByTime(150);
    expect(onResults).toHaveBeenCalled();
    const matched = onResults.mock.calls.at(-1)![0] as Set<string>;
    expect(matched.has('h1')).toBe(true);
    expect(matched.has('h2')).toBe(false);
    expect(onNavigate).toHaveBeenCalledWith('h1');
  });

  it('clearing the input passes null to onResults', async () => {
    setCommits([commit({ hash: 'h1', subject: 'fix' })]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'fix' } });
    vi.advanceTimersByTime(150);
    onResults.mockClear();
    await fireEvent.input(input, { target: { value: '' } });
    expect(onResults).toHaveBeenLastCalledWith(null);
  });

  it('no-match search passes an empty Set, not null', async () => {
    setCommits([commit({ hash: 'h1', subject: 'fix' })]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'no match here' } });
    vi.advanceTimersByTime(150);
    const matched = onResults.mock.calls.at(-1)![0] as Set<string>;
    expect(matched).toBeInstanceOf(Set);
    expect(matched.size).toBe(0);
  });

  it('matches on author name, email, hash, and refs', async () => {
    setCommits([
      commit({ hash: 'aaa111', author: { name: 'Carol', email: 'c@x.com', date: '' }, subject: 's' }),
      commit({ hash: 'bbb222', subject: 's', refs: [{ type: 'branch', name: 'feature/login' }] }),
      commit({ hash: 'ccc333', subject: 's', refs: [{ type: 'remote-branch', name: 'main', remote: 'origin' }] }),
    ]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;

    await fireEvent.input(input, { target: { value: 'Carol' } });
    vi.advanceTimersByTime(150);
    expect((onResults.mock.calls.at(-1)![0] as Set<string>).has('aaa111')).toBe(true);

    await fireEvent.input(input, { target: { value: 'feature/login' } });
    vi.advanceTimersByTime(150);
    expect((onResults.mock.calls.at(-1)![0] as Set<string>).has('bbb222')).toBe(true);

    await fireEvent.input(input, { target: { value: 'origin/main' } });
    vi.advanceTimersByTime(150);
    expect((onResults.mock.calls.at(-1)![0] as Set<string>).has('ccc333')).toBe(true);
  });
});

describe('SearchBar — keyboard navigation', () => {
  it('Enter goes to next match when there are existing results', async () => {
    setCommits([
      commit({ hash: 'h1', subject: 'match a' }),
      commit({ hash: 'h2', subject: 'match b' }),
    ]);
    const onNavigate = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onNavigate });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'match' } });
    vi.advanceTimersByTime(150);
    onNavigate.mockClear();
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('h2');
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith('h1'); // wraps
  });

  it('Shift+Enter navigates backwards (wraps to last)', async () => {
    setCommits([
      commit({ hash: 'h1', subject: 'match a' }),
      commit({ hash: 'h2', subject: 'match b' }),
    ]);
    const onNavigate = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onNavigate });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'match' } });
    vi.advanceTimersByTime(150);
    onNavigate.mockClear();
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter', shiftKey: true });
    expect(onNavigate).toHaveBeenCalledWith('h2');
  });

  it('Escape with no open dropdown clears the query', async () => {
    setCommits([commit({ hash: 'h1', subject: 'x' })]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'x' } });
    vi.advanceTimersByTime(150);
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('prev/next buttons are disabled when no matches', async () => {
    setCommits([commit({ hash: 'h1', subject: 'foo' })]);
    const { container } = render(SearchBar, baseProps);
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'zzz' } });
    vi.advanceTimersByTime(150);
    const navBtns = container.querySelectorAll<HTMLButtonElement>('.nav-btn');
    // up, down, close (3)
    expect(navBtns[0].disabled).toBe(true);
    expect(navBtns[1].disabled).toBe(true);
  });

  it('clicking the X button clears the search', async () => {
    setCommits([commit({ hash: 'h1', subject: 'foo' })]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'foo' } });
    vi.advanceTimersByTime(150);
    onResults.mockClear();
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.close-btn')!);
    expect(onResults).toHaveBeenCalledWith(null);
    expect(input.value).toBe('');
  });
});

describe('SearchBar — filter UI', () => {
  it('source filter button toggles dropdown open/closed', async () => {
    const { container } = render(SearchBar, { ...baseProps, remotes: ['origin'] });
    expect(container.querySelector('.dropdown')).toBeNull();
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[0]);
    expect(container.querySelector('.dropdown')).not.toBeNull();
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[0]);
    expect(container.querySelector('.dropdown')).toBeNull();
  });

  it('clicking a remote in the source filter calls onFilterChange', async () => {
    const onFilterChange = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, remotes: ['origin', 'upstream'], onFilterChange });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[0]);
    const items = container.querySelectorAll<HTMLButtonElement>('.dd-item');
    // items: [All, Local, origin, upstream]
    await fireEvent.click(items[2]);
    expect(onFilterChange).toHaveBeenCalledWith(['origin']);
  });

  it('"All" item clears the source filter', async () => {
    const onFilterChange = vi.fn();
    const { container } = render(SearchBar, {
      ...baseProps,
      remotes: ['origin'],
      remoteFilter: ['origin'],
      onFilterChange,
    });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[0]);
    const items = container.querySelectorAll<HTMLButtonElement>('.dd-item');
    await fireEvent.click(items[0]);
    expect(onFilterChange).toHaveBeenCalledWith([]);
  });

  it('Enter with empty query clears (no search posted)', async () => {
    setCommits([commit({ hash: 'h1', subject: 'foo' })]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults });
    onResults.mockClear();
    // Press Enter without typing anything — Enter with no matches and no query
    // falls through to doSearch(), which sees empty query and calls clear().
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
    expect(onResults).toHaveBeenLastCalledWith(null);
  });

  it('Escape closes the open branch-filter dropdown without clearing the query', async () => {
    setCommits([commit({ hash: 'h1', subject: 'foo' })]);
    const branches = [{ name: 'main', current: true, ahead: 0, behind: 0, hash: 'h' }];
    const { container } = render(SearchBar, { ...baseProps, branches });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'foo' } });
    vi.advanceTimersByTime(150);
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    expect(container.querySelector('.dropdown')).not.toBeNull();
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Escape' });
    expect(container.querySelector('.dropdown')).toBeNull();
    expect(input.value).toBe('foo');
  });

  it('source filter backdrop click closes the dropdown', async () => {
    const { container } = render(SearchBar, { ...baseProps, remotes: ['origin'] });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[0]);
    expect(container.querySelector('.dropdown')).not.toBeNull();
    await fireEvent.click(container.querySelector<HTMLDivElement>('.backdrop')!);
    expect(container.querySelector('.dropdown')).toBeNull();
  });

  it('branch filter backdrop click closes the dropdown', async () => {
    const { container } = render(SearchBar, {
      ...baseProps,
      branches: [{ name: 'main', current: true, ahead: 0, behind: 0, hash: 'h' }],
    });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    expect(container.querySelector('.dropdown')).not.toBeNull();
    await fireEvent.click(container.querySelector<HTMLDivElement>('.backdrop')!);
    expect(container.querySelector('.dropdown')).toBeNull();
  });

  it('Escape closes the open source-filter dropdown without clearing the query', async () => {
    setCommits([commit({ hash: 'h1', subject: 'foo' })]);
    const { container } = render(SearchBar, { ...baseProps, remotes: ['origin'] });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'foo' } });
    vi.advanceTimersByTime(150);
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[0]);
    expect(container.querySelector('.dropdown')).not.toBeNull();
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Escape' });
    expect(container.querySelector('.dropdown')).toBeNull();
    expect(input.value).toBe('foo');
  });
});

describe('SearchBar — HEAD keyword', () => {
  it('typing HEAD matches the commit carrying a head ref', async () => {
    setCommits([
      commit({ hash: 'h1', subject: 'one' }),
      commit({ hash: 'h2', subject: 'two', refs: [{ type: 'head', name: 'HEAD' }] }),
    ]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onResults });
    const input = container.querySelector<HTMLInputElement>('.search-input')!;
    await fireEvent.input(input, { target: { value: 'HEAD' } });
    vi.advanceTimersByTime(150);
    const matched = onResults.mock.calls.at(-1)![0] as Set<string>;
    expect(matched.has('h2')).toBe(true);
    expect(matched.has('h1')).toBe(false);
  });
});

describe('SearchBar — branch filter', () => {
  const branches: BranchInfo[] = [
    { name: 'main', current: true, ahead: 0, behind: 0, hash: 'h' },
    { name: 'feature/login', current: false, ahead: 0, behind: 0, hash: 'h' },
    { name: 'origin/main', current: false, remote: 'origin', ahead: 0, behind: 0, hash: 'h' },
    { name: 'origin/HEAD', current: false, remote: 'origin', ahead: 0, behind: 0, hash: 'h' },
  ];

  it('lists local and remote branches grouped, skipping origin/HEAD', async () => {
    const { container } = render(SearchBar, { ...baseProps, branches, remotes: ['origin'] });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    const items = Array.from(container.querySelectorAll('.dd-item')).map(el => el.textContent?.trim());
    expect(items.some(t => t?.includes('main'))).toBe(true);
    expect(items.some(t => t?.includes('feature/login'))).toBe(true);
    expect(items.some(t => t === 'origin/HEAD')).toBe(false);
  });

  it('clicking a branch fires onBranchFilterChange', async () => {
    const onBranchFilterChange = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, branches, onBranchFilterChange });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    const items = container.querySelectorAll<HTMLButtonElement>('.dd-item');
    const featureItem = Array.from(items).find(i => i.textContent?.includes('feature/login'))!;
    await fireEvent.click(featureItem);
    expect(onBranchFilterChange).toHaveBeenCalledWith(['feature/login']);
  });

  it('typing in the branch search input narrows the list', async () => {
    const { container } = render(SearchBar, { ...baseProps, branches });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    const search = container.querySelector<HTMLInputElement>('.branch-search-input')!;
    await fireEvent.input(search, { target: { value: 'feat' } });
    const items = Array.from(container.querySelectorAll('.dd-item')).map(el => el.textContent?.trim());
    expect(items.some(t => t?.includes('feature/login'))).toBe(true);
    expect(items.some(t => t === 'main')).toBe(false);
  });

  it('"All branches" item clears the branch filter', async () => {
    const onBranchFilterChange = vi.fn();
    const { container } = render(SearchBar, {
      ...baseProps,
      branches,
      branchFilter: ['main'],
      onBranchFilterChange,
    });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    const items = container.querySelectorAll<HTMLButtonElement>('.dd-item');
    await fireEvent.click(items[0]);
    expect(onBranchFilterChange).toHaveBeenCalledWith([]);
  });

  it('selects all query matches once, retaining previous selections and the open search', async () => {
    const onBranchFilterChange = vi.fn();
    const { container } = render(SearchBar, {
      ...baseProps, branches, branchFilter: ['feature/login', 'main'], onBranchFilterChange,
    });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    const search = container.querySelector<HTMLInputElement>('.branch-search-input')!;
    await fireEvent.input(search, { target: { value: ' MAIN ' } });
    await fireEvent.click(container.querySelector('.select-filtered-branches')!);
    expect(onBranchFilterChange).toHaveBeenCalledTimes(1);
    expect(onBranchFilterChange).toHaveBeenCalledWith(['feature/login', 'main', 'origin/main']);
    expect(container.querySelector('.branch-dropdown')).toBeTruthy();
    expect(search.value).toBe(' MAIN ');
  });

  it('with an empty query selects every visible branch, excluding remote symbolic refs', async () => {
    const onBranchFilterChange = vi.fn();
    const { container } = render(SearchBar, {
      ...baseProps, branches: [...branches, { name: 'origin', remote: 'origin', current: false, ahead: 0, behind: 0, hash: 'h' }],
      onBranchFilterChange,
    });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    await fireEvent.click(container.querySelector('.select-filtered-branches')!);
    expect(onBranchFilterChange).toHaveBeenCalledWith(['main', 'feature/login', 'origin/main']);
  });

  it.each([
    { sources: ['local'], expected: ['main', 'feature/login'] },
    { sources: ['origin'], expected: ['origin/main'] },
    { sources: ['local', 'upstream'], expected: ['main', 'feature/login', 'upstream/main'] },
    { sources: [], expected: ['main', 'feature/login', 'origin/main', 'upstream/main'] },
  ])('bulk selection follows Local/Remote sources: $sources', async ({ sources, expected }) => {
    const onBranchFilterChange = vi.fn();
    const { container } = render(SearchBar, {
      ...baseProps,
      branches: [...branches, { name: 'upstream/main', remote: 'upstream', current: false, ahead: 0, behind: 0, hash: 'h' }],
      remoteFilter: sources, onBranchFilterChange,
    });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    await fireEvent.click(container.querySelector('.select-filtered-branches')!);
    expect(onBranchFilterChange).toHaveBeenCalledWith(expected);
  });

  it('disables bulk selection when no branches match and re-enables it when matches return', async () => {
    const onBranchFilterChange = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, branches, branchFilter: ['main'], onBranchFilterChange });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    const search = container.querySelector<HTMLInputElement>('.branch-search-input')!;
    const bulk = container.querySelector<HTMLButtonElement>('.select-filtered-branches')!;
    await fireEvent.input(search, { target: { value: 'feature' } });
    expect(bulk.disabled).toBe(false);
    await fireEvent.input(search, { target: { value: 'missing' } });
    expect(bulk.disabled).toBe(true);
    await fireEvent.input(search, { target: { value: 'feature/login' } });
    expect(bulk.disabled).toBe(false);
    await fireEvent.click(bulk);
    expect(onBranchFilterChange).toHaveBeenCalledWith(['main', 'feature/login']);
  });

  it('disables bulk selection when every visible branch is already selected', async () => {
    const { container } = render(SearchBar, {
      ...baseProps, branches, branchFilter: ['main', 'feature/login', 'origin/main'],
    });
    await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.filter-btn')[1]);
    expect(container.querySelector<HTMLButtonElement>('.select-filtered-branches')!.disabled).toBe(true);
  });
});

describe('SearchBar — jump to HEAD button', () => {
  it('is disabled when no commit is HEAD', () => {
    setCommits([commit({ hash: 'h1' })]);
    const { container } = render(SearchBar, { ...baseProps });
    const btn = container.querySelector<HTMLButtonElement>('.head-btn')!;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  it('is enabled and calls onJumpToHead when clicked', async () => {
    setCommits([commit({ hash: 'h1', refs: [{ type: 'head', name: 'HEAD' }] })]);
    const onJumpToHead = vi.fn();
    const { container } = render(SearchBar, { ...baseProps, onJumpToHead });
    const btn = container.querySelector<HTMLButtonElement>('.head-btn')!;
    expect(btn.disabled).toBe(false);
    await fireEvent.click(btn);
    expect(onJumpToHead).toHaveBeenCalled();
  });

  it('has the active class when headOffscreen is true', () => {
    setCommits([commit({ hash: 'h1', refs: [{ type: 'head', name: 'HEAD' }] })]);
    const { container } = render(SearchBar, { ...baseProps, headOffscreen: true });
    const btn = container.querySelector<HTMLButtonElement>('.head-btn')!;
    expect(btn.classList.contains('active')).toBe(true);
  });
});

describe('SearchBar — file history', () => {
  async function search(container: HTMLElement, value: string) {
    await fireEvent.input(container.querySelector('.search-input')!, { target: { value } });
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
  }

  it('prefers an exact file match over matching commit text', async () => {
    setCommits([commit({ hash: 'text', subject: 'README.md' }), commit({ hash: 'file' })]);
    const onFileHistory = vi.fn(async () => ({ recognized: true, path: 'README.md', hashes: ['file'] }));
    const onResults = vi.fn();
    const onNavigate = vi.fn();
    const { container } = render(SearchBar, { onResults, onNavigate, onFileHistory });
    await search(container, './README.md');
    expect(onResults).toHaveBeenLastCalledWith(new Set(['file']));
    expect(onNavigate).toHaveBeenCalledWith('file');
    expect(container.querySelector('.file-history-label')?.textContent).toBe('File history');
    expect(container.querySelector<HTMLInputElement>('.search-input')?.value).toBe('README.md');
  });

  it('falls back to text when the path is not recognized', async () => {
    setCommits([commit({ hash: 'text', subject: 'feature/login' })]);
    const onResults = vi.fn();
    const { container } = render(SearchBar, {
      ...baseProps, onResults,
      onFileHistory: async () => ({ recognized: false, path: 'feature/login', hashes: [] }),
    });
    await search(container, 'feature/login');
    expect(onResults).toHaveBeenLastCalledWith(new Set(['text']));
    expect(container.querySelector('.file-history-label')).toBeNull();
  });

  it('keeps explicit file mode for a new file and returns to auto mode after editing', async () => {
    setCommits([commit({ hash: 'text', subject: 'new.txt' })]);
    const onResults = vi.fn();
    const { container, component } = render(SearchBar, {
      ...baseProps, onResults,
      onFileHistory: async () => ({ recognized: false, path: 'new.txt', hashes: [] }),
    });
    component.showFileHistory('new.txt');
    await Promise.resolve();
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Shift' });
    expect(onResults).toHaveBeenLastCalledWith(new Set());
    expect(container.textContent).toContain('No commit history');
    await search(container, 'new.txt');
    expect(onResults).toHaveBeenLastCalledWith(new Set(['text']));
  });

  it('ignores a response after input changes or is cleared', async () => {
    let resolve!: (result: { recognized: boolean; path: string; hashes: string[] }) => void;
    const onResults = vi.fn();
    const { container } = render(SearchBar, {
      ...baseProps, onResults, onFileHistory: () => new Promise(r => { resolve = r; }),
    });
    await search(container, 'first.txt');
    expect(container.textContent).toContain('Searching');
    await fireEvent.input(container.querySelector('.search-input')!, { target: { value: '' } });
    resolve({ recognized: true, path: 'first.txt', hashes: ['stale'] });
    await Promise.resolve();
    expect(onResults).toHaveBeenLastCalledWith(null);
    expect(container.querySelector<HTMLInputElement>('.search-input')!.value).toBe('');
  });

  it('shows failures separately from an empty history', async () => {
    const { container } = render(SearchBar, {
      ...baseProps, onFileHistory: async () => { throw new Error('Git timed out'); },
    });
    await search(container, 'file.txt');
    expect(container.textContent).toContain('Search failed');
    expect(container.textContent).not.toContain('No commit history');
  });

  it('preserves the current result when history changes in the background', async () => {
    const onNavigate = vi.fn();
    const onFileHistory = vi.fn()
      .mockResolvedValueOnce({ recognized: true, path: 'file', hashes: ['new', 'old'] })
      .mockResolvedValueOnce({ recognized: true, path: 'file', hashes: ['newest', 'new', 'old'] });
    const { container, component } = render(SearchBar, { ...baseProps, onNavigate, onFileHistory });
    await search(container, 'file');
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith('old');
    component.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(container.querySelector('.search-count')?.textContent?.replace(/\s/g, '')).toBe('3/3');
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('clears a navigation error when another result succeeds', async () => {
    const onNavigate = vi.fn().mockRejectedValueOnce(new Error('missing')).mockReturnValue(undefined);
    const { container } = render(SearchBar, {
      ...baseProps, onNavigate,
      onFileHistory: async () => ({ recognized: true, path: 'file', hashes: ['missing', 'present'] }),
    });
    await search(container, 'file');
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toContain('Search failed');
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith('present');
    expect(container.textContent).not.toContain('Search failed');
  });

  it('waits for navigation to load an older commit and disables repeated navigation', async () => {
    let finish!: () => void;
    const onNavigate = vi.fn(() => new Promise<void>(r => { finish = r; }));
    const { container } = render(SearchBar, {
      ...baseProps, onNavigate,
      onFileHistory: async () => ({ recognized: true, path: 'file', hashes: ['older', 'oldest'] }),
    });
    await search(container, 'file');
    expect(container.textContent).toContain('Loading commit');
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    await fireEvent.keyDown(container.querySelector('.search-bar')!, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith('oldest');
    finish();
  });
});
