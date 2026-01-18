<!--
  SearchInput 搜索输入框组件
-->
<script>
  let { value = $bindable(''), placeholder = '搜索...', onchange, onsearch } = $props();

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      onsearch?.(value);
    }
  }

  function handleInput(e) {
    value = e.target.value;
    onchange?.(value);
  }

  function clear() {
    value = '';
    onchange?.('');
  }
</script>

<div class="search-input">
  <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path
      d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
    />
  </svg>

  <input
    type="text"
    class="input"
    {value}
    {placeholder}
    oninput={handleInput}
    onkeydown={handleKeydown}
  />

  {#if value}
    <button class="clear-btn" aria-label="清除搜索" onclick={clear}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
        />
      </svg>
    </button>
  {/if}
</div>

<style>
  .search-input {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 40px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: border-color var(--transition-fast);
  }

  .search-input:focus-within {
    border-color: var(--color-primary);
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  .input {
    flex: 1;
    border: none;
    background: transparent;
    font-family: inherit;
    font-size: 15px;
    color: var(--color-text);
    outline: none;
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .clear-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-hover);
    color: var(--color-text-secondary);
    border-radius: 50%;
    transition: all var(--transition-fast);
  }

  .clear-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }
</style>
