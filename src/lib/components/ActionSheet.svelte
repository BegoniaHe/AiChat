<!--
  ActionSheet 操作菜单
  从底部弹出的操作选项列表
-->
<script>
  let {
    open = $bindable(false),
    title = '',
    actions = [], // [{ label, icon?, danger?, onclick }]
  } = $props();

  function handleAction(action) {
    action.onclick?.();
    open = false;
  }

  function handleClose() {
    open = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      handleClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sheet-overlay"
    role="presentation"
    tabindex="-1"
    onclick={handleClose}
    onkeydown={handleKeydown}
  >
    <div class="sheet" role="dialog" aria-modal="true" aria-label={title || '操作菜单'}>
      {#if title}
        <div class="sheet-title">{title}</div>
      {/if}

      <div class="sheet-actions">
        {#each actions as action}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
          <button
            class="action-item"
            class:danger={action.danger}
            onclick={() => handleAction(action)}
          >
            {#if action.icon}
              <span class="action-icon">{action.icon}</span>
            {/if}
            <span class="action-label">{action.label}</span>
          </button>
        {/each}
      </div>

      <button class="cancel-btn" onclick={handleClose}> 取消 </button>
    </div>
  </div>
{/if}

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1100;
    padding: 0 8px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    animation: fadeIn 0.15s ease;
  }

  .sheet {
    background: var(--color-surface);
    border-radius: var(--radius-xl);
    width: 100%;
    max-width: 400px;
    animation: slideUp 0.25s ease;
    overflow: hidden;
  }

  .sheet-title {
    text-align: center;
    padding: 16px;
    font-size: 13px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
  }

  .sheet-actions {
    display: flex;
    flex-direction: column;
  }

  .action-item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    font-size: 17px;
    color: var(--color-primary);
    border-bottom: 1px solid var(--color-border);
    transition: background var(--transition-fast);
  }

  .action-item:last-child {
    border-bottom: none;
  }

  .action-item:hover {
    background: var(--color-hover);
  }

  .action-item.danger {
    color: var(--color-danger);
  }

  .action-icon {
    font-size: 20px;
  }

  .cancel-btn {
    display: block;
    width: 100%;
    padding: 16px;
    font-size: 17px;
    font-weight: 600;
    color: var(--color-primary);
    background: var(--color-surface);
    margin-top: 8px;
    border-radius: var(--radius-xl);
  }

  .cancel-btn:hover {
    background: var(--color-hover);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
