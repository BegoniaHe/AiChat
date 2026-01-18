<!--
  Tabs 标签页组件
  用于分组展示内容
-->
<script>
  let {
    tabs = [], // [{ id, label, icon? }]
    activeTab = $bindable(tabs[0]?.id || ''),
    children,
  } = $props();
</script>

<div class="tabs-container">
  <div class="tabs-header" role="tablist">
    {#each tabs as tab (tab.id)}
      <button
        class="tab-item"
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        tabindex={activeTab === tab.id ? 0 : -1}
        onclick={() => (activeTab = tab.id)}
      >
        {#if tab.icon}
          <span class="tab-icon">{tab.icon}</span>
        {/if}
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
  </div>
  <div class="tabs-content" role="tabpanel">
    {@render children?.()}
  </div>
</div>

<style>
  .tabs-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .tabs-header {
    display: flex;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 0 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabs-header::-webkit-scrollbar {
    display: none;
  }

  .tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
    transition: all var(--transition-fast);
  }

  .tab-item:hover {
    color: var(--color-text);
  }

  .tab-item.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .tab-icon {
    font-size: 16px;
  }

  .tabs-content {
    flex: 1;
    overflow-y: auto;
  }
</style>
