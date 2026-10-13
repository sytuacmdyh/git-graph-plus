<script lang="ts">
  import { onMount } from 'svelte';
  import { getVsCodeApi } from '../../lib/vscode-api';
  import { avatarStore } from '../../lib/stores/avatars.svelte';
  import { i18n, t } from '../../lib/i18n/index.svelte';
  import { tooltip } from '../../lib/actions/tooltip';
  import { contributionWeeks } from '../../lib/utils/contribution-calendar';

  interface AuthorStat { author: string; email: string; count: number; }
  interface DayStat { date: string; author: string; email: string; count: number; }

  const vscode = getVsCodeApi();
  const COLORS = ['var(--calendar-empty)', '#c6e9d0', '#8edaa4', '#4eb777', '#27864b'];
  let byAuthor = $state<AuthorStat[]>([]);
  let byDay = $state<DayStat[]>([]);
  let startDate = $state('');
  let endDate = $state('');
  let selectedAuthor = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  export function refresh() {
    error = null;
    loading = true;
    vscode.postMessage({ type: 'getStats' });
  }

  const authorKey = (author: { author: string; email: string }) => JSON.stringify([author.author, author.email]);
  let selectedName = $derived(byAuthor.find(a => authorKey(a) === selectedAuthor)?.author);
  let weeks = $derived(contributionWeeks(startDate, endDate));
  let monthFormatter = $derived(new Intl.DateTimeFormat(i18n.locale, { month: 'short', timeZone: 'UTC' }));
  let weekdayFormatter = $derived(new Intl.DateTimeFormat(i18n.locale, { weekday: 'short', timeZone: 'UTC' }));
  let dateFormatter = $derived(new Intl.DateTimeFormat(i18n.locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }));
  let monthLabels = $derived(weeks.map((week, index) => {
    const first = week.find(day => day !== null);
    const monthStart = week.find(day => day?.day === 1);
    // Avoid overlapping the initial partial month with a label one week later.
    const day = monthStart ?? (index === 0 && !weeks[1]?.some(day => day?.day === 1) ? first : null);
    return day ? monthFormatter.format(new Date(`${day.date}T00:00:00Z`)) : '';
  }));
  let dailyCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const day of byDay) {
      if (day.date < startDate || day.date > endDate) continue;
      if (selectedAuthor !== null && authorKey(day) !== selectedAuthor) continue;
      counts.set(day.date, (counts.get(day.date) ?? 0) + day.count);
    }
    return counts;
  });
  let maxHeatCount = $derived(Math.max(1, ...dailyCounts.values()));
  let yearCommits = $derived([...dailyCounts.values()].reduce((sum, count) => sum + count, 0));
  let totalCommits = $derived(byAuthor.reduce((sum, a) => sum + a.count, 0));
  let maxCount = $derived(Math.max(1, ...byAuthor.map(a => a.count)));

  onMount(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data.type === 'statsData') {
        byAuthor = event.data.payload.byAuthor;
        byDay = event.data.payload.byDay;
        startDate = event.data.payload.startDate;
        endDate = event.data.payload.endDate;
        if (!byAuthor.some(a => authorKey(a) === selectedAuthor)) selectedAuthor = null;
        error = null;
        loading = false;
      } else if (event.data.type === 'error' && event.data.payload.source === 'getStats') {
        error = event.data.payload.message;
        loading = false;
      }
    }
    window.addEventListener('message', handleMessage);
    refresh();
    return () => window.removeEventListener('message', handleMessage);
  });

  function getHeatColor(count: number): string {
    return COLORS[count === 0 ? 0 : Math.max(1, Math.ceil(count / maxHeatCount * 4))];
  }
</script>

<div class="stats-view">
  {#if loading}
    <div class="loading"><span class="spinner"></span> {t('stats.loading')}</div>
  {:else if error}
    <div class="stats-error" role="alert">
      <span>{error}</span>
      <button class="stats-retry" onclick={refresh}>{t('stats.retry')}</button>
    </div>
  {:else}
    <!-- Contributors -->
    <div class="stats-section">
      <div class="section-header">
        <h3 class="stats-title">{t('stats.contributors', { count: byAuthor.length })}</h3>
        <span class="stats-subtitle">{t('stats.commitCount', { count: totalCommits })}</span>
        <button class="all-contributors" class:active={selectedAuthor === null} aria-pressed={selectedAuthor === null} onclick={() => selectedAuthor = null}>
          {t('stats.allContributors')}
        </button>
      </div>
      <div class="author-list">
        {#each byAuthor as author, i}
          <button
            class="author-row"
            class:selected={selectedAuthor === authorKey(author)}
            aria-pressed={selectedAuthor === authorKey(author)}
            onclick={() => selectedAuthor = selectedAuthor === authorKey(author) ? null : authorKey(author)}
          >
            <span class="author-rank">#{i + 1}</span>
            <img class="author-avatar" src={avatarStore.url(author.email, 24)} alt="" />
            <span class="author-info">
              <span class="author-name truncate">{author.author}</span>
              <span class="author-bar-container">
                <span class="author-bar" style="width: {(author.count / maxCount) * 100}%"></span>
              </span>
            </span>
            <span class="author-count">{author.count}</span>
            <span class="author-percent">{((author.count / (totalCommits || 1)) * 100).toFixed(0)}%</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- One column per week, one cell per calendar day. -->
    <div class="stats-section">
      <div class="section-header">
        <h3 class="stats-title" aria-live="polite">{t('stats.commitsLastYear', { count: yearCommits })}</h3>
        <span class="stats-subtitle">{selectedName ?? t('stats.allContributors')}</span>
      </div>
      <div class="heatmap-container">
        <div class="heatmap-scroll">
          <div class="heatmap" style="--week-count: {weeks.length}" role="group" aria-label={t('stats.dailyCommits')}>
            <div class="heatmap-weekdays" aria-hidden="true">
              {#each Array(7) as _, weekday}
                <span>{weekday % 2 === 1 ? weekdayFormatter.format(new Date(Date.UTC(2024, 0, 7 + weekday))) : ''}</span>
              {/each}
            </div>
            <div class="heatmap-months" aria-hidden="true">
              {#each monthLabels as label}<span>{label}</span>{/each}
            </div>
            <div class="heatmap-weeks">
              {#each weeks as week}
                <div class="heatmap-week">
                  {#each week as day}
                    {#if day}
                      {@const count = dailyCounts.get(day.date) ?? 0}
                      {@const label = t('stats.dayCommits', { count, date: dateFormatter.format(new Date(`${day.date}T00:00:00Z`)) })}
                      <div
                        class="heatmap-cell"
                        role="img"
                        aria-label={label}
                        data-date={day.date}
                        data-count={count}
                        style="background: {getHeatColor(count)}"
                        use:tooltip={label}
                      ></div>
                    {:else}
                      <div class="heatmap-blank" aria-hidden="true"></div>
                    {/if}
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>
        <div class="heatmap-legend">
          <span class="heatmap-legend-label">{t('stats.less')}</span>
          {#each COLORS as color}
            <div class="heatmap-legend-cell" style="background: {color}"></div>
          {/each}
          <span class="heatmap-legend-label">{t('stats.more')}</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .stats-view {
    height: 100%;
    overflow-y: auto;
    padding: 20px;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    color: var(--text-secondary);
  }

  .stats-error {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    color: var(--text-secondary);
  }

  .stats-retry {
    padding: 4px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: transparent;
    cursor: pointer;
  }

  .stats-section {
    margin-bottom: 28px;
  }

  .section-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .stats-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .stats-subtitle {
    font-size: 11px;
    color: var(--text-secondary);
  }

  /* ---- Contributors ---- */
  .author-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .author-row {
    width: 100%;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-primary);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: inherit;
    padding: 4px 6px;
    border-radius: 4px;
  }

  .all-contributors {
    margin-left: auto;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .all-contributors.active, .author-row.selected {
    background: var(--bg-hover);
    border-color: var(--vscode-focusBorder, #63b0f4);
    color: var(--text-primary);
  }

  .author-row:focus-visible, .all-contributors:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #63b0f4);
    outline-offset: 1px;
  }

  .author-row:hover {
    background: var(--bg-hover);
  }

  .author-rank {
    width: 24px;
    color: var(--text-secondary);
    font-size: 10px;
    text-align: right;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .author-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .author-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .author-name {
    font-size: inherit;
    color: var(--text-primary);
  }

  .author-bar-container {
    height: 4px;
    background: rgba(128, 128, 128, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .author-bar {
    display: block;
    height: 100%;
    background: #63b0f4;
    border-radius: 2px;
    transition: width 0.3s;
  }

  .author-count {
    width: 40px;
    text-align: right;
    color: var(--text-primary);
    font-size: 11px;
    flex-shrink: 0;
    font-weight: 600;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .author-percent {
    width: 32px;
    text-align: right;
    color: var(--text-secondary);
    font-size: 10px;
    flex-shrink: 0;
  }

  /* ---- Contribution calendar ---- */
  .heatmap-container {
    --calendar-empty: rgba(128, 128, 128, 0.1);
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
  }

  .heatmap-scroll {
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .heatmap {
    --cell-size: 11px;
    --cell-gap: 3px;
    display: grid;
    grid-template-columns: max-content max-content;
    grid-template-rows: 18px auto;
    column-gap: 8px;
    width: max-content;
    padding-right: 24px;
  }

  .heatmap-weekdays {
    grid-column: 1;
    grid-row: 2;
    display: grid;
    grid-template-rows: repeat(7, var(--cell-size));
    gap: var(--cell-gap);
    text-align: right;
  }

  .heatmap-months {
    grid-column: 2;
    grid-row: 1;
    display: grid;
    grid-template-columns: repeat(var(--week-count), var(--cell-size));
    gap: var(--cell-gap);
  }

  .heatmap-months span, .heatmap-weekdays span {
    font-size: 10px;
    line-height: 11px;
    white-space: nowrap;
    color: var(--text-secondary);
  }

  .heatmap-weeks {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    gap: var(--cell-gap);
  }

  .heatmap-week {
    display: flex;
    flex-direction: column;
    gap: var(--cell-gap);
  }

  .heatmap-cell, .heatmap-blank {
    width: var(--cell-size);
    height: var(--cell-size);
    border-radius: 2px;
  }

  .heatmap-cell {
    outline: 1px solid rgba(128, 128, 128, 0.12);
    outline-offset: -1px;
    cursor: default;
  }

  .heatmap-cell:hover {
    outline: 1px solid var(--text-secondary);
  }

  .heatmap-legend {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 3px;
    margin-top: 8px;
  }

  .heatmap-legend-label {
    font-size: 10px;
    color: var(--text-secondary);
    padding: 0 4px;
  }

  .heatmap-legend-cell {
    width: 11px;
    height: 11px;
    border-radius: 2px;
  }
</style>
