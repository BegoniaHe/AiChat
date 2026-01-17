<!--
  Switch 开关组件
-->
<script>
    let {
        checked = $bindable(false),
        disabled = false,
        label = "",
        onchange,
    } = $props();

    function toggle() {
        if (disabled) return;
        checked = !checked;
        onchange?.(checked);
    }
</script>

<label class="switch-wrapper" class:disabled>
    {#if label}
        <span class="switch-label">{label}</span>
    {/if}

    <button
        class="switch"
        class:checked
        {disabled}
        role="switch"
        aria-checked={checked}
        aria-label={label || "切换"}
        onclick={toggle}
    >
        <span class="switch-thumb"></span>
    </button>
</label>

<style>
    .switch-wrapper {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
    }

    .switch-wrapper.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .switch-label {
        font-size: 14px;
        color: var(--color-text);
    }

    .switch {
        position: relative;
        width: 44px;
        height: 26px;
        background: var(--color-border);
        border-radius: 13px;
        transition: background var(--transition-fast);
    }

    .switch:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
    }

    .switch.checked {
        background: var(--color-primary);
    }

    .switch-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        transition: transform var(--transition-fast);
    }

    .switch.checked .switch-thumb {
        transform: translateX(18px);
    }
</style>
