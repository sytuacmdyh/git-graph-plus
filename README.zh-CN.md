# Git Graph YZC

[![Open VSX](https://img.shields.io/badge/Install-Open%20VSX-a60ee5?logo=eclipse-ide&logoColor=white)](https://open-vsx.org/extension/sytuacmdyh/git-graph-yzc)

[![CI](https://github.com/sytuacmdyh/git-graph-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sytuacmdyh/git-graph-plus/actions/workflows/ci.yml)

[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

[English](README.md) · [한국어](README.ko.md) · [Cursor 发布指南](PUBLISHING.md)

Git Graph YZC 是由 `sytuacmdyh` 独立维护的 [Git Graph Plus](https://github.com/the0807/git-graph-plus) 分支项目，通过 Open VSX 面向 Cursor 发布。本项目增加了“全选已筛选分支”和按仓库记忆分支、Local/Remote 筛选的功能。命令、视图和设置使用独立的 `gitGraphYzc` 命名空间。

在 Cursor 中可视化查看 Git 提交历史、管理分支并执行高级 Git 操作，无需离开编辑器。

> 暂存、提交和行内 blame 使用编辑器内置的源代码管理功能。Git Graph YZC 主要提供提交图、历史浏览和仓库操作。

![Git Graph YZC](resources/main.png)

---

## 功能亮点

- **交互式提交图**：通过不同颜色的分支轨道和合并连线，直观查看提交历史。
- **完整的 Git 工作流**：支持分支、merge、rebase、cherry-pick、reset、stash、worktree、标签和远程仓库操作。
- **筛选分支批量选择**：按搜索词及 Local/Remote 条件筛选后，一次追加选择所有匹配分支。
- **仓库筛选记忆**：保存每个仓库的分支和来源筛选，下次打开同一工作区时自动恢复。
- **拖拽 Rebase / Merge**：将一个分支拖到另一个分支上，即可执行 rebase 或 merge。
- **交互式 Rebase**：拖拽调整提交顺序，为每个提交选择 pick、squash、fixup、drop 等操作。
- **Fixup / Squash 工作流**：从提交图创建 `fixup!` / `squash!` 提交，再通过交互式 rebase 的 autosquash 选项合入目标提交。
- **冲突预览与解决**：在 merge / rebase 前预览可能冲突的文件，并通过编辑器的三方合并界面解决冲突。
- **内置 Diff 查看器**：提供 Shiki 语法高亮和图片差异对比，支持并排、滑动和叠加查看。
- **Markdown 提交信息**：在详情面板中渲染 Markdown，可切换为纯文本。
- **高级 Git 工具**：支持 Git Flow、Bisect、LFS 文件锁、子模块、统计及包含悬空提交恢复的 Reflog。

---

## 功能介绍

### 提交图与历史

| 功能 | 说明 |
| --- | --- |
| **提交图** | 交互式图形展示，使用不同颜色区分分支轨道和合并连线 |
| **提交排序** | 支持拓扑排序，清晰展示分支关系 |
| **三种视图** | **Graph** 查看提交图，**Reflog** 浏览引用变更日志，**Statistics** 查看统计 |
| **提交详情** | 点击提交，在可调整大小的底部面板查看元数据、变更文件和完整 diff |
| **Markdown 信息** | 提交信息中的 Markdown 可格式化显示，并可切换为纯文本 |
| **提交链接** | 根据 `origin` 自动识别 GitHub / GitLab 的 Issue、PR 和合并请求引用，也支持自定义正则规则 |
| **提交比较** | 选择基准提交后与其他提交比较；支持多个提交的合并变更视图，以及提交与工作区比较 |
| **搜索** | 按提交信息、作者、日期范围、哈希或变更文件搜索，支持结果高亮和键盘导航 |
| **跳转到 HEAD** | 搜索框旁的按钮可定位当前 HEAD；搜索也支持 `HEAD` 关键词 |
| **键盘导航** | 使用方向键移动选择，Ctrl / Cmd 可跳到首个父提交或最新子提交，并记住返回路径 |
| **分支筛选** | 只显示所选分支可达的提交，支持多选、批量选择和按仓库保存筛选 |
| **未提交变更** | 以虚拟节点显示未提交变更，点击可打开源代码管理面板进行暂存和提交 |
| **推送状态** | 蓝色圆点表示仅本地存在的提交，灰色圆点表示仅远程存在的提交 |
| **作者头像** | 在作者名称旁显示 Gravatar 头像 |
| **主题** | 支持浅色、深色和高对比度主题 |

### 文件提交历史

在现有搜索框输入完整仓库相对路径，例如 `src/extension.ts` 或 `README.md`。精确文件路径优先于提交文字；其他输入继续搜索提交说明、作者、哈希、分支和标签。也可以在提交详情、提交比较、暂存或未暂存变更列表中右键文件，选择 **查看文件历史**。在 VS Code／Cursor 左侧的资源管理器（Explorer → Folders）文件列表中，右键选择 **查看文件历史（Git Graph YZC）** 会打开 Git Graph 并查询该文件所属仓库的历史。未提交的重命名使用旧路径查询。

相关提交会在完整提交图中高亮，通过上下箭头、Enter 或 Shift+Enter 导航；较早的结果会自动加载更多提交。历史追踪重命名前的记录，并遵循当前分支和来源筛选，支持已删除文件。没有历史的新文件显示 **暂无提交历史**。清空搜索或按 Escape 退出。

### 分支筛选与记忆

1. 打开工具栏的 **Branch** 下拉框，使用搜索框及 Local/Remote 条件筛选分支。
2. 点击 **全选已筛选分支**，将当前匹配的分支追加到已有选择中，自动去重。下拉框保持打开，搜索词保持不变。
3. 没有匹配分支，或匹配分支已全部选中时，批量选择按钮禁用。
4. 选择 **All** 可清空分支限制，显示所有分支对应的历史；Local/Remote 来源筛选仍按当前选择生效。

分支与 Local/Remote 选择会立即保存到当前工作区的 VS Code `workspaceState`，按仓库绝对路径分别记忆。重新打开同一文件夹并进入 Git Graph YZC，或在仓库之间切换时，会自动应用对应仓库上次的筛选。

恢复时会清理已删除的分支、远程及不符合来源条件的分支；有效选择全部失效时，对应筛选回退到 All。搜索词不会保存，插件不会自动打开面板，筛选记忆不会跨设备同步。

### 分支与标签管理

<p>
  <img src="resources/interactively_rebase.png" width="49%" />
  <img src="resources/reset.png" width="49%" />
</p>

| 功能 | 说明 |
| --- | --- |
| **分支操作** | 创建、重命名、删除和 checkout 分支 |
| **分支工具栏** | 从当前分支创建新分支或 worktree，并提供 Git Flow 菜单 |
| **Amend** | 直接从提交图修改最后一次提交 |
| **Merge** | 支持默认、`--no-ff`、`--ff-only` 和 squash 合并策略 |
| **Rebase** | 支持普通 rebase 和可拖拽排序的交互式 rebase |
| **交互式 Rebase** | 支持键盘操作及 pick、reword、edit、squash、fixup、drop，提供 drop 提示与 autosquash；可从分支或多个选中提交启动。通过 `gitGraphYzc.interactiveRebase.mode` 可切换到终端中的传统 `git rebase -i` |
| **拖拽 Rebase / Merge** | 将分支拖到目标分支上，执行 rebase 或 merge |
| **合并提交** | 将图中选中的多个连续提交 squash 为一个提交 |
| **Fixup / Squash 提交** | 从提交的右键菜单将已暂存变更创建为目标提交的 `fixup!` 或 `squash!` 提交 |
| **Cherry-pick / Revert** | 应用或撤销一个或多个指定提交，支持 `--no-commit` |
| **Reset** | 使用 soft、mixed 或 hard 模式重置到指定提交 |
| **标签** | 创建轻量或附注标签，查看详情，推送到远程，删除本地或远程标签 |
| **上游跟踪** | 根据 upstream 配置自动匹配本地与远程分支 |

### 远程操作

| 功能 | 说明 |
| --- | --- |
| **Fetch / Pull / Push** | 提供远程选择对话框和进度通知；只有一个远程时，fetch 跳过选择对话框 |
| **远程管理** | 添加和移除远程仓库 |
| **强制推送** | 支持 `--force-with-lease` 和 `--force`，并显示警告 |
| **自动 Fetch** | 可配置定时 fetch，间隔为 1–60 分钟 |
| **远程 Checkout** | 检出远程分支，并通过对话框创建本地跟踪分支 |
| **Pull 提示** | 检出落后于远程的分支时，自动提示 pull |

### 冲突解决

<p>
  <img src="resources/conflict_detect.png" width="49%" />
  <img src="resources/conflict.png" width="49%" />
</p>

| 功能 | 说明 |
| --- | --- |
| **冲突预览** | Merge / rebase 对话框可在操作前预览可能冲突的文件 |
| **自动检测** | 检测 merge、rebase、cherry-pick 和 revert 中的冲突 |
| **冲突提示** | 显示冲突文件及各文件的状态 |
| **编辑器集成** | 点击冲突文件，在三方合并编辑器中打开 |
| **解决并暂存** | 按文件标记“已解决”并自动暂存 |
| **继续 / 中止** | 一键继续或中止当前操作 |

### Diff 查看器

![Diff 查看器](resources/diff.png)

| 功能 | 说明 |
| --- | --- |
| **文件树** | 按层级浏览文件，显示新增、修改、删除、重命名和复制等状态 |
| **语法高亮** | 使用 Shiki 提供语法高亮 |
| **图片差异** | 支持并排预览和滑动对比图片变更 |
| **Patch 导出** | 将指定提交保存为 `.patch` 文件 |
| **在编辑器中打开** | 右键打开文件或查看文件变更 |
| **文件路径操作** | 在系统文件管理器中显示文件，复制绝对路径或仓库相对路径 |
| **撤销变更** | 将提交中的整个文件、单个变更块或选中行的变更反向应用到工作区，也可复制选中行 |

### Stash 与 Worktree

| 功能 | 说明 |
| --- | --- |
| **Stash** | 保存、应用、pop、删除和重命名，支持未跟踪文件及 keep-index 选项 |
| **图中的 Stash** | 以标记形式显示 stash，提供专用右键菜单 |
| **Worktree** | 查看、添加、移除和清理 worktree；可从提交图创建，在新窗口或文件管理器中打开，并清理关联分支 |

### 高级工具

<p>
  <img src="resources/bisect.png" width="49%" />
  <img src="resources/gitflow.png" width="49%" />
</p>

![Reflog](resources/reflog.png)

| 功能 | 说明 |
| --- | --- |
| **Git Flow** | 初始化和管理 feature、release、hotfix 分支 |
| **Git Bisect** | 可视化启动二分查找，标记 good / bad 并 reset |
| **Git LFS** | 查看 LFS 跟踪的文件并管理文件锁 |
| **子模块** | 查看状态、更新子模块，并将提交图切换到子模块仓库 |
| **统计** | 查看按作者统计的提交和活动热力图 |
| **Reflog** | 浏览 Git 引用变更日志，以颜色区分 amend、squash 等操作；支持搜索、操作筛选、分支视图及悬空提交检测与恢复 |

### 多仓库与子模块

- 自动发现工作区内的子模块。
- 通过工具栏下拉框切换仓库。
- 每个仓库独立记忆分支和 Local/Remote 筛选。

### 源代码管理侧栏

- 提供 **Branches**、**Remotes**、**Tags**、**Stashes** 和 **Worktrees** 树形视图。
- 点击打开快捷操作菜单，右键打开完整上下文菜单。
- 分支排序优先显示 `main` / `master`，其余按字母排序。

### 多语言支持

- 支持英语、韩语和简体中文。
- 使用 `gitGraphYzc.locale` 设置界面语言；`auto` 跟随编辑器语言。
- 部分 Git 术语保留英文，便于与命令行及其他 Git 工具对应。

---

## 快速开始

1. 在 Cursor 扩展面板搜索 **Git Graph YZC**，或访问 [Open VSX](https://open-vsx.org/extension/sytuacmdyh/git-graph-yzc)。也可从 [GitHub Releases](https://github.com/sytuacmdyh/git-graph-plus/releases) 下载 VSIX，通过命令 **Extensions: Install from VSIX...** 安装。
2. 打开包含 Git 仓库的文件夹。
3. 打开命令面板，执行 `Git Graph YZC: Open`；也可点击源代码管理视图标题栏、状态栏或编辑器标题栏中的 git-merge 图标。
4. 如需手动启用简体中文，在设置中配置：

   ```json
   {
     "gitGraphYzc.locale": "zh-cn"
   }
   ```

可按需启用编辑器内置的 `git.autofetch`，定期获取远程更新；启用 `git.fetchPrune` 可在 fetch 时清理失效的远程跟踪分支。

---

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `gitGraphYzc.autoRefresh` | `true` | 仓库变更时自动刷新 |
| `gitGraphYzc.timeout` | `60` | Git 命令超时时间，单位为秒 |
| `gitGraphYzc.initialCommitCount` | `200` | 首次加载或刷新时读取的提交数；大型仓库可适当降低 |
| `gitGraphYzc.loadMoreCommitCount` | `50` | 每次点击“加载更多提交”时额外读取的数量 |
| `gitGraphYzc.locale` | `auto` | 界面语言：`auto`、`en`、`ko`、`zh-cn` |
| `gitGraphYzc.graphSortOrder` | `date`        | 提交排序：`topological`、`date`、`author-date` |
| `gitGraphYzc.interactiveRebase.mode` | `ui` | 交互式 rebase 模式：`ui` 使用可视化编辑器，`classic` 在终端运行 `git rebase -i` |
| `gitGraphYzc.showSignatureStatus` | `true` | 在图中显示 GPG / SSH 签名状态 |
| `gitGraphYzc.commitMessageLinks` | `[]` | 使用 `{ pattern, url }` 正则规则，将提交信息转换为可点击链接 |
| `gitGraphYzc.autoDetectRepoLinks` | `true` | 根据 `origin` 自动链接 GitHub / GitLab 的 `#123` Issue 和 GitLab 的 `!123` 合并请求 |
| `gitGraphYzc.branchBadgeBarThickness` | `thin` | 分支标记色条粗细：`thin`、`medium`、`thick` |
| `gitGraphYzc.branchColors` | `[]` | 根据分支名称正则设置固定十六进制颜色 |
| `gitGraphYzc.graphColors` | 12 种颜色 | 自动分配给图中分支轨道的十六进制颜色列表 |

### 操作默认值

在编辑器设置中，通过 `gitGraphYzc.defaults.*` 预设各操作对话框的默认选项。

| 操作 | 配置项（位于 `gitGraphYzc.defaults.` 下） |
| --- | --- |
| Push | `push.force`、`push.setUpstream`、`push.allTags` |
| Pull | `pull.rebase`、`pull.stash` |
| Fetch | `fetch.allRemotes` |
| Merge | `merge.mode`、`merge.pushAfter`、`merge.deleteSource` |
| Rebase | `rebase.autostash`、`rebase.pushAfter` |
| Amend | `amend.keepMessage`、`amend.resetDate`、`amend.resetAuthor`、`amend.only`、`amend.pushAfter` |
| Checkout | `checkout.dirty`、`checkoutRemote.dirty` |
| 创建分支 | `createBranch.checkout`、`createBranch.publish` |
| 创建标签 | `createTag.push` |
| Cherry-pick | `cherryPick.noCommit`、`cherryPick.pushAfter` |
| Revert | `revert.noCommit`、`revert.pushAfter` |
| Reset | `reset.mode` |
| Stash | `stashSave.includeUntracked`、`stashSave.keepIndex` |
| 删除分支 | `deleteBranch.force`、`deleteBranch.deleteRemote` |
| 删除标签 | `deleteTag.deleteRemote` |
| 移除 Worktree | `removeWorktree.deleteBranch` |

---

## 环境要求

- Cursor 的扩展环境需兼容 VS Code 1.85.0 或更高版本的 API。
- 已安装 Git，且可从 PATH 访问，或通过 `git.path` 指定路径。
- 使用 Git Flow 或 Git LFS 功能时，需安装对应工具。

## 致谢

- 本项目基于 [Git Graph Plus](https://github.com/the0807/git-graph-plus)，保留原项目的 Apache-2.0 许可和来源说明，详见 [NOTICE](NOTICE)。
- 原项目的 UI / UX 灵感来自 [Git Graph](https://github.com/mhutchie/vscode-git-graph)、[Fork](https://git-fork.com/) 和 [SourceGit](https://github.com/sourcegit-scm/sourcegit)。
- 根据原项目说明，其未使用 [Git Graph](https://github.com/mhutchie/vscode-git-graph) 的代码。
- 扩展图标来自 [VS Code Codicons](https://github.com/microsoft/vscode-codicons)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。

## 更新与发布

- [CHANGELOG.md](CHANGELOG.md)：版本更新记录。
- [Cursor 发布指南](PUBLISHING.md)：本地打包、GitHub 标签发布和 Open VSX 发布配置。

## 许可证

[Apache-2.0](LICENSE)
