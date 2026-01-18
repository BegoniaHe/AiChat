<!--
  ConfirmDialog 确认对话框
  通用的确认弹窗组件
-->
<script>
  import Button from './Button.svelte';

  let {
    open = $bindable(false),
    title = '确认',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    variant = 'primary', // primary | danger
    onconfirm,
    oncancel,
  } = $props();

  function handleConfirm() {
    onconfirm?.();
    open = false;
  }

  function handleCancel() {
    oncancel?.();
    open = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      handleCancel();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-overlay"
    role="presentation"
    tabindex="-1"
    onclick={handleCancel}
    onkeydown={handleKeydown}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dialog"
      role="alertdialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h3 id="confirm-title" class="dialog-title">{title}</h3>
      <p id="confirm-message" class="dialog-message">{message}</p>
      <div class="dialog-actions">
        <Button variant="ghost" onclick={handleCancel}>
          {cancelText}
        </Button>
        <Button {variant} onclick={handleConfirm}>
          {confirmText}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    padding: 20px;
    animation: fadeIn 0.15s ease;
  }

  .dialog {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: 24px;
    max-width: 320px;
    width: 100%;
    animation: scaleIn 0.2s ease;
  }

  .dialog-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 12px;
  }

  .dialog-message {
    font-size: 14px;
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin: 0 0 24px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
