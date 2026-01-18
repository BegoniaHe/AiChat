<!--
  MessageInput 组件
  消息输入框
-->
<script>
  let {
    value = $bindable(''),
    placeholder = '输入消息...',
    disabled = false,
    loading = false,
    onsend,
  } = $props();

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    if (!value.trim() || disabled || loading) return;
    onsend?.(value.trim());
  }
</script>

<div class="message-input">
  <textarea bind:value {placeholder} {disabled} rows="1" onkeydown={handleKeydown}></textarea>

  <button class="send-btn" onclick={send} disabled={!value.trim() || disabled || loading}>
    {#if loading}
      <span class="spinner"></span>
    {:else}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
      </svg>
    {/if}
  </button>
</div>

<style>
  .message-input {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  textarea {
    flex: 1;
    min-height: 40px;
    max-height: 120px;
    padding: 10px 14px;
    font-family: inherit;
    font-size: 15px;
    line-height: 1.4;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background);
    color: var(--color-text);
    resize: none;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  textarea:focus {
    border-color: var(--color-primary);
  }

  textarea::placeholder {
    color: var(--color-text-muted);
  }

  .send-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: white;
    border-radius: 50%;
    flex-shrink: 0;
    transition:
      background var(--transition-fast),
      opacity var(--transition-fast);
  }

  .send-btn:hover:not(:disabled) {
    background: var(--color-primary-light);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
