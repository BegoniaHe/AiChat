<!--
  TextArea 多行文本输入框
-->
<script>
    let {
        value = $bindable(""),
        placeholder = "",
        disabled = false,
        readonly = false,
        rows = 3,
        maxlength,
        id,
        name,
        ...restProps
    } = $props();
</script>

<textarea
    class="textarea"
    bind:value
    {placeholder}
    {disabled}
    {readonly}
    {rows}
    {maxlength}
    {id}
    {name}
    {...restProps}
></textarea>

<style>
    .textarea {
        display: block;
        width: 100%;
        padding: 12px;
        font-size: 15px;
        font-family: inherit;
        line-height: 1.5;
        color: var(--color-text);
        background: var(--color-input);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        resize: vertical;
        min-height: 80px;
        transition:
            border-color var(--transition-fast),
            box-shadow var(--transition-fast);
    }

    .textarea:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb, 59, 130, 246), 0.15);
    }

    .textarea:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: var(--color-surface);
    }

    .textarea:read-only {
        background: var(--color-surface);
    }

    .textarea::placeholder {
        color: var(--color-text-muted);
    }
</style>
