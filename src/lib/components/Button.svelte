<!--
  Button 组件
  通用按钮
-->
<script>
    /** @type {'primary' | 'secondary' | 'ghost' | 'danger'} */
    const {
        variant = "primary",
        size = "md",
        disabled = false,
        loading = false,
        onclick,
        children,
    } = $props();
</script>

<button class="btn btn-{variant} btn-{size}" {disabled} {onclick}>
    {#if loading}
        <span class="spinner"></span>
    {/if}
    {@render children?.()}
</button>

<style>
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-weight: 500;
        border-radius: var(--radius-md, 12px);
        transition:
            background var(--transition-fast, 150ms),
            opacity var(--transition-fast, 150ms);
        cursor: pointer;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Sizes */
    .btn-sm {
        padding: 6px 12px;
        font-size: 14px;
    }
    .btn-md {
        padding: 10px 20px;
        font-size: 15px;
    }
    .btn-lg {
        padding: 14px 28px;
        font-size: 16px;
    }

    /* Variants */
    .btn-primary {
        background: var(--color-primary, #0f172a);
        color: white;
    }
    .btn-primary:hover:not(:disabled) {
        background: var(--color-primary-light, #1e293b);
    }

    .btn-secondary {
        background: var(--color-surface, #ffffff);
        color: var(--color-text, #1f2937);
        border: 1px solid var(--color-border, #e2e8f0);
    }
    .btn-secondary:hover:not(:disabled) {
        background: var(--color-hover, rgba(0, 0, 0, 0.04));
    }

    .btn-ghost {
        background: transparent;
        color: var(--color-text, #1f2937);
    }
    .btn-ghost:hover:not(:disabled) {
        background: var(--color-hover, rgba(0, 0, 0, 0.04));
    }

    .btn-danger {
        background: var(--color-danger, #ef4444);
        color: white;
    }
    .btn-danger:hover:not(:disabled) {
        opacity: 0.9;
    }

    /* Spinner */
    .spinner {
        width: 16px;
        height: 16px;
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
