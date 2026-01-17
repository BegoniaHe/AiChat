<!--
  Modal 通用模态框组件
-->
<script>
    import { uiStore } from "$stores";

    // 关闭模态框
    function close() {
        uiStore.closeModal();
    }

    // ESC 关闭
    function handleKeydown(e) {
        if (e.key === "Escape") {
            close();
        }
    }
</script>

{#if uiStore.modalOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
        class="modal-overlay"
        role="presentation"
        onclick={close}
        onkeydown={handleKeydown}
    >
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div
            class="modal-content"
            role="dialog"
            tabindex="-1"
            aria-modal="true"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
        >
            {#if uiStore.modalComponent}
                {@const Component = uiStore.modalComponent}
                <Component {...uiStore.modalProps} onclose={close} />
            {/if}
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn 0.2s ease;
    }

    .modal-content {
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        overflow: auto;
        animation: scaleIn 0.2s ease;
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
            transform: scale(0.95);
            opacity: 0;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }
</style>
