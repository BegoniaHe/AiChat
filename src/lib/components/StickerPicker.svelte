<script>
    /**
     * StickerPicker - Sticker/Emoji selection component
     * @component
     */

    /** @type {{ onSelect?: (sticker: string) => void, show?: boolean }} */
    let { onSelect = () => {}, show = $bindable(false) } = $props();

    const DEFAULT_STICKERS = [
        "摸摸头",
        "比心",
        "跳舞",
        "哭哭",
        "生气",
        "睡觉",
        "爱心",
        "赞",
        "害羞",
        "拥抱",
        "喝奶茶",
        "OK",
        "嘟嘴",
        "委屈",
        "开心",
        "疑惑",
        "惊讶",
        "无语",
        "思考",
        "偷笑",
        "加油",
        "鼓掌",
        "再见",
        "晚安",
    ];

    const RECENT_KEY = "sticker_recents";

    let recent = $state(loadRecent());

    function loadRecent() {
        try {
            const raw = localStorage.getItem(RECENT_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveRecent() {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
    }

    function handleSelect(sticker) {
        recent = [sticker, ...recent.filter((x) => x !== sticker)];
        saveRecent();
        onSelect?.(sticker);
        show = false;
    }

    function handleOverlayClick() {
        show = false;
    }

    function handlePanelClick(e) {
        e.stopPropagation();
    }
</script>

{#if show}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sticker-overlay" onclick={handleOverlayClick}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="sticker-panel" onclick={handlePanelClick}>
            <div class="sticker-header">
                <span class="sticker-title">表情</span>
                <button class="sticker-close" onclick={() => (show = false)}
                    >×</button
                >
            </div>

            <div class="sticker-section">
                <div class="sticker-section-title">最近使用</div>
                <div class="sticker-grid">
                    {#if recent.length}
                        {#each recent as sticker}
                            <button
                                class="sticker-btn"
                                onclick={() => handleSelect(sticker)}
                            >
                                {sticker}
                            </button>
                        {/each}
                    {:else}
                        <span class="sticker-empty">无最近使用</span>
                    {/if}
                </div>
            </div>

            <div class="sticker-section">
                <div class="sticker-section-title">全部表情</div>
                <div class="sticker-grid">
                    {#each DEFAULT_STICKERS as sticker}
                        <button
                            class="sticker-btn"
                            onclick={() => handleSelect(sticker)}
                        >
                            {sticker}
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .sticker-overlay {
        display: flex;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 9000;
        align-items: flex-end;
        justify-content: center;
    }

    .sticker-panel {
        background: #fff;
        border-radius: 16px 16px 0 0;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
        width: 100%;
        max-width: 420px;
        max-height: 60vh;
        overflow-y: auto;
        padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    .sticker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid #f0f0f0;
        position: sticky;
        top: 0;
        background: #fff;
        z-index: 1;
    }

    .sticker-title {
        font-weight: 600;
        font-size: 16px;
        color: #1a1a1a;
    }

    .sticker-close {
        border: none;
        background: transparent;
        font-size: 24px;
        color: #666;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
    }

    .sticker-section {
        padding: 12px 16px;
    }

    .sticker-section-title {
        font-weight: 600;
        font-size: 13px;
        color: #666;
        margin-bottom: 10px;
    }

    .sticker-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
        gap: 8px;
    }

    .sticker-btn {
        padding: 10px 8px;
        border: 1px solid #eee;
        border-radius: 10px;
        background: #f8fafc;
        cursor: pointer;
        font-size: 14px;
        color: #333;
        transition: all 0.15s ease;
    }

    .sticker-btn:hover {
        background: #e8f4ff;
        border-color: #b3d9ff;
    }

    .sticker-btn:active {
        transform: scale(0.95);
    }

    .sticker-empty {
        color: #94a3b8;
        font-size: 12px;
        grid-column: 1 / -1;
        text-align: center;
        padding: 12px;
    }

    @media (min-width: 640px) {
        .sticker-panel {
            border-radius: 16px;
            margin-bottom: 20px;
            max-height: 50vh;
        }
    }
</style>
