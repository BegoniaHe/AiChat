<!--
  Tooltip 提示组件
  悬浮提示文字
-->
<script>
    let {
        text = "",
        position = "top", // top | bottom | left | right
        children,
    } = $props();
</script>

<div class="tooltip-wrapper">
    {@render children?.()}
    <div
        class="tooltip"
        class:top={position === "top"}
        class:bottom={position === "bottom"}
        class:left={position === "left"}
        class:right={position === "right"}
    >
        {text}
    </div>
</div>

<style>
    .tooltip-wrapper {
        position: relative;
        display: inline-block;
    }

    .tooltip {
        position: absolute;
        background: var(--color-text);
        color: var(--color-background);
        font-size: 12px;
        padding: 6px 10px;
        border-radius: var(--radius-sm);
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition:
            opacity 0.15s ease,
            visibility 0.15s ease;
        pointer-events: none;
        z-index: 1000;
    }

    .tooltip-wrapper:hover .tooltip {
        opacity: 1;
        visibility: visible;
    }

    .tooltip.top {
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 8px;
    }

    .tooltip.bottom {
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-top: 8px;
    }

    .tooltip.left {
        right: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-right: 8px;
    }

    .tooltip.right {
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-left: 8px;
    }

    /* Arrow */
    .tooltip::after {
        content: "";
        position: absolute;
        border: 5px solid transparent;
    }

    .tooltip.top::after {
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-top-color: var(--color-text);
    }

    .tooltip.bottom::after {
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-bottom-color: var(--color-text);
    }

    .tooltip.left::after {
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        border-left-color: var(--color-text);
    }

    .tooltip.right::after {
        right: 100%;
        top: 50%;
        transform: translateY(-50%);
        border-right-color: var(--color-text);
    }
</style>
