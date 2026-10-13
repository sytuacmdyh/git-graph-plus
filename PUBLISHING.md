# 发布到 Cursor

本项目通过 Open VSX 发布，供 Cursor 的扩展搜索和安装使用。Open VSX 也服务其他兼容编辑器；这里仅限定发布渠道。

插件 ID：`sytuacmdyh.git-graph-yzc`；显示名称：**Git Graph YZC**；配置前缀：`gitGraphYzc`。

## 首次配置

1. 在 [Open VSX](https://open-vsx.org/) 登录，按照[官方发布指南](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)关联 Eclipse 账号并签署 Publisher Agreement。
2. 确认与 `package.json` 的 `publisher` 一致的 namespace `sytuacmdyh` 已存在，且扩展 `sytuacmdyh.git-graph-yzc` 至少已有一个有效版本。若从零开始，需要先用个人发布 Token（本地 `OVSX_PAT` 环境变量）执行 `npx --yes ovsx create-namespace sytuacmdyh` 并首次发布；已有 namespace 和扩展时跳过此步骤。
3. 以 namespace 所有者身份，在 Open VSX 为该扩展添加 GitHub Actions Trusted Publisher，按下表填写。
4. 工作流通过 GitHub Actions OIDC 获取短期发布凭证，无需配置 `OVSX_PAT` repository secret。旧 secret 可以删除；工作流不再读取它，也不要重新注入 `OVSX_PAT`，因为个人 Token 会优先于 Trusted Publishing 使用。
5. 确认仓库启用了 Actions。GitHub Release 使用工作流内置的 `GITHUB_TOKEN`，无需额外的 `RELEASE_TOKEN`；不需要 VS Code Marketplace 的 `VSCE_PAT`。

| Trusted Publisher 字段 | 值 |
| --- | --- |
| Repository owner | `sytuacmdyh` |
| Repository name | `git-graph-plus` |
| Workflow filename | `release.yml`（只填文件名） |
| Environment name | 留空（当前工作流未配置 GitHub Environment） |

如果已有 Trusted Publisher 填写了 Environment name，需要将其清空，或在 `.github/workflows/release.yml` 的 `package-and-publish` job 中配置完全相同的 `environment`。

发布 job 已授予 `id-token: write`，并显式运行 `ovsx publish --trusted-publishing`。完整配置说明见 [Open VSX Trusted Publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing)。

## 先打包测试

在 GitHub **Actions → Release for Cursor (Open VSX) → Run workflow** 中选择分支，保持 **publish** 未勾选。这会进行类型检查、构建和测试，并上传 VSIX artifact，无需任何市场发布 Token。

下载 artifact 并解压，在 Cursor 命令面板运行 **Extensions: Install from VSIX...**，选择 `.vsix` 文件，然后运行 **Developer: Reload Window**。测试仓库在 WSL 时，确认扩展安装在对应的 WSL 环境。

本地也可以执行：

```bash
npm ci
npm --prefix webview-ui ci
npm run build
npm run package
```

## 发布版本

先更新 `package.json`、`package-lock.json` 和 `CHANGELOG.md` 中的版本信息，将修改提交并推送到 `main`。

随后创建并推送与版本完全一致的 `v` 标签，例如 `package.json` 版本为 `0.1.0` 时，使用 `v0.1.0`。使用尚未发布的版本号；每次更新递增版本。

```bash
git tag v0.1.0
git push origin v0.1.0
```

标签对应的提交必须已包含在 `main` 中。工作流会打包、上传 artifact、创建带有 VSIX 附件的 GitHub Release，并发布到 Open VSX。

也可以在 `main` 上手动运行工作流并勾选 **publish**，直接发布当前版本；手动运行不会创建 GitHub Release。其他分支上的手动运行仅打包。

Trusted Publisher 配置与仓库、工作流或 Environment 不匹配，或无法获取 OIDC 凭证时，市场发布步骤会失败。检查上述配置后可重新运行；已经生成的 VSIX 仍可从 artifact 下载，标签构建的 GitHub Release 也仍保留。

发布成功后，可以通过 Open VSX 的 `publisher/name` 页面查看版本。Cursor 的搜索同步与审核由 Cursor 管理，可能不会立即出现；同步期间可通过 VSIX 安装。

## 来源与许可

保留原项目的 Apache-2.0 `LICENSE` 和已有版权声明。派生版本须明确标注来源及修改；第三方图标与依赖继续遵循各自的许可。

参考：[Cursor 扩展说明](https://prod.cursor.com/help/customization/extensions)、[Open VSX CLI](https://github.com/eclipse-openvsx/openvsx/blob/main/cli/README.md)。
