<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { commitStore } from '../../lib/stores/commits.svelte';
  import { t } from '../../lib/i18n/index.svelte';
  import { tooltip } from '../../lib/actions/tooltip';
  import type { BranchInfo, FileHistoryResult } from '../../lib/types';

  interface Props {
    onResults: (matchedHashes: Set<string> | null) => void;
    onNavigate: (hash: string) => void | Promise<void>;
    onFileHistory?: (query: string) => Promise<FileHistoryResult>;
    onQueryChange?: () => void;
    remotes?: string[];
    remoteFilter?: string[];
    onFilterChange?: (filter: string[]) => void;
    branches?: BranchInfo[];
    branchFilter?: string[];
    onBranchFilterChange?: (filter: string[]) => void;
    headOffscreen?: boolean;
    onJumpToHead?: () => void;
  }

  let {
    onResults,
    onNavigate,
    onFileHistory,
    onQueryChange = () => {},
    remotes = [],
    remoteFilter = [],
    onFilterChange = () => {},
    branches = [],
    branchFilter = [],
    onBranchFilterChange = () => {},
    headOffscreen = false,
    onJumpToHead = () => {},
  }: Props = $props();

  let query = $state('');
  let fileMode = $state(false);
  let explicitFile = false;
  let loading = $state(false);
  let navigating = $state(false);
  let error = $state('');
  let searchVersion = 0;
  let matchedHashes = $state<string[]>([]);
  let currentIndex = $state(-1);
  let inputEl: HTMLInputElement | undefined = $state();
  let filterOpen = $state(false);
  let branchFilterOpen = $state(false);
  let branchQuery = $state('');

  const filterActive = $derived(remoteFilter.length > 0);

  const branchFilterActive = $derived(branchFilter.length > 0);

  const hasHead = $derived(commitStore.headHash !== null);

  const localBranches = $derived(
    (remoteFilter.length === 0 || remoteFilter.includes('local'))
      ? branches.filter(b => !b.remote)
      : []
  );

  const remoteBranchGroups = $derived.by(() => {
    const groups = new Map<string, BranchInfo[]>();
    for (const b of branches.filter(b => !!b.remote && b.name !== `${b.remote}/HEAD` && b.name !== b.remote)) {
      if (remoteFilter.length === 0 || remoteFilter.includes(b.remote!)) {
        const key = b.remote!;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(b);
      }
    }
    return groups;
  });

  function branchFullName(b: BranchInfo): string {
    return b.name;
  }

  function filteredByQuery(list: BranchInfo[]): BranchInfo[] {
    if (!branchQuery.trim()) return list;
    const q = branchQuery.trim().toLowerCase();
    return list.filter(b => branchFullName(b).toLowerCase().includes(q));
  }

  function toggleBranch(fullName: string) {
    const next = branchFilter.includes(fullName)
      ? branchFilter.filter(v => v !== fullName)
      : [...branchFilter, fullName];
    onBranchFilterChange(next);
  }

  const filteredBranchNames = $derived([
    ...filteredByQuery(localBranches),
    ...Array.from(remoteBranchGroups.values()).flatMap(filteredByQuery),
  ].map(b => b.name));
  const canSelectFilteredBranches = $derived(
    filteredBranchNames.some(name => !branchFilter.includes(name))
  );

  function selectFilteredBranches() {
    if (!canSelectFilteredBranches) return;
    onBranchFilterChange([...new Set([...branchFilter, ...filteredBranchNames])]);
  }

  function clearBranchFilter() {
    branchFilterOpen = false;
    branchQuery = '';
    onBranchFilterChange([]);
  }

  // Precompute one lowercased haystack per commit so typing only scans the
  // cached strings instead of rebuilding (join + toLowerCase over subject,
  // body, refs, …) for every commit on every keystroke. Rebuilds only when
  // the commit list changes.
  const haystacks = $derived.by(() => {
    const list: Array<{ hash: string; text: string }> = [];
    for (const commit of commitStore.commits) {
      const text = [
        commit.subject,
        commit.body,
        commit.author.name,
        commit.author.email,
        commit.hash,
        commit.abbreviatedHash,
        ...commit.refs
          .filter(r => r.type === 'branch' || r.type === 'remote-branch' || r.type === 'tag')
          .flatMap(r => r.type === 'remote-branch' && r.remote ? [r.name, `${r.remote}/${r.name}`] : [r.name]),
        ...(commit.refs.some(r => r.type === 'head') ? ['HEAD'] : []),
      ].join(' ').toLowerCase();
      list.push({ hash: commit.hash, text });
    }
    return list;
  });

  function textMatches(): string[] {
    const q = query.trim().toLowerCase();
    return haystacks.filter(({ text }) => text.includes(q)).map(({ hash }) => hash);
  }

  function cancelPending(keepResults = false) {
    searchVersion++;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    loading = false;
    navigating = false;
    error = '';
    if (!keepResults) {
      matchedHashes = [];
      currentIndex = -1;
      onResults(query.trim() ? new Set() : null);
    }
    onQueryChange();
  }

  async function navigate(hash: string, version = searchVersion) {
    if (navigating) return;
    error = '';
    navigating = true;
    try {
      const result = onNavigate(hash);
      if (result) await result;
    } catch (err) {
      if (version === searchVersion) error = err instanceof Error ? err.message : String(err);
    } finally {
      if (version === searchVersion) navigating = false;
    }
  }

  async function doSearch(keepHash?: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    if (!query.trim()) { clear(); return; }
    const version = searchVersion;
    error = '';
    let matched: string[];
    if (onFileHistory) {
      loading = true;
      try {
        const result = await onFileHistory(query);
        if (version !== searchVersion) return;
        fileMode = explicitFile || result.recognized;
        if (fileMode) query = result.path;
        matched = fileMode ? result.hashes : textMatches();
      } catch (err) {
        if (version !== searchVersion) return;
        error = err instanceof Error ? err.message : String(err);
        matchedHashes = [];
        currentIndex = -1;
        onResults(new Set());
        return;
      } finally {
        if (version === searchVersion) loading = false;
      }
    } else {
      matched = textMatches();
    }
    const keptIndex = keepHash ? matched.indexOf(keepHash) : -1;
    matchedHashes = matched;
    currentIndex = keptIndex >= 0 ? keptIndex : matched.length > 0 ? 0 : -1;
    onResults(new Set(matched));
    // Background history updates preserve the selected match and scroll. Only
    // navigate again if that match disappeared, or this is a new user search.
    if (matched.length > 0 && keptIndex < 0) void navigate(matched[currentIndex], version);
  }

  function navigatePrev() {
    if (loading || navigating || matchedHashes.length === 0) return;
    currentIndex = (currentIndex - 1 + matchedHashes.length) % matchedHashes.length;
    void navigate(matchedHashes[currentIndex]);
  }

  function navigateNext() {
    if (loading || navigating || matchedHashes.length === 0) return;
    currentIndex = (currentIndex + 1) % matchedHashes.length;
    void navigate(matchedHashes[currentIndex]);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (loading || navigating) return;
      if (e.shiftKey) navigatePrev();
      else if (matchedHashes.length > 0 && query.trim()) navigateNext();
      else void doSearch();
    }
    if (e.key === 'Escape') {
      if (branchFilterOpen) branchFilterOpen = false;
      else if (filterOpen) filterOpen = false;
      else { clear(); inputEl?.blur(); }
    }
  }

  export function clear() {
    query = '';
    explicitFile = false;
    fileMode = false;
    cancelPending();
  }

  export function showFileHistory(path: string) {
    query = path;
    explicitFile = true;
    fileMode = true;
    cancelPending();
    inputEl?.focus();
    void doSearch();
  }

  export function refresh() {
    if (!query.trim()) return;
    const keepHash = matchedHashes[currentIndex];
    cancelPending(true);
    void doSearch(keepHash);
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function onInput() {
    explicitFile = false;
    fileMode = false;
    cancelPending();
    if (!query.trim()) { clear(); return; }
    debounceTimer = setTimeout(() => { debounceTimer = null; void doSearch(); }, 150);
  }

  // Text search follows graph loading without another file-history request.
  $effect(() => {
    const list = haystacks;
    untrack(() => {
      if (!query.trim() || loading || fileMode || debounceTimer || error) return;
      const currentHash = matchedHashes[currentIndex];
      matchedHashes = list.filter(({ text }) => text.includes(query.trim().toLowerCase())).map(({ hash }) => hash);
      currentIndex = matchedHashes.length ? Math.max(0, matchedHashes.indexOf(currentHash)) : -1;
      onResults(new Set(matchedHashes));
    });
  });

  onDestroy(() => {
    searchVersion++;
    if (debounceTimer) clearTimeout(debounceTimer);
    onQueryChange();
    onResults(null);
  });

  function toggleFilter(value: string) {
    const next = remoteFilter.includes(value)
      ? remoteFilter.filter(v => v !== value)
      : [...remoteFilter, value];
    onFilterChange(next);
  }

  function clearFilter() {
    filterOpen = false;
    onFilterChange([]);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="search-bar" role="group" onkeydown={handleKeydown}>
  <div class="search-row" class:has-results={query && matchedHashes.length > 0} class:no-results={query && !loading && !navigating && !error && matchedHashes.length === 0}>
    <i class="codicon codicon-search search-icon"></i>
    <input
      class="search-input"
      type="text"
      bind:this={inputEl}
      bind:value={query}
      oninput={onInput}
      placeholder={t('search.placeholder')}
      use:tooltip={t('search.placeholder')}
    />
    {#if fileMode}
      <span class="file-history-label" use:tooltip={query}>{t('search.fileHistory')}</span>
    {/if}
    {#if query}
      <span class="search-count" class:empty={matchedHashes.length === 0}>
        {#if loading || navigating}
          {t(navigating ? 'search.loadingHistoryCommit' : 'search.loading')}
        {:else if error}
          <span use:tooltip={error}>{t('search.failed')}</span>
        {:else if matchedHashes.length > 0}
          <span class="count-current">{currentIndex + 1}</span><span class="count-sep">/</span><span class="count-total">{matchedHashes.length}</span>
        {:else}
          {t(fileMode ? 'search.noFileHistory' : 'search.noResults')}
        {/if}
      </span>
      <span class="nav-divider"></span>
      <button class="nav-btn" onclick={navigatePrev} disabled={loading || navigating || matchedHashes.length === 0} aria-label={t('search.prev')} use:tooltip={t('search.prev')}>
        <i class="codicon codicon-chevron-up"></i>
      </button>
      <button class="nav-btn" onclick={navigateNext} disabled={loading || navigating || matchedHashes.length === 0} aria-label={t('search.next')} use:tooltip={t('search.next')}>
        <i class="codicon codicon-chevron-down"></i>
      </button>
      <button class="nav-btn close-btn" onclick={clear} aria-label={t('search.clear')} use:tooltip={t('search.clear')}>
        <i class="codicon codicon-close"></i>
      </button>
    {/if}
  </div>

  <button
    class="head-btn"
    class:active={headOffscreen}
    onclick={() => onJumpToHead()}
    disabled={!hasHead}
    aria-label={t('search.jumpToHead')}
    use:tooltip={t('search.jumpToHead')}
  >
    <i class="codicon codicon-location"></i>
  </button>

  <div class="filter-wrap">
    <button
      class="filter-btn"
      class:active={filterActive}
      onclick={() => { filterOpen = !filterOpen; }}
      use:tooltip={t('search.sourceFilterTooltip')}
    >
      <i class="codicon codicon-list-filter filter-btn-icon"></i>
      <span class="filter-label">
        {t('search.sourceFilter')}
        {#if filterActive}<span class="filter-count">{remoteFilter.length}</span>{/if}
      </span>
      <i class="codicon {filterOpen ? 'codicon-chevron-up' : 'codicon-chevron-down'} chevron"></i>
    </button>

    {#if filterOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="backdrop" onclick={() => { filterOpen = false; }}></div>
      <div class="dropdown">
        <button class="dd-item" class:active={!filterActive} onclick={clearFilter}>
          <input type="checkbox" checked={!filterActive} readonly />
          All
        </button>
        <div class="dd-sep"></div>
        <button class="dd-item" class:active={remoteFilter.includes('local')} onclick={() => toggleFilter('local')}>
          <input type="checkbox" checked={remoteFilter.includes('local')} readonly />
          Local
        </button>
        {#if remotes.length > 0}
          <div class="dd-sep"></div>
          {#each remotes as remote}
            <button class="dd-item" class:active={remoteFilter.includes(remote)} onclick={() => toggleFilter(remote)}>
              <input type="checkbox" checked={remoteFilter.includes(remote)} readonly />
              <span class="remote-name"><i class="codicon codicon-cloud remote-icon"></i>{remote}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="filter-wrap">
    <button
      class="filter-btn"
      class:active={branchFilterActive}
      onclick={() => { branchFilterOpen = !branchFilterOpen; }}
      use:tooltip={t('search.branchFilterTooltip')}
    >
      <i class="codicon codicon-git-branch filter-btn-icon"></i>
      <span class="filter-label">
        {t('search.branchFilter')}
        {#if branchFilterActive}<span class="filter-count">{branchFilter.length}</span>{/if}
      </span>
      <i class="codicon {branchFilterOpen ? 'codicon-chevron-up' : 'codicon-chevron-down'} chevron"></i>
    </button>

    {#if branchFilterOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="backdrop" onclick={() => { branchFilterOpen = false; }}></div>
      <div class="dropdown branch-dropdown">
        <div class="branch-search-wrap">
          <input
            class="branch-search-input"
            type="text"
            bind:value={branchQuery}
            placeholder={t('search.filterBranches')}
            autocomplete="off"
          />
        </div>
        <button class="dd-item" class:active={!branchFilterActive} onclick={clearBranchFilter}>
          <input type="checkbox" checked={!branchFilterActive} readonly />
          {t('search.allBranches')}
        </button>
        <button
          class="dd-item select-filtered-branches"
          disabled={!canSelectFilteredBranches}
          onclick={selectFilteredBranches}
        >
          <i class="codicon codicon-check-all"></i>
          {t('search.selectFilteredBranches')}
        </button>
        {#if filteredByQuery(localBranches).length > 0}
          <div class="dd-sep"></div>
          <div class="dd-section-header">LOCAL</div>
          {#each filteredByQuery(localBranches) as b}
            <button
              class="dd-item"
              class:active={branchFilter.includes(b.name)}
              onclick={() => toggleBranch(b.name)}
            >
              <input type="checkbox" checked={branchFilter.includes(b.name)} readonly />
              {b.name}
            </button>
          {/each}
        {/if}
        {#each remoteBranchGroups as [remote, rBranches]}
          {#if filteredByQuery(rBranches).length > 0}
            <div class="dd-sep"></div>
            <div class="dd-section-header">
              <i class="codicon codicon-cloud remote-icon"></i>{remote}
            </div>
            {#each filteredByQuery(rBranches) as b}
              <button
                class="dd-item"
                class:active={branchFilter.includes(b.name)}
                onclick={() => toggleBranch(b.name)}
              >
                <input type="checkbox" checked={branchFilter.includes(b.name)} readonly />
                {b.name}
              </button>
            {/each}
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .search-bar {
    padding: 5px 14px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .search-row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--input-bg);
    border: 1px solid var(--input-border, var(--border-color));
    border-radius: 6px;
    padding: 0 8px;
    height: 30px;
    transition: border-color 0.15s;
  }

  .search-row:focus-within {
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .search-row.has-results:focus-within {
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .search-row.no-results {
    border-color: var(--vscode-inputValidation-warningBorder, #b89500);
  }

  .search-icon {
    font-size: 14px;
    color: var(--text-secondary);
    flex-shrink: 0;
    opacity: 0.6;
  }

  .search-row:focus-within .search-icon {
    opacity: 1;
    color: var(--vscode-focusBorder, #007fd4);
  }

  .search-input {
    flex: 1;
    padding: 0 2px;
    background: transparent;
    color: var(--input-fg);
    border: none;
    font-size: inherit;
    font-family: inherit;
    outline: none;
    min-width: 0;
  }

  .file-history-label {
    font-size: 11px;
    white-space: nowrap;
    color: var(--vscode-focusBorder, #007fd4);
    border-right: 1px solid var(--border-color);
    padding-right: 6px;
  }

  .search-count {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .search-count.empty {
    color: var(--vscode-inputValidation-warningForeground, #cca700);
  }

  .count-current {
    color: var(--text-primary);
    font-weight: 600;
  }

  .count-sep {
    opacity: 0.4;
    margin: 0 1px;
  }

  .count-total {
    opacity: 0.7;
  }

  .nav-divider {
    width: 1px;
    height: 14px;
    background: var(--border-color);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 4px;
    font-size: 14px;
    flex-shrink: 0;
    transition: background 0.1s;
  }

  .nav-btn:hover:not(:disabled) {
    background: rgba(128, 128, 128, 0.2);
    color: var(--text-primary);
  }

  .nav-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .close-btn:hover:not(:disabled) {
    background: rgba(244, 67, 54, 0.15);
    color: #f44336;
  }

  /* ── Filter ── */

  .filter-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .head-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: color 0.1s, border-color 0.1s;
  }

  .head-btn:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .head-btn.active {
    color: var(--vscode-focusBorder, #007fd4);
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .head-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 8px;
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: inherit;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.1s, border-color 0.1s;
    max-width: 130px;
  }

  .filter-btn-icon { font-size: 13px; flex-shrink: 0; }

  .filter-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .filter-btn:hover {
    color: var(--text-primary);
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .filter-btn.active {
    color: var(--vscode-focusBorder, #007fd4);
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .chevron { font-size: 12px; opacity: 0.7; flex-shrink: 0; }

  .filter-count {
    background: var(--vscode-focusBorder, #007fd4);
    color: var(--vscode-button-foreground, #fff);
    border-radius: 8px;
    padding: 0 5px;
    font-size: 10px;
    line-height: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }


  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--vscode-menu-background, #252526);
    border: 1px solid var(--vscode-menu-border, #454545);
    border-radius: 6px;
    padding: 4px 0;
    min-width: 160px;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  :global(body.vscode-light) .dropdown {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .dd-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 12px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: inherit;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }

  .dd-item:hover {
    background: var(--vscode-menu-selectionBackground, rgba(255,255,255,0.1));
    color: var(--text-primary);
  }

  .dd-item.active {
    color: var(--text-primary);
  }

  .dd-item:disabled {
    opacity: 0.4;
    cursor: default;
    background: transparent;
    color: var(--text-secondary);
  }

  input[type="checkbox"] {
    appearance: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--text-secondary);
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    pointer-events: none;
  }

  input[type="checkbox"]:checked {
    background: var(--vscode-button-background, #0078d4);
    border-color: var(--vscode-button-background, #0078d4);
  }

  input[type="checkbox"]:checked::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 8px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .dd-sep {
    height: 1px;
    background: var(--border-color);
    margin: 3px 0;
  }

  .remote-name {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .remote-icon {
    font-size: 13px;
  }

  .branch-dropdown {
    min-width: 200px;
    max-height: 320px;
    overflow-y: auto;
  }

  .branch-search-wrap {
    padding: 6px 8px 4px;
    border-bottom: 1px solid var(--border-color);
  }

  .branch-search-input {
    width: 100%;
    background: var(--input-bg, transparent);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: inherit;
    font-family: inherit;
    padding: 3px 6px;
    outline: none;
    box-sizing: border-box;
  }

  .branch-search-input:focus {
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .dd-section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    text-transform: uppercase;
    pointer-events: none;
  }

</style>
