<script>
    /**
     * MomentSummaryPanel.svelte - 动态摘要面板
     * 迁移自: src/scripts/ui/moment-summary-panel.js
     */
    import { logger } from "$utils";
    import Modal from "../Modal.svelte";
    import CompactedRawModal from "./CompactedRawModal.svelte";
    import {
        formatTime,
        getSummaryKey,
        parseEditedSummaryLines,
        parseSummaryKey,
    } from "./moment-summary-types.js";
    import SummaryEditModal from "./SummaryEditModal.svelte";
    import SummaryItem from "./SummaryItem.svelte";

    /**
     * @typedef {Object} MomentSummaryStoreInterface
     * @property {Array<{text: string, at: number}>} summaries
     * @property {{text: string, at: number} | null} compacted
     * @property {string} compactedRaw
     * @property {() => void} clearSummaries
     * @property {(items: Array<{at: number, text: string}>) => void} deleteSummaryItems
     * @property {(updates: Array<{at: number, fromText: string, toText: string}>) => void} updateSummaryItems
     * @property {(text: string, options?: {at?: number}) => void} setCompactedSummary
     * @property {() => void} clearCompactedSummary
     */

    /**
     * @typedef {Object} Props
     * @property {boolean} [open=false] - 是否打开
     * @property {MomentSummaryStoreInterface | null} [store=null] - 摘要 store
     * @property {(options?: {force?: boolean}) => Promise<boolean>} [onRunCompaction] - 运行大总结生成的回调
     * @property {() => void} [onClose] - 关闭回调
     */

    /** @type {Props} */
    let {
        open = $bindable(false),
        store = null,
        onRunCompaction,
        onClose,
    } = $props();

    // 本地状态
    let batchMode = $state(false);
    let selectedKeys = $state(new Set());
    let compacting = $state(false);

    // 编辑弹窗状态
    let editModalOpen = $state(false);
    let editModalValue = $state("");
    let editModalTitle = $state("编辑摘要");
    /** @type {((value: string) => void) | null} */
    let editModalOnSave = $state(null);

    // 原始回复弹窗状态
    let rawModalOpen = $state(false);
    let rawModalValue = $state("");

    // 派生数据
    const summaries = $derived.by(() => {
        const list = store?.summaries || [];
        return [...list].reverse().slice(0, 60);
    });

    const compactedSummary = $derived(store?.compacted);
    const compactedText = $derived(compactedSummary?.text || "");
    const compactedTime = $derived(formatTime(compactedSummary?.at));
    const compactedRaw = $derived(store?.compactedRaw || "");

    // 退出批量模式
    function exitBatchMode() {
        batchMode = false;
        selectedKeys = new Set();
    }

    // 切换选择
    function toggleSelection(key) {
        const newSet = new Set(selectedKeys);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        selectedKeys = newSet;
    }

    // 复制摘要
    async function copySummary(text) {
        try {
            await navigator.clipboard?.writeText?.(text);
            window.toastr?.success?.("已复制摘要");
        } catch {}
    }

    // 清空所有摘要
    function clearAllSummaries() {
        if (!confirm("确定要清空所有动态摘要吗？")) return;
        try {
            store?.clearSummaries?.();
        } catch {}
        exitBatchMode();
    }

    // 删除选中的摘要
    function deleteSelectedSummaries() {
        const keys = [...selectedKeys];
        if (!keys.length) {
            window.toastr?.info?.("未选择任何摘要");
            return;
        }
        if (!confirm(`确定要删除所选摘要（${keys.length}条）吗？`)) return;

        const items = keys.map(parseSummaryKey);
        try {
            store?.deleteSummaryItems?.(items);
        } catch {}
        exitBatchMode();
    }

    // 编辑选中的摘要
    function editSelectedSummaries() {
        const keys = [...selectedKeys];
        if (!keys.length) {
            window.toastr?.info?.("未选择任何摘要");
            return;
        }

        const entries = keys.map(parseSummaryKey);
        const initial = entries.map((e) => `- ${e.text}`).join("\n");

        editModalTitle = "批量编辑摘要";
        editModalValue = initial;
        editModalOnSave = (nextRaw) => {
            const lines = parseEditedSummaryLines(nextRaw);
            if (lines.length !== entries.length) {
                window.toastr?.error?.(
                    `行数不匹配：需要 ${entries.length} 行，实际 ${lines.length} 行`,
                );
                return;
            }
            const updates = entries.map((e, i) => ({
                at: e.at,
                fromText: e.text,
                toText: lines[i],
            }));
            try {
                store?.updateSummaryItems?.(updates);
            } catch {}
            editModalOpen = false;
            exitBatchMode();
        };
        editModalOpen = true;
    }

    // 查看原始回复
    function openRawModal() {
        const raw = compactedRaw.trim();
        if (!raw) {
            window.toastr?.warning?.("暂无原始回复");
            return;
        }
        rawModalValue = raw;
        rawModalOpen = true;
    }

    // 编辑大总结
    function editCompactedSummary() {
        if (!compactedText) {
            window.toastr?.info?.("暂无大总结");
            return;
        }

        editModalTitle = "编辑大总结";
        editModalValue = compactedText;
        editModalOnSave = (nextRaw) => {
            const next = String(nextRaw || "").trim();
            if (!next) {
                window.toastr?.warning?.("内容为空");
                return;
            }
            try {
                store?.setCompactedSummary?.(next, { at: Date.now() });
            } catch {}
            editModalOpen = false;
            window.dispatchEvent(new CustomEvent("moment-summaries-updated"));
        };
        editModalOpen = true;
    }

    // 运行大总结生成
    async function runCompaction() {
        if (compacting) return;
        if (typeof onRunCompaction !== "function") {
            window.toastr?.error?.("大总结生成器尚未初始化，请稍后再试");
            return;
        }

        compacting = true;
        try {
            window.toastr?.info?.("正在生成大总结…");
            const ok = await onRunCompaction({ force: true });
            if (!ok) {
                window.toastr?.error?.(
                    "大总结解析失败：未输出 <summary>…</summary> 或内容格式不符合要求，请重试",
                );
            }
        } catch (err) {
            logger.warn("手动生成动态大总结失败", err);
            window.toastr?.error?.("生成失败");
        } finally {
            compacting = false;
        }
    }

    // 清空大总结
    function clearCompacted() {
        if (!confirm("确定要清空动态大总结吗？")) return;
        try {
            store?.clearCompactedSummary?.();
        } catch {}
    }

    // 复制大总结
    async function copyCompacted() {
        if (!compactedText) return;
        try {
            await navigator.clipboard?.writeText?.(compactedText);
            window.toastr?.success?.("已复制大总结");
        } catch {}
    }

    function handleClose() {
        exitBatchMode();
        open = false;
        onClose?.();
    }
</script>

<Modal
    {open}
    onClose={handleClose}
    title="动态摘要"
    maxWidth="760px"
    maxHeight="86vh"
>
    <div class="summary-panel">
        <!-- 摘要列表区域 -->
        <div class="section">
            <div class="section-header">
                <div class="section-title">摘要列表</div>
                <div class="section-actions">
                    <button
                        class="icon-btn"
                        title="批量操作"
                        onclick={() => (batchMode = !batchMode)}
                    >
                        ☑
                    </button>
                    <button
                        class="icon-btn danger"
                        title="清空"
                        onclick={clearAllSummaries}
                    >
                        🗑
                    </button>
                </div>
            </div>

            {#if batchMode}
                <div class="batch-bar">
                    <button
                        class="icon-btn"
                        title="批量编辑"
                        onclick={editSelectedSummaries}>✎</button
                    >
                    <button
                        class="icon-btn danger"
                        title="批量删除"
                        onclick={deleteSelectedSummaries}>🗑</button
                    >
                    <button
                        class="icon-btn"
                        title="退出批量"
                        onclick={exitBatchMode}>×</button
                    >
                </div>
            {/if}

            <div class="list-container">
                {#if summaries.length === 0}
                    <div class="empty">暂无摘要</div>
                {:else}
                    {#each summaries as item (getSummaryKey(item))}
                        {@const key = getSummaryKey(item)}
                        {@const text =
                            typeof item === "string" ? item : item?.text || ""}
                        {@const at = typeof item === "object" ? item?.at : 0}
                        <SummaryItem
                            {text}
                            {at}
                            {batchMode}
                            selected={selectedKeys.has(key)}
                            onToggle={() => toggleSelection(key)}
                            onClick={() => copySummary(text)}
                        />
                    {/each}
                {/if}
            </div>
        </div>

        <!-- 大总结区域 -->
        <div class="section">
            <div class="section-header">
                <div class="section-title">大总结（自动生成）</div>
                <div class="section-actions">
                    <button
                        class="icon-btn"
                        title="查看原始回复"
                        onclick={openRawModal}>📄</button
                    >
                    <button
                        class="icon-btn"
                        title="编辑"
                        onclick={editCompactedSummary}>✎</button
                    >
                    <button
                        class="icon-btn"
                        title="手动生成/刷新"
                        onclick={runCompaction}
                        disabled={compacting}
                    >
                        {compacting ? "⏳" : "↻"}
                    </button>
                    <button
                        class="icon-btn danger"
                        title="删除"
                        onclick={clearCompacted}>🗑</button
                    >
                </div>
            </div>

            <div class="list-container compacted">
                {#if !compactedText}
                    <div class="empty">暂无大总结</div>
                {:else}
                    <button class="compacted-item" onclick={copyCompacted}>
                        <div class="text">{compactedText}</div>
                        {#if compactedTime}
                            <div class="time">{compactedTime}</div>
                        {/if}
                    </button>
                {/if}
            </div>
        </div>
    </div>
</Modal>

<!-- 编辑弹窗 -->
<SummaryEditModal
    bind:open={editModalOpen}
    value={editModalValue}
    title={editModalTitle}
    onSave={editModalOnSave}
    onClose={() => {
        editModalOpen = false;
        editModalOnSave = null;
    }}
/>

<!-- 原始回复弹窗 -->
<CompactedRawModal
    bind:open={rawModalOpen}
    value={rawModalValue}
    onClose={() => (rawModalOpen = false)}
/>

<style>
    .summary-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 12px 14px;
        overflow: auto;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }

    .section-title {
        font-size: 12px;
        color: #64748b;
    }

    .section-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .icon-btn {
        width: 32px;
        height: 28px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        color: #0f172a;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .icon-btn:hover {
        background: #f8fafc;
    }

    .icon-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .icon-btn.danger {
        border-color: #fecaca;
        color: #b91c1c;
    }

    .icon-btn.danger:hover {
        background: #fef2f2;
    }

    .batch-bar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        margin: 6px 0 8px;
    }

    .batch-bar .icon-btn {
        width: 34px;
        height: 30px;
    }

    .list-container {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 8px;
        background: #fff;
    }

    .list-container.compacted {
        max-height: 240px;
    }

    .empty {
        padding: 12px;
        color: #94a3b8;
        text-align: center;
        font-size: 12px;
    }

    .compacted-item {
        display: block;
        width: 100%;
        padding: 10px;
        border: none;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        background: #fff;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s;
    }

    .compacted-item:hover {
        background: #f8fafc;
    }

    .compacted-item .text {
        color: #0f172a;
        font-size: 13px;
        line-height: 1.35;
        white-space: pre-wrap;
    }

    .compacted-item .time {
        color: #94a3b8;
        font-size: 11px;
        margin-top: 6px;
    }
</style>
