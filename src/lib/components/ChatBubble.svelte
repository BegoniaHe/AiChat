<!--
  ChatBubble 组件
  聊天消息气泡，支持 Markdown 渲染
-->
<script>
    import Avatar from "./Avatar.svelte";
    import MarkdownRenderer from "./MarkdownRenderer.svelte";

    let {
        id = "",
        role = "user", // 'user' | 'assistant' | 'system'
        content = "",
        name = "",
        avatar = "",
        time = "",
        status = "sent", // 'sending' | 'sent' | 'error'
        bubbleColor = "",
        enableMarkdown = true, // 是否启用 Markdown 渲染
        onlongpress,
        oncontextmenu,
    } = $props();

    const isUser = $derived(role === "user");
    const isSystem = $derived(role === "system");

    // 用户消息一般不需要 Markdown 渲染
    const shouldRenderMarkdown = $derived(enableMarkdown && !isUser);

    // 长按计时器
    let longPressTimer = null;

    function handleTouchStart(e) {
        if (!onlongpress) return;
        longPressTimer = setTimeout(() => {
            onlongpress?.({ id, role, content });
        }, 500);
    }

    function handleTouchEnd() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function handleContextMenu(e) {
        if (oncontextmenu) {
            e.preventDefault();
            oncontextmenu?.({ id, role, content });
        }
    }
</script>

{#if isSystem}
    <div class="system-message">
        <span class="system-content">{content}</span>
    </div>
{:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="message"
        class:user={isUser}
        class:assistant={!isUser}
        ontouchstart={handleTouchStart}
        ontouchend={handleTouchEnd}
        ontouchcancel={handleTouchEnd}
        oncontextmenu={handleContextMenu}
    >
        {#if !isUser}
            <Avatar src={avatar} alt={name} size="sm" />
        {/if}

        <div class="bubble-wrapper">
            {#if name && !isUser}
                <span class="name">{name}</span>
            {/if}

            <div
                class="bubble"
                class:user-bubble={isUser}
                style:background={bubbleColor || null}
            >
                {#if shouldRenderMarkdown}
                    <MarkdownRenderer {content} class="content" />
                {:else}
                    <div class="content">{content}</div>
                {/if}
            </div>

            <div class="meta">
                {#if time}
                    <span class="time">{time}</span>
                {/if}
                {#if status === "sending"}
                    <span class="status sending">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </span>
                {:else if status === "error"}
                    <span class="status error">发送失败</span>
                {/if}
            </div>
        </div>

        {#if isUser}
            <Avatar src={avatar} alt={name} size="sm" />
        {/if}
    </div>
{/if}

<style>
    .message {
        display: flex;
        gap: 10px;
        padding: 4px 16px;
        max-width: 100%;
        user-select: text;
        -webkit-user-select: text;
    }

    .message.user {
        flex-direction: row-reverse;
    }

    .bubble-wrapper {
        display: flex;
        flex-direction: column;
        max-width: 70%;
    }

    .message.user .bubble-wrapper {
        align-items: flex-end;
    }

    .name {
        font-size: 12px;
        color: var(--color-text-secondary);
        margin-bottom: 4px;
        margin-left: 4px;
    }

    .bubble {
        padding: 10px 14px;
        border-radius: var(--radius-lg, 16px);
        word-wrap: break-word;
        white-space: pre-wrap;
        background: var(--color-bubble-assistant);
    }

    .bubble.user-bubble {
        background: var(--color-bubble-user);
        color: white;
    }

    .message.user .bubble {
        border-bottom-right-radius: 4px;
    }

    .message.assistant .bubble {
        border-bottom-left-radius: 4px;
    }

    .content {
        font-size: 15px;
        line-height: 1.5;
    }

    .meta {
        display: flex;
        gap: 8px;
        margin-top: 4px;
        padding: 0 4px;
    }

    .time {
        font-size: 11px;
        color: var(--color-text-muted);
    }

    .status {
        font-size: 11px;
    }

    .status.sending {
        display: flex;
        gap: 3px;
        align-items: center;
    }

    .typing-dot {
        width: 4px;
        height: 4px;
        background: var(--color-text-muted);
        border-radius: 50%;
        animation: typing 1.4s infinite ease-in-out both;
    }

    .typing-dot:nth-child(1) {
        animation-delay: -0.32s;
    }

    .typing-dot:nth-child(2) {
        animation-delay: -0.16s;
    }

    @keyframes typing {
        0%,
        80%,
        100% {
            transform: scale(0.6);
            opacity: 0.5;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }

    .status.error {
        color: var(--color-danger);
    }

    /* System message */
    .system-message {
        display: flex;
        justify-content: center;
        padding: 8px 16px;
    }

    .system-content {
        font-size: 12px;
        color: var(--color-text-muted);
        background: var(--color-hover);
        padding: 4px 12px;
        border-radius: var(--radius-full);
    }
</style>
