// Modified by sytuacmdyh for Git Graph YZC: independent extension identity.
import * as vscode from 'vscode';
import { GitService } from '../git/git-service';
import type { WorktreeInfo } from '../git/types';

export class WorktreesViewProvider implements vscode.TreeDataProvider<WorktreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WorktreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private gitService: GitService) {}

  public setGitService(gitService: GitService): void {
    this.gitService = gitService;
    this.cache = null;
    this.refresh();
  }

  private cache: WorktreeItem[] | null = null;
  private pending: Promise<void> | null = null;

  private fetchId = 0;

  refresh(): Promise<void> { this.pending = this.doFetch(); return this.pending; }

  prefetch(): Promise<void> {
    if (!this.pending) this.pending = this.doFetch();
    return this.pending;
  }

  private async doFetch(): Promise<void> {
    const id = ++this.fetchId;
    try { this.cache = (await this.gitService.worktreeList()).map(w => new WorktreeItem(w)); }
    catch { /* keep old cache */ }
    if (id === this.fetchId) { this.pending = null; this._onDidChangeTreeData.fire(); }
  }

  dispose(): void { this._onDidChangeTreeData.dispose(); }

  getTreeItem(element: WorktreeItem): vscode.TreeItem { return element; }

  async getChildren(element?: WorktreeItem): Promise<WorktreeItem[]> {
    if (element) return [];
    if (this.cache) return this.cache;
    try { this.cache = (await this.gitService.worktreeList()).map(w => new WorktreeItem(w)); }
    catch { /* ignore */ }
    return this.cache ?? [];
  }
}

class WorktreeItem extends vscode.TreeItem {
  constructor(public readonly worktree: WorktreeInfo) {
    const branch = worktree.branch || '(detached)';
    const label = worktree.isMain
      ? `${branch} (main)`
      : branch;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.contextValue = worktree.isMain ? 'worktree-main' : 'worktree';
    this.iconPath = new vscode.ThemeIcon(
      worktree.locked ? 'lock' : worktree.isMain ? 'home' : 'worktree'
    );
    this.description = [worktree.hash.substring(0, 7), worktree.subject].filter(Boolean).join('  ');
    this.command = {
      command: 'gitGraphYzc.openWorktree',
      title: 'Open Worktree',
      arguments: [this],
    };
    this.tooltip = [
      `Path: ${worktree.path}`,
      `Branch: ${branch}`,
      `HEAD: ${worktree.hash}`,
      worktree.subject ? `Subject: ${worktree.subject}` : '',
      worktree.locked ? 'Locked' : '',
      worktree.prunable ? 'Prunable' : '',
    ].filter(Boolean).join('\n');
  }
}
