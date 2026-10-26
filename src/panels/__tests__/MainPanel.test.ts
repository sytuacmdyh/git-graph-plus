// Modified by sytuacmdyh for Git Graph YZC: independent extension identity.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// MainPanel hosts the webview and routes ~80 message types to GitService. We
// can't run a real WebviewPanel, but with a vscode mock (panel + webview) and a
// controllable GitService we can capture the onDidReceiveMessage handler and
// assert the routing, refresh, sequence-guard, and error-handling behaviour.
const H = vi.hoisted(() => {
  const git: Record<string, ReturnType<typeof vi.fn>> = {
    log: vi.fn(async () => []),
    prepareFileHistory: vi.fn(async () => {}),
    branches: vi.fn(async () => []),
    tags: vi.fn(async () => []),
    remotes: vi.fn(async () => []),
    stashList: vi.fn(async () => []),
    worktreeList: vi.fn(async () => []),
    merge: vi.fn(async () => {}),
    fastForwardRef: vi.fn(async () => {}),
    stashPop: vi.fn(async () => {}),
    showCommitDiff: vi.fn(async () => []),
    showCommitFiles: vi.fn(async () => []),
    resolveDiffBaseRef: vi.fn(async () => 'parentsha'),
    getEmptyTreeRef: vi.fn(async () => '4b825dc642cb6eb9a060e54bf8d69288fbee4904'),
    fileExistsAtRef: vi.fn(async () => true),
    getConflictFiles: vi.fn(async () => []),
    getOperationState: vi.fn(async () => ({ type: null })),
    getRemoteUrl: vi.fn(async () => ''),
    stashSave: vi.fn(async () => {}),
    checkout: vi.fn(async () => {}),
    pull: vi.fn(async () => {}),
    clean: vi.fn(async () => {}),
    setWarningHandler: vi.fn(),
    setAuthRetryHandler: vi.fn(),
    setExtraEnv: vi.fn(),
    setDefaultTimeout: vi.fn(),
  };
  return {
    git,
    messageHandler: null as null | ((m: unknown) => unknown),
    panel: null as null | { webview: { postMessage: ReturnType<typeof vi.fn> } },
    repos: [] as Array<{ path: string; name: string; type: string }>,
  };
});

vi.mock('vscode', () => {
  const makePanel = () => {
    const webview = {
      html: '',
      cspSource: 'vscode-webview:',
      asWebviewUri: (u: unknown) => u,
      postMessage: vi.fn(),
      onDidReceiveMessage: (cb: (m: unknown) => unknown) => { H.messageHandler = cb; return { dispose() {} }; },
    };
    const panel = {
      webview,
      onDidDispose: () => ({ dispose() {} }),
      reveal: vi.fn(),
      dispose: vi.fn(),
      iconPath: undefined as unknown,
      viewColumn: 1,
    };
    H.panel = panel;
    return panel;
  };
  return {
    window: {
      createWebviewPanel: vi.fn(makePanel),
      activeTextEditor: undefined,
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(async () => undefined),
      showSaveDialog: vi.fn(async () => undefined),
    },
    workspace: {
      getConfiguration: () => ({ get: (_k: string, d?: unknown) => d }),
      getWorkspaceFolder: () => ({ uri: { fsPath: '/repo' } }),
      workspaceFolders: [{ uri: { fsPath: '/repo' } }],
      onDidChangeConfiguration: () => ({ dispose() {} }),
      fs: { writeFile: vi.fn(async () => {}) },
    },
    commands: { executeCommand: vi.fn() },
    l10n: { t: (k: string) => k },
    env: { language: 'en', clipboard: { writeText: vi.fn() } },
    Uri: {
      joinPath: () => ({}),
      file: (p: string) => ({ fsPath: p, with(o: object) { return { ...this, ...o }; } }),
      parse: () => ({ with: () => ({}) }),
    },
    ViewColumn: { One: 1 },
  };
});

vi.mock('../../git/git-service', async (orig) => {
  const actual = await orig<typeof import('../../git/git-service')>();
  return { ...actual, GitService: vi.fn(() => H.git) };
});
vi.mock('../../services/file-watcher', () => ({ FileWatcher: class { enabled = true; suppress() {} dispose() {} } }));
vi.mock('../../services/repo-discovery', () => ({ RepoDiscoveryService: { discoverRepos: vi.fn(async () => H.repos), clearCache: vi.fn() } }));
vi.mock('../../git/vscode-git-bridge', () => ({ triggerVSCodeGitAuth: vi.fn(async () => false) }));

import { MainPanel } from '../MainPanel';
import { GitError } from '../../git/git-service';

const extUri = { fsPath: '/ext' } as unknown as import('vscode').Uri;
const filterValues = new Map<string, unknown>();
const filterStorage = {
  get: vi.fn((key: string) => filterValues.get(key)),
  update: vi.fn(async (key: string, value: unknown) => { filterValues.set(key, value); }),
  keys: () => [...filterValues.keys()],
} as unknown as import('vscode').Memento;
const filterKey = (repo = '/repo') => `gitGraphYzc.repoFilters.v1:${repo}`;

function reopenPanel(repo = '/repo', restart = false) {
  (MainPanel.currentPanel as unknown as { dispose(): void }).dispose();
  if (restart) MainPanel.setFilterStorage(filterStorage);
  MainPanel.createOrShow(extUri, repo);
}

function posted() {
  return (H.panel!.webview.postMessage.mock.calls.map(c => c[0])) as Array<{ type: string; payload?: Record<string, unknown> }>;
}
function postedOfType(type: string) {
  return posted().filter(m => m.type === type);
}
async function dispatch(msg: unknown) {
  await H.messageHandler!(msg);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default git behaviour after clearAllMocks wiped implementations.
  for (const k of Object.keys(H.git)) H.git[k].mockReset();
  H.git.log.mockResolvedValue([]);
  H.git.prepareFileHistory.mockResolvedValue(undefined);
  H.git.branches.mockResolvedValue([]);
  H.git.tags.mockResolvedValue([]);
  H.git.remotes.mockResolvedValue([]);
  H.git.stashList.mockResolvedValue([]);
  H.git.worktreeList.mockResolvedValue([]);
  H.git.getOperationState.mockResolvedValue({ type: null });
  H.git.getConflictFiles.mockResolvedValue([]);
  H.git.getRemoteUrl.mockResolvedValue('');
  H.git.showCommitDiff.mockResolvedValue([]);
  H.git.fileExistsAtRef.mockResolvedValue(true);
  H.git.getEmptyTreeRef.mockResolvedValue('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  H.repos = [{ path: '/repo', name: 'repo', type: 'root' }];
  filterValues.clear();
  MainPanel.setFilterStorage(filterStorage);
  (MainPanel as unknown as { currentPanel: unknown }).currentPanel = undefined;
  MainPanel.createOrShow(extUri, '/repo');
});

afterEach(() => {
  (MainPanel.currentPanel as unknown as { dispose?: () => void } | undefined)?.dispose?.();
  (MainPanel as unknown as { currentPanel: unknown }).currentPanel = undefined;
});

const commit = (hash: string) => ({
  hash, abbreviatedHash: hash.slice(0, 7), subject: 's', body: '', parents: [], refs: [],
  author: { name: '', email: '', date: '' }, committer: { name: '', email: '', date: '' },
});

describe('MainPanel construction', () => {
  it('queues Explorer file history until the initial graph has loaded', async () => {
    await MainPanel.showFileHistoryWithPanel(extUri, '/repo', 'deleted.ts');
    expect(postedOfType('showFileHistory')).toHaveLength(0);
    await dispatch({ type: 'getLog', payload: {} });
    expect(postedOfType('showFileHistory')).toEqual([{ type: 'showFileHistory', payload: { path: 'deleted.ts' } }]);
    const types = posted().map(m => m.type);
    expect(types.indexOf('showFileHistory')).toBeGreaterThan(types.indexOf('logData'));
  });

  it('switches repository before opening Explorer file history', async () => {
    await dispatch({ type: 'getLog', payload: {} });
    await MainPanel.showFileHistoryWithPanel(extUri, '/other', 'old.ts');
    const messages = posted();
    const history = messages.findIndex(m => m.type === 'showFileHistory');
    expect(history).toBeGreaterThan(messages.findIndex(m => m.type === 'repoList' && m.payload?.active === '/other'));
    expect(history).toBeGreaterThan(messages.findIndex(m => m.type === 'fullRefresh'));
    expect(messages[history].payload).toEqual({ path: 'old.ts' });
  });

  it('keeps only the latest Explorer request while the webview is starting', async () => {
    await MainPanel.currentPanel!.postRefresh();
    await MainPanel.showFileHistoryWithPanel(extUri, '/repo', 'first.ts');
    await MainPanel.showFileHistoryWithPanel(extUri, '/repo', 'latest.ts');
    expect(postedOfType('showFileHistory')).toHaveLength(0);
    await dispatch({ type: 'getLog', payload: {} });
    expect(postedOfType('showFileHistory')).toEqual([{ type: 'showFileHistory', payload: { path: 'latest.ts' } }]);
  });

  it('drops a queued Explorer request after a different repository is selected', async () => {
    await MainPanel.showFileHistoryWithPanel(extUri, '/repo', 'old.ts');
    await MainPanel.currentPanel!.switchRepo('/other');
    await dispatch({ type: 'getLog', payload: {} });
    expect(postedOfType('showFileHistory')).toHaveLength(0);
  });

  it('creates a webview panel, sets its html, and posts the locale', () => {
    expect(H.panel).not.toBeNull();
    expect(H.panel!.webview).toBeDefined();
    expect(postedOfType('setLocale').length).toBeGreaterThan(0);
  });
});

describe('MainPanel message routing', () => {
  it('getLog fetches log + branches and posts logData', async () => {
    H.git.log.mockResolvedValue([commit('aaaaaaa1'), commit('bbbbbbb2')]);
    await dispatch({ type: 'getLog', payload: {} });
    expect(H.git.log).toHaveBeenCalled();
    expect(H.git.branches).toHaveBeenCalled();
    const data = postedOfType('logData').at(-1)!;
    expect((data.payload!.commits as unknown[]).length).toBe(2);
    expect(data.payload!.hasMore).toBe(false);
  });

  it('getLog reports hasMore and trims to the requested limit', async () => {
    // Requesting limit 1 fetches limit+1; returning 2 means "there is more".
    H.git.log.mockResolvedValue([commit('a1'), commit('b2')]);
    await dispatch({ type: 'getLog', payload: { limit: 1 } });
    const data = postedOfType('logData').at(-1)!;
    expect(data.payload!.hasMore).toBe(true);
    expect((data.payload!.commits as unknown[]).length).toBe(1);
  });

  it('openDiff for a commit builds the left URI from the resolved parent SHA, not the ~1 shorthand', async () => {
    const vscode = await import('vscode');
    H.git.resolveDiffBaseRef.mockResolvedValue('1111111111111111111111111111111111111111');

    await dispatch({ type: 'openDiff', payload: { file: 'doc.md', commitHash: '2222222' } });

    expect(H.git.resolveDiffBaseRef).toHaveBeenCalledWith('2222222');
    const diffCall = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
      .find(c => c[0] === 'vscode.diff')!;
    expect(diffCall).toBeDefined();
    const leftUri = diffCall[1] as { query: string };
    const leftRef = JSON.parse(leftUri.query).ref;
    expect(leftRef).toBe('1111111111111111111111111111111111111111');
    expect(leftRef).not.toContain('~1');
  });

  it('openDiff for a new staged file diffs the empty tree against the index (HEAD has no such file)', async () => {
    const vscode = await import('vscode');
    // HEAD lacks the new file, the index has it.
    H.git.fileExistsAtRef.mockImplementation(async (ref: string) => ref !== 'HEAD');

    await dispatch({ type: 'openDiff', payload: { file: 'added.txt', staged: true } });

    const diffCall = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
      .find(c => c[0] === 'vscode.diff')!;
    expect(diffCall).toBeDefined();
    const leftRef = JSON.parse((diffCall[1] as { query: string }).query).ref;
    const rightRef = JSON.parse((diffCall[2] as { query: string }).query).ref;
    expect(leftRef).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904'); // empty tree
    expect(rightRef).toBe(''); // index
  });

  it('openDiff for a new untracked file diffs the empty tree as the base (index has no such file)', async () => {
    const vscode = await import('vscode');
    // The file is absent from the index (untracked).
    H.git.fileExistsAtRef.mockResolvedValue(false);

    await dispatch({ type: 'openDiff', payload: { file: 'untracked.txt', staged: false } });

    const diffCall = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
      .find(c => c[0] === 'vscode.diff')!;
    expect(diffCall).toBeDefined();
    const leftRef = JSON.parse((diffCall[1] as { query: string }).query).ref;
    expect(leftRef).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904'); // empty tree base
  });

  it('openDiff for a file added in a commit diffs the empty tree against the commit (parent lacks it)', async () => {
    const vscode = await import('vscode');
    H.git.resolveDiffBaseRef.mockResolvedValue('1111111111111111111111111111111111111111');
    // The file exists at the commit but not at its parent (it was added there).
    H.git.fileExistsAtRef.mockImplementation(async (ref: string) => ref === '2222222');

    await dispatch({ type: 'openDiff', payload: { file: 'rebase-demo.txt', commitHash: '2222222' } });

    const diffCall = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
      .find(c => c[0] === 'vscode.diff')!;
    expect(diffCall).toBeDefined();
    const leftRef = JSON.parse((diffCall[1] as { query: string }).query).ref;
    const rightRef = JSON.parse((diffCall[2] as { query: string }).query).ref;
    expect(leftRef).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904'); // empty tree (parent has no file)
    expect(rightRef).toBe('2222222');
  });

  it('revealInExplorer resolves the repo path and runs revealFileInOS', async () => {
    const vscode = await import('vscode');

    await dispatch({ type: 'revealInExplorer', payload: { file: 'src/app.ts' } });

    const call = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
      .find(c => c[0] === 'revealFileInOS')!;
    expect(call).toBeDefined();
    expect((call[1] as { fsPath: string }).fsPath).toBe('/repo/src/app.ts');
  });

  it('copyFilePath copies the absolute path to the clipboard', async () => {
    const vscode = await import('vscode');

    await dispatch({ type: 'copyFilePath', payload: { file: 'src/app.ts' } });

    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('/repo/src/app.ts');
    expect(postedOfType('operationComplete').some(m => m.payload?.operation === 'copied')).toBe(true);
  });

  it('getBranches posts branchData with all the sidebar collections', async () => {
    await dispatch({ type: 'getBranches' });
    const data = postedOfType('branchData').at(-1)!;
    expect(data.payload).toHaveProperty('branches');
    expect(data.payload).toHaveProperty('tags');
    expect(data.payload).toHaveProperty('worktrees');
  });

  it('getCommitDiff posts the file list for the commit', async () => {
    H.git.showCommitFiles.mockResolvedValue([{ path: 'a.ts', status: 'M' }]);
    await dispatch({ type: 'getCommitDiff', payload: { hash: 'h1' } });
    expect(H.git.showCommitFiles).toHaveBeenCalledWith('h1');
    const data = postedOfType('commitDiffData').at(-1)!;
    expect(data.payload!.hash).toBe('h1');
  });

  it('merge calls GitService.merge then refreshes the whole view', async () => {
    await dispatch({ type: 'merge', payload: { branch: 'feature' } });
    expect(H.git.merge).toHaveBeenCalledWith('feature', expect.anything());
    expect(postedOfType('operationComplete').length).toBeGreaterThan(0);
    expect(postedOfType('fullRefresh').length).toBeGreaterThan(0);
  });

  it('checkout with stash stashes before checking out', async () => {
    await dispatch({ type: 'checkout', payload: { ref: 'main', stash: true } });
    expect(H.git.stashSave).toHaveBeenCalled();
    expect(H.git.checkout).toHaveBeenCalledWith('main', expect.anything());
  });

  it('rejects switchRepo to a path outside the discovered repo list', async () => {
    await new Promise(r => setTimeout(r, 0)); // let sendRepoList populate cachedRepos
    await dispatch({ type: 'switchRepo', payload: { path: '/somewhere/else' } });
    expect(postedOfType('error').length).toBeGreaterThan(0);
  });
});

describe('MainPanel error handling', () => {
  it('posts notGitRepo when git reports "not a git repository"', async () => {
    H.git.log.mockRejectedValue(new GitError('fatal: not a git repository', 128, ['log']));
    await dispatch({ type: 'getLog', payload: {} });
    expect(postedOfType('notGitRepo').length).toBeGreaterThan(0);
  });

  it('surfaces a plain error when a mutation fails without a conflict', async () => {
    H.git.merge.mockRejectedValue(new GitError('fatal: some failure', 1, ['merge']));
    H.git.getConflictFiles.mockResolvedValue([]);
    await dispatch({ type: 'merge', payload: { branch: 'x' } });
    expect(postedOfType('error').length).toBeGreaterThan(0);
  });

  it('posts conflictData when a failing mutation leaves conflicted files', async () => {
    H.git.merge.mockRejectedValue(new GitError('CONFLICT', 1, ['merge']));
    H.git.getConflictFiles.mockResolvedValue(['a.ts']);
    H.git.getOperationState.mockResolvedValue({ type: 'merge' });
    await dispatch({ type: 'merge', payload: { branch: 'x' } });
    const data = postedOfType('conflictData').at(-1)!;
    expect(data.payload!.operation).toBe('merge');
    expect((data.payload!.files as unknown[]).length).toBe(1);
  });
});

// These cover the non-trivial orchestration the simpler route+post+refresh
// cases don't: stash/pop recovery, no-op detection, and the stale-response
// sequence guard. The rest of the ~80 message cases mirror `merge` and aren't
// worth duplicating.
describe('MainPanel orchestration logic', () => {
  it('fastForward without checkout updates only the ref and refreshes the graph', async () => {
    await dispatch({ type: 'fastForward', payload: { local: 'topic', remote: 'upstream/trunk', noCheckout: true } });
    expect(H.git.fastForwardRef).toHaveBeenCalledWith('topic', 'upstream/trunk');
    expect(H.git.checkout).not.toHaveBeenCalled();
    expect(H.git.merge).not.toHaveBeenCalled();
    expect(H.git.stashSave).not.toHaveBeenCalled();
    expect(H.git.clean).not.toHaveBeenCalled();
    expect(postedOfType('operationComplete').at(-1)?.payload?.success).toBe(true);
    expect(postedOfType('fullRefresh').length).toBeGreaterThan(0);
  });

  it('fastForward (checkout path) stashes, checks out, ff-merges, then pops', async () => {
    await dispatch({ type: 'fastForward', payload: { local: 'main', remote: 'origin/main', stash: true } });
    expect(H.git.stashSave).toHaveBeenCalled();
    expect(H.git.checkout).toHaveBeenCalledWith('main', {});
    expect(H.git.merge).toHaveBeenCalledWith('origin/main', { ffOnly: true });
    expect(H.git.stashPop).toHaveBeenCalledWith(0);
    expect(postedOfType('operationComplete').length).toBeGreaterThan(0);
  });

  it('fastForward surfaces an error when the post-merge stash pop fails', async () => {
    H.git.stashPop.mockRejectedValueOnce(new Error('pop conflict'));
    await dispatch({ type: 'fastForward', payload: { local: 'main', remote: 'origin/main', stash: true } });
    const err = postedOfType('error').at(-1)!;
    expect(err.payload!.message).toBe('stashPopAfterFastForwardFailed');
  });

  it('pull with stash pops afterwards and surfaces a failed pop', async () => {
    H.git.pull = vi.fn(async () => '');
    H.git.stashPop.mockRejectedValueOnce(new Error('pop conflict'));
    await dispatch({ type: 'pull', payload: { stash: true } });
    expect(H.git.stashSave).toHaveBeenCalled();
    expect(H.git.pull).toHaveBeenCalled();
    expect(postedOfType('error').at(-1)!.payload!.message).toBe('stashPopAfterPullFailed');
  });

  it('stashSave reports "no changes" when the stash count does not grow', async () => {
    H.git.stashList.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // before == after
    await dispatch({ type: 'stashSave', payload: {} });
    expect(postedOfType('error').at(-1)!.payload!.message).toBe('noChangesToStash');
  });

  it('stashSave confirms success when a new stash entry appears', async () => {
    H.git.stashList
      .mockResolvedValueOnce([])                    // before
      .mockResolvedValueOnce([{ index: 0 }] as never); // after
    await dispatch({ type: 'stashSave', payload: { message: 'wip' } });
    expect(H.git.stashSave).toHaveBeenCalled();
    expect(postedOfType('operationComplete').some(m => m.payload!.operation === 'stashSave')).toBe(true);
  });

  it('drops a stale file-diff response so a slower earlier request cannot clobber a newer one', async () => {
    let resolveFirst!: (v: unknown) => void;
    H.git.showCommitDiff
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r as (v: unknown) => void; }))
      .mockResolvedValueOnce([{ file: 'b.ts', hunks: [] }] as never);

    const p1 = dispatch({ type: 'getFileDiff', payload: { hash: 'h', file: 'a.ts' } });
    const p2 = dispatch({ type: 'getFileDiff', payload: { hash: 'h', file: 'b.ts' } });
    await p2; // newest request resolves and is delivered
    resolveFirst([{ file: 'a.ts', hunks: [] }]); // older request resolves late
    await p1;

    const diffs = postedOfType('fileDiffData');
    expect(diffs).toHaveLength(1);
    expect(diffs[0].payload!.file).toBe('b.ts');
  });

  it('discards a stale getLog from the previous repo after switching repos', async () => {
    // Two repos so the switchRepo allow-list check passes.
    H.repos = [
      { path: '/repo', name: 'repo', type: 'root' },
      { path: '/repo-b', name: 'repo-b', type: 'nested' },
    ];
    await dispatch({ type: 'getRepoList' }); // populate cachedRepos

    // First getLog (against the old repo) is held in-flight; later log() calls
    // (the switch's refreshAll + the new repo's getLog) return the new commits.
    let resolveOld!: (v: unknown) => void;
    H.git.log
      .mockImplementationOnce(() => new Promise(r => { resolveOld = r as (v: unknown) => void; }))
      .mockResolvedValue([commit('bbbbbbb2')] as never);

    const pOld = dispatch({ type: 'getLog', payload: {} }); // old repo, in-flight
    await vi.waitFor(() => expect(H.git.log).toHaveBeenCalledTimes(1));

    // Switching must not reset the sequence counter, or the next getLog reuses
    // the same seq number and the stale in-flight response sneaks past the guard.
    await dispatch({ type: 'switchRepo', payload: { path: '/repo-b' } });
    await dispatch({ type: 'getLog', payload: {} }); // new repo

    // The old repo's log resolves late with its (foreign) commits.
    resolveOld([commit('aaaaaaa1')]);
    await pOld;

    const logs = postedOfType('logData');
    const lastCommits = logs.at(-1)!.payload!.commits as Array<{ hash: string }>;
    expect(lastCommits.map(c => c.hash)).toEqual(['bbbbbbb2']);
    // The foreign commit from the old repo must never reach the webview.
    expect(logs.some(l => (l.payload!.commits as Array<{ hash: string }>).some(c => c.hash === 'aaaaaaa1'))).toBe(false);
  });

  it('refreshAll applies the saved filter before the first getLog so it does not flash the full unfiltered graph', async () => {
    filterValues.set(filterKey(), { branches: ['origin/main'], remoteFilter: ['origin'] });
    H.git.branches.mockResolvedValue([{ name: 'origin/main', remote: 'origin' }]);
    H.git.remotes.mockResolvedValue([{ name: 'origin' }]);
    reopenPanel('/repo', true);
    // An early refresh and the initial request must both use restored filters.
    await MainPanel.currentPanel!.postRefresh();
    await dispatch({ type: 'getLog', payload: {} });
    for (const call of H.git.log.mock.calls) {
      expect(call[0]).toMatchObject({ remoteFilter: ['origin'], branches: ['origin/main'] });
    }
    const refresh = postedOfType('fullRefresh').at(-1)!;
    expect(refresh.payload!.logData).toMatchObject({ remoteFilter: ['origin'], branches: ['origin/main'] });
  });
});

describe('MainPanel — persistent repository filters', () => {
  it('keeps filters when loading more without resending the selection', async () => {
    await dispatch({ type: 'getLog', payload: { branches: ['origin/main'], remoteFilter: ['origin'] } });
    await dispatch({ type: 'getLog', payload: { limit: 200 } });
    expect(H.git.log.mock.calls.at(-1)![0]).toMatchObject({ branches: ['origin/main'], remoteFilter: ['origin'], limit: 201 });
    expect(postedOfType('logData').at(-1)!.payload).toMatchObject({ branches: ['origin/main'], remoteFilter: ['origin'] });
  });

  it.each([false, true])('restores selections after reopening (restart=%s)', async restart => {
    H.git.branches.mockResolvedValue([{ name: 'origin/main', remote: 'origin' }]);
    H.git.remotes.mockResolvedValue([{ name: 'origin' }]);
    await dispatch({ type: 'getLog', payload: { branches: ['origin/main'], remoteFilter: ['origin'] } });
    // Saved while the panel is still open, without relying on disposal.
    await vi.waitFor(() => expect(filterValues.get(filterKey())).toEqual({ branches: ['origin/main'], remoteFilter: ['origin'] }));
    reopenPanel('/repo', restart);
    H.git.log.mockClear();
    await dispatch({ type: 'getLog', payload: {} });
    expect(H.git.log).toHaveBeenCalledTimes(1);
    expect(H.git.log.mock.calls[0][0]).toMatchObject({ branches: ['origin/main'], remoteFilter: ['origin'] });
    expect(postedOfType('logData').at(-1)!.payload).toMatchObject({ branches: ['origin/main'], remoteFilter: ['origin'] });
  });

  it('remembers each repository independently and restores when switching back', async () => {
    H.repos.push({ path: '/repo-b', name: 'b', type: 'nested' });
    H.git.branches.mockResolvedValue([{ name: 'main' }, { name: 'dev' }]);
    await dispatch({ type: 'getRepoList' });
    await dispatch({ type: 'getLog', payload: { branches: ['main'], remoteFilter: ['local'] } });
    await dispatch({ type: 'switchRepo', payload: { path: '/repo-b' } });
    expect(postedOfType('fullRefresh').at(-1)!.payload!.logData).toMatchObject({ branches: [], remoteFilter: [] });
    await dispatch({ type: 'getLog', payload: { branches: ['dev'], remoteFilter: [] } });
    await dispatch({ type: 'switchRepo', payload: { path: '/repo' } });
    expect(H.git.log.mock.calls.at(-1)![0]).toMatchObject({ branches: ['main'], remoteFilter: ['local'] });
    await dispatch({ type: 'switchRepo', payload: { path: '/repo-b' } });
    expect(H.git.log.mock.calls.at(-1)![0]).toMatchObject({ branches: ['dev'], remoteFilter: [] });
  });

  it('persists explicit All after a repository-switch refresh', async () => {
    filterValues.set(filterKey('/repo-b'), { branches: ['main'], remoteFilter: ['local'] });
    H.repos.push({ path: '/repo-b', name: 'b', type: 'nested' });
    H.git.branches.mockResolvedValue([{ name: 'main' }]);
    await dispatch({ type: 'getRepoList' });
    await dispatch({ type: 'switchRepo', payload: { path: '/repo-b' } });
    await dispatch({ type: 'getLog', payload: { branches: [], remoteFilter: [] } });
    await vi.waitFor(() => expect(filterValues.get(filterKey('/repo-b'))).toEqual({ branches: [], remoteFilter: [] }));
    reopenPanel('/repo-b', true);
    await dispatch({ type: 'getLog', payload: {} });
    expect(H.git.log.mock.calls.at(-1)![0]).toMatchObject({ branches: [], remoteFilter: [] });
  });

  it.each([
    { saved: ['main', 'deleted', 'origin/main', 'origin/HEAD'], sources: ['local', 'removed'], expected: ['main'], expectedSources: ['local'] },
    { saved: ['deleted'], sources: ['origin'], expected: [], expectedSources: ['origin'] },
    { saved: ['main'], sources: ['removed'], expected: ['main'], expectedSources: [] },
    { saved: ['deleted'], sources: ['removed'], expected: [], expectedSources: [] },
  ])('cleans stale saved selections: $saved / $sources', async ({ saved, sources, expected, expectedSources }) => {
    filterValues.set(filterKey(), { branches: saved, remoteFilter: sources });
    H.git.branches.mockResolvedValue([{ name: 'main' }, { name: 'origin/main', remote: 'origin' }, { name: 'origin/HEAD', remote: 'origin' }]);
    H.git.remotes.mockResolvedValue([{ name: 'origin' }]);
    reopenPanel('/repo', true);
    await dispatch({ type: 'getLog', payload: {} });
    expect(H.git.log.mock.calls.at(-1)![0]).toMatchObject({ branches: expected, remoteFilter: expectedSources });
    await vi.waitFor(() => expect(filterValues.get(filterKey())).toEqual({ branches: expected, remoteFilter: expectedSources }));
  });

  it('discards a refresh that finishes after a newer selection', async () => {
    let resolveOld!: (value: unknown[]) => void;
    H.git.log.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const oldRefresh = MainPanel.currentPanel!.postRefresh();
    await vi.waitFor(() => expect(H.git.log).toHaveBeenCalledTimes(1));
    await dispatch({ type: 'getLog', payload: { branches: ['main'], remoteFilter: [] } });
    resolveOld([]);
    await oldRefresh;
    expect(postedOfType('fullRefresh')).toHaveLength(0);
    expect(postedOfType('logData').at(-1)!.payload!.branches).toEqual(['main']);
  });

  it('discards a refresh from an old repository and runs the queued refresh for the new one', async () => {
    H.repos.push({ path: '/repo-b', name: 'b', type: 'nested' });
    await dispatch({ type: 'getRepoList' });
    let resolveOld!: (value: unknown[]) => void;
    H.git.log.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const oldRefresh = MainPanel.currentPanel!.postRefresh();
    await vi.waitFor(() => expect(H.git.log).toHaveBeenCalledTimes(1));
    await dispatch({ type: 'switchRepo', payload: { path: '/repo-b' } });
    H.git.log.mockResolvedValue([commit('bbbbbbb2')]);
    resolveOld([commit('aaaaaaa1')]);
    await oldRefresh;
    await vi.waitFor(() => expect(postedOfType('fullRefresh')).toHaveLength(1));
    const logData = postedOfType('fullRefresh')[0].payload!.logData as { commits: Array<{ hash: string }> };
    expect(logData.commits.map(c => c.hash)).toEqual(['bbbbbbb2']);
  });

  it('discards restoration still in flight after switching repositories', async () => {
    filterValues.set(filterKey(), { branches: ['main'], remoteFilter: [] });
    H.repos.push({ path: '/repo-b', name: 'b', type: 'nested' });
    reopenPanel('/repo', true);
    await dispatch({ type: 'getRepoList' });
    let resolveBranches!: (value: unknown[]) => void;
    H.git.branches.mockImplementationOnce(() => new Promise(resolve => { resolveBranches = resolve; }));
    const oldLog = dispatch({ type: 'getLog', payload: {} });
    await dispatch({ type: 'switchRepo', payload: { path: '/repo-b' } });
    resolveBranches([{ name: 'main' }]);
    await oldLog;
    expect(H.git.log).toHaveBeenCalledTimes(1);
    expect(H.git.log.mock.calls[0][0]).toMatchObject({ branches: [], remoteFilter: [] });
    expect(filterValues.get(filterKey())).toEqual({ branches: ['main'], remoteFilter: [] });
  });
});

describe('MainPanel file history', () => {
  it('warms file detection after publishing the graph, once per filter scope', async () => {
    H.git.prepareFileHistory.mockImplementation(async () => {
      expect(postedOfType('logData').length).toBeGreaterThan(0);
    });
    await dispatch({ type: 'getLog', payload: { limit: 1 } });
    await dispatch({ type: 'getLog', payload: { limit: 2 } });
    expect(H.git.prepareFileHistory).toHaveBeenCalledTimes(1);
    await dispatch({ type: 'getLog', payload: { branches: ['main'], remoteFilter: ['local'] } });
    expect(H.git.prepareFileHistory).toHaveBeenLastCalledWith({ branches: ['main'], remoteFilter: ['local'], sortOrder: 'topological' });
    expect(H.git.prepareFileHistory).toHaveBeenCalledTimes(2);
  });

  it('routes the exact path, scope, and sort order and correlates the response', async () => {
    H.git.getFileHistory = vi.fn(async () => ({ recognized: true, path: 'file', hashes: ['older'] }));
    await dispatch({ type: 'getFileHistory', payload: { requestId: 'query', file: './file', branches: ['main'], remoteFilter: ['local'] } });
    expect(H.git.getFileHistory).toHaveBeenCalledWith('./file', { branches: ['main'], remoteFilter: ['local'], sortOrder: 'topological' });
    expect(postedOfType('fileHistoryResult').at(-1)?.payload).toEqual({ requestId: 'query', recognized: true, path: 'file', hashes: ['older'] });
  });

  it('discards a canceled query and correlates a query error', async () => {
    let resolve!: (result: unknown) => void;
    H.git.getFileHistory = vi.fn(() => new Promise(r => { resolve = r; }));
    const request = dispatch({ type: 'getFileHistory', payload: { requestId: 'old', file: 'file', branches: [], remoteFilter: [] } });
    await dispatch({ type: 'cancelFileHistory' });
    resolve({ recognized: true, path: 'file', hashes: ['stale'] });
    await request;
    expect(postedOfType('fileHistoryResult')).toHaveLength(0);
    H.git.getFileHistory.mockRejectedValue(new Error('timeout'));
    await dispatch({ type: 'getFileHistory', payload: { requestId: 'new', file: 'file', branches: [], remoteFilter: [] } });
    expect(postedOfType('fileHistoryResult').at(-1)?.payload).toMatchObject({ requestId: 'new', error: 'timeout' });
  });

  it('grows the ordinary graph until the target is loaded, retaining intermediate commits', async () => {
    H.git.log.mockResolvedValueOnce([commit('new'), commit('middle')])
      .mockResolvedValueOnce([commit('new'), commit('middle'), commit('old')]);
    await dispatch({ type: 'getLog', payload: { limit: 1, targetHash: 'old', requestId: 'navigation' } });
    expect(H.git.log).toHaveBeenCalledTimes(2);
    expect(postedOfType('logData').at(-1)?.payload).toMatchObject({
      requestId: 'navigation', targetHash: 'old', hasMore: false,
      commits: [commit('new'), commit('middle'), commit('old')],
    });
  });

  it('does not publish an in-flight graph expansion after cancellation', async () => {
    let resolve!: (commits: unknown[]) => void;
    H.git.log.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const request = dispatch({ type: 'getLog', payload: { limit: 1, targetHash: 'old', requestId: 'navigation' } });
    // getLog awaits filter restoration before starting the subprocess.
    await Promise.resolve();
    await dispatch({ type: 'cancelFileHistory' });
    resolve([commit('new'), commit('old')]);
    await request;
    expect(postedOfType('logData')).toHaveLength(0);
  });
});
