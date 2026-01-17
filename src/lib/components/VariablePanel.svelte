<script>
    /**
     * Variable Panel - Session variable management
     * Allows viewing, adding, editing, and deleting chat session variables
     * @component
     */
    import { chatStore } from "$stores";

    /** @type {{ visible?: boolean, sessionId?: string, onClose?: () => void }} */
    let {
        visible = $bindable(false),
        sessionId = "",
        onClose = () => {},
    } = $props();

    let searchTerm = $state("");
    let variables = $state({});

    // Get variables from chat store
    function loadVariables() {
        const sid = String(sessionId || "").trim();
        if (!sid) {
            variables = {};
            return;
        }
        variables = chatStore?.listVariables?.(sid) || {};
    }

    // Filter and sort variables
    let filteredEntries = $derived(() => {
        const term = searchTerm.trim().toLowerCase();
        return Object.entries(variables || {})
            .map(([k, v]) => ({
                key: String(k),
                value: v === null || v === undefined ? "" : String(v),
            }))
            .filter(({ key, value }) => {
                if (!term) return true;
                return (
                    key.toLowerCase().includes(term) ||
                    value.toLowerCase().includes(term)
                );
            })
            .sort((a, b) => a.key.localeCompare(b.key));
    });

    function handleClose() {
        visible = false;
        onClose?.();
    }

    function clearSearch() {
        searchTerm = "";
    }

    function handleKeydown(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            searchTerm = "";
        }
    }

    function promptAdd() {
        const key = prompt("变量名（name）", "");
        if (!key) return;
        const value = prompt("变量值（value）", "") ?? "";
        const sid = String(sessionId || "").trim();
        if (!sid) {
            window.toastr?.warning?.("请先进入聊天室");
            return;
        }
        chatStore?.setVariable?.(String(key).trim(), String(value), sid);
        loadVariables();
    }

    function promptEdit(key, curValue) {
        const next = prompt(`编辑变量：${key}`, String(curValue ?? ""));
        if (next === null) return;
        const sid = String(sessionId || "").trim();
        if (!sid) {
            window.toastr?.warning?.("请先进入聊天室");
            return;
        }
        chatStore?.setVariable?.(String(key).trim(), String(next), sid);
        loadVariables();
    }

    function deleteKey(key) {
        if (!confirm(`删除变量 "${key}"？`)) return;
        const sid = String(sessionId || "").trim();
        if (!sid) {
            window.toastr?.warning?.("请先进入聊天室");
            return;
        }
        chatStore?.deleteVariable?.(String(key).trim(), sid);
        loadVariables();
    }

    function clearAll() {
        if (!confirm("清空当前会话的所有变量？")) return;
        const sid = String(sessionId || "").trim();
        if (!sid) {
            window.toastr?.warning?.("请先进入聊天室");
            return;
        }
        chatStore?.clearVariables?.(sid);
        loadVariables();
    }

    // Reload when visible or sessionId changes
    $effect(() => {
        if (visible) {
            searchTerm = "";
            loadVariables();
        }
    });

    $effect(() => {
        if (sessionId) {
            loadVariables();
        }
    });
</script>

{#if visible}
    <div class="overlay" onclick={handleClose}>
        <div class="panel" onclick={(e) => e.stopPropagation()}>
            <!-- Header -->
            <div class="header">
                <div class="header-title">变量管理器</div>
                <div class="header-meta">
                    {sessionId ? `会话：${sessionId}` : "未选择会话"}
                </div>
                <button class="btn-close" onclick={handleClose}>关闭</button>
            </div>

            <!-- Search and Actions -->
            <div class="toolbar">
                <div class="search-box">
                    <input
                        type="text"
                        class="search-input"
                        placeholder="搜索变量名..."
                        bind:value={searchTerm}
                        onkeydown={handleKeydown}
                    />
                    {#if searchTerm.trim().length > 0}
                        <button
                            type="button"
                            class="btn-clear-search"
                            onclick={clearSearch}>×</button
                        >
                    {/if}
                </div>
                <div class="action-row">
                    <button class="btn-action" onclick={promptAdd}>新增</button>
                    <button class="btn-danger" onclick={clearAll}>清空</button>
                    <div class="hint">
                        提示：提示词中使用 <code>{"{{getvar::name}}"}</code>
                    </div>
                </div>
            </div>

            <!-- Variable List -->
            <div class="list">
                {#if filteredEntries().length === 0}
                    <div class="empty">
                        {sessionId ? "暂无变量" : "未选择会话"}
                    </div>
                {:else}
                    {#each filteredEntries() as { key, value }}
                        <div class="var-row">
                            <div class="var-info">
                                <div class="var-key">{key}</div>
                                <div class="var-value">{value || "（空）"}</div>
                            </div>
                            <button
                                class="btn-edit"
                                onclick={() => promptEdit(key, value)}
                                >编辑</button
                            >
                            <button
                                class="btn-delete"
                                onclick={() => deleteKey(key)}>删除</button
                            >
                        </div>
                        <div class="var-code">
                            <code>{"{{getvar::" + key + "}}"}</code>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.38);
        z-index: 22050;
        padding: calc(10px + env(safe-area-inset-top, 0px)) 10px
            calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .panel {
        width: min(96vw, 520px);
        height: min(86vh, 720px);
        background: #fff;
        border-radius: 14px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
    }

    .header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: #f3f4f6;
        border-bottom: 1px solid #e5e7eb;
    }

    .header-title {
        font-weight: 900;
    }

    .header-meta {
        margin-left: auto;
        font-size: 12px;
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .btn-close {
        border: 1px solid #e5e7eb;
        background: #fff;
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
    }

    .toolbar {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 14px;
        background: #fff;
    }

    .search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 14px;
        background: transparent;
    }

    .btn-clear-search {
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 10px;
        background: #f1f5f9;
        cursor: pointer;
        font-size: 16px;
    }

    .action-row {
        margin-top: 8px;
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .btn-action {
        border: 1px solid #e2e8f0;
        background: #fff;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-danger {
        border: 1px solid rgba(239, 68, 68, 0.35);
        background: #fff;
        color: #b91c1c;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        cursor: pointer;
    }

    .hint {
        margin-left: auto;
        color: #64748b;
        font-size: 12px;
    }

    .hint code {
        background: #f1f5f9;
        padding: 2px 4px;
        border-radius: 4px;
    }

    .list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
        padding: 10px 12px;
    }

    .empty {
        padding: 18px 10px;
        color: #94a3b8;
        text-align: center;
    }

    .var-row {
        padding: 10px;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        margin-bottom: 4px;
        background: #fff;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .var-info {
        flex: 1;
        min-width: 0;
    }

    .var-key {
        font-weight: 900;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .var-value {
        color: #64748b;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .btn-edit {
        border: 1px solid #e2e8f0;
        background: #fff;
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
    }

    .btn-delete {
        border: 1px solid rgba(239, 68, 68, 0.35);
        background: #fff;
        color: #b91c1c;
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
    }

    .var-code {
        margin-top: 4px;
        margin-bottom: 8px;
        font-size: 12px;
        color: #475569;
        padding-left: 10px;
    }

    .var-code code {
        background: #f1f5f9;
        padding: 2px 6px;
        border-radius: 4px;
    }
</style>
