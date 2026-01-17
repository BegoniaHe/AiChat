<!--
  Input 组件
  通用输入框
-->
<script>
    let {
        type = "text",
        value = $bindable(""),
        placeholder = "",
        disabled = false,
        readonly = false,
        oninput,
        onkeydown,
    } = $props();
</script>

<input
    class="input"
    {type}
    bind:value
    {placeholder}
    {disabled}
    {readonly}
    {oninput}
    {onkeydown}
/>

<style>
    .input {
        width: 100%;
        padding: 10px 14px;
        font-size: 15px;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 12px);
        background: var(--color-surface, #ffffff);
        color: var(--color-text, #1f2937);
        outline: none;
        transition: border-color var(--transition-fast, 150ms);
    }

    .input:focus {
        border-color: var(--color-primary, #0f172a);
    }

    .input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .input::placeholder {
        color: var(--color-text-muted, #94a3b8);
    }
</style>
