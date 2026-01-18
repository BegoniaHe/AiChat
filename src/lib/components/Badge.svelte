<!--
  Badge 徽章组件
-->
<script>
  const {
    variant = 'default', // 'default' | 'primary' | 'success' | 'warning' | 'error'
    size = 'md', // 'sm' | 'md' | 'lg'
    dot = false, // 小圆点模式
    count = 0, // 数字模式
    max = 99, // 最大显示数
    children,
  } = $props();

  const displayCount = $derived(count > max ? `${max}+` : count);
</script>

{#if dot}
  <span class="badge badge-dot badge-{variant}"></span>
{:else if count > 0}
  <span class="badge badge-count badge-{variant} badge-{size}">
    {displayCount}
  </span>
{:else if children}
  <span class="badge badge-{variant} badge-{size}">
    {@render children()}
  </span>
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  /* Sizes */
  .badge-sm {
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    font-size: 11px;
  }

  .badge-md {
    min-width: 22px;
    height: 22px;
    padding: 0 8px;
    font-size: 12px;
  }

  .badge-lg {
    min-width: 26px;
    height: 26px;
    padding: 0 10px;
    font-size: 13px;
  }

  /* Dot mode */
  .badge-dot {
    width: 8px;
    height: 8px;
    padding: 0;
    min-width: unset;
  }

  /* Variants */
  .badge-default {
    background: var(--color-hover);
    color: var(--color-text-secondary);
  }

  .badge-primary {
    background: var(--color-primary);
    color: white;
  }

  .badge-success {
    background: var(--color-success, #10b981);
    color: white;
  }

  .badge-warning {
    background: var(--color-warning, #f59e0b);
    color: white;
  }

  .badge-error {
    background: var(--color-error, #ef4444);
    color: white;
  }
</style>
