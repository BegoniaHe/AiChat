<!--
  Dropdown 下拉菜单组件
-->
<script>
  let {
    open = $bindable(false),
    align = 'left', // 'left' | 'right' | 'center'
    trigger,
    children,
  } = $props();

  let dropdownRef = $state(null);

  // 点击外部关闭
  function handleClickOutside(e) {
    if (dropdownRef && !dropdownRef.contains(e.target)) {
      open = false;
    }
  }

  // ESC 关闭
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      open = false;
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<div class="dropdown" bind:this={dropdownRef}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="dropdown-trigger"
    role="button"
    tabindex="0"
    onclick={() => (open = !open)}
    onkeydown={(e) => e.key === 'Enter' && (open = !open)}
  >
    {@render trigger?.()}
  </div>

  {#if open}
    <div class="dropdown-menu align-{align}">
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
    display: inline-block;
  }

  .dropdown-trigger {
    cursor: pointer;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    margin-top: 4px;
    min-width: 160px;
    padding: 6px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }

  .dropdown-menu.align-left {
    left: 0;
  }

  .dropdown-menu.align-right {
    right: 0;
  }

  .dropdown-menu.align-center {
    left: 50%;
    transform: translateX(-50%);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 全局子元素样式 */
  .dropdown-menu :global(.dropdown-item) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    color: var(--color-text);
    background: transparent;
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .dropdown-menu :global(.dropdown-item:hover) {
    background: var(--color-hover);
  }

  .dropdown-menu :global(.dropdown-item.danger) {
    color: var(--color-error);
  }

  .dropdown-menu :global(.dropdown-divider) {
    height: 1px;
    margin: 6px 0;
    background: var(--color-border);
  }
</style>
