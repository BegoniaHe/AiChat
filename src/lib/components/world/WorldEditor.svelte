<script>
    /**
     * World Editor Modal Component
     * - Full-featured world entry editor
     * - Left: entries list, Right: entry editor
     * - Add/duplicate/delete entries, save world
     */
    import { getWorldInfoStore } from "$stores";
    import Modal from "../Modal.svelte";
    import WorldEntryEditor from "./WorldEntryEditor.svelte";
    import {
        createDefaultEntry,
        deepClone,
        normalizeEntry,
        positionLabel,
    } from "./world-types.js";

    /** @type {{ onSaved?: (name: string, data: any) => void }} */
    let { onSaved } = $props();

    const store = getWorldInfoStore();

    // Modal state
    let visible = $state(false);
    let worldName = $state("");
    let data = $state({ name: "", entries: [] });
    let currentIndex = $state(0);

    // Computed
    let currentEntry = $derived(data.entries[currentIndex] || null);
    let entriesCount = $derived(data.entries.length);

    /**
     * Show editor with world data
     * @param {string} name - World name
     * @param {object} worldData - World data
     */
    export function show(name, worldData) {
        worldName = name;
        data = deepClone(worldData || { name, entries: [] });

        if (!Array.isArray(data.entries)) data.entries = [];
        data.entries = data.entries.map((e, i) => normalizeEntry(e, i));

        if (!data.entries.length) {
            data.entries.push(createDefaultEntry(0));
        }

        currentIndex = 0;
        visible = true;
    }

    /**
     * Hide editor
     */
    export function hide() {
        visible = false;
    }

    /**
     * Select an entry by index
     */
    function selectEntry(index) {
        currentIndex = Math.max(0, Math.min(index, data.entries.length - 1));
    }

    /**
     * Add new entry
     */
    function addEntry() {
        const newEntry = createDefaultEntry(data.entries.length);
        newEntry.id = `entry-${Date.now()}`;
        data.entries = [newEntry, ...data.entries];
        currentIndex = 0;
    }

    /**
     * Duplicate current entry
     */
    function duplicateEntry() {
        const base = data.entries[currentIndex];
        if (!base) return;

        const copy = normalizeEntry(deepClone(base), data.entries.length);
        copy.id = `entry-${Date.now()}`;
        copy.comment = `${copy.comment || "entry"}（复制）`;
        copy.title = copy.comment;

        data.entries = [
            ...data.entries.slice(0, currentIndex + 1),
            copy,
            ...data.entries.slice(currentIndex + 1),
        ];
        currentIndex = currentIndex + 1;
    }

    /**
     * Delete current entry
     */
    function deleteEntry() {
        if (data.entries.length <= 1) {
            window.toastr?.warning?.("至少保留一个条目");
            return;
        }

        data.entries = data.entries.filter((_, i) => i !== currentIndex);
        currentIndex = Math.max(0, currentIndex - 1);
    }

    /**
     * Save world to store
     */
    async function saveWorld() {
        try {
            // Prepare entries with alias fields
            const entries = data.entries.map((entry, i) => {
                const e = normalizeEntry(entry, i);
                e.title = e.comment;
                e.triggers = e.key;
                e.secondary = e.keysecondary;
                e.priority = e.order;
                return e;
            });

            const payload = { name: worldName, entries };
            await store.save(worldName, payload);

            window.toastr?.success?.(`世界书已保存：${worldName}`);
            onSaved?.(worldName, payload);
            hide();
        } catch (err) {
            console.error("保存世界书失败", err);
            window.toastr?.error?.("保存失败，请检查控制台");
        }
    }

    /**
     * Handle entry update from editor
     */
    function onEntryChange() {
        // Force reactivity update
        data.entries = [...data.entries];
    }

    /**
     * Get display label for entry position
     */
    function getPositionLabel(entry) {
        return positionLabel(entry.position, entry.role, entry.depth);
    }
</script>

<Modal bind:open={visible} title={`世界书：${worldName}`} size="xl" closable>
    <div class="world-editor-body">
        <!-- Left: Entries List -->
        <div class="entries-column">
            <div class="entries-toolbar">
                <button class="btn btn-primary" onclick={addEntry}>
                    ＋ 新条目
                </button>
            </div>
            <ul class="entries-list">
                {#each data.entries as entry, i (entry.id)}
                    <li
                        class="entry-item"
                        class:active={i === currentIndex}
                        onclick={() => selectEntry(i)}
                    >
                        <div class="entry-lights">
                            <span
                                class="light"
                                class:red={entry.disable}
                                class:green={!entry.disable}
                            ></span>
                            <span class="light" class:blue={entry.constant}
                            ></span>
                        </div>
                        <div class="entry-main">
                            <div class="entry-title">
                                {entry.comment || `（无标题 ${i + 1}）`}
                            </div>
                            <div class="entry-meta">
                                <span>{getPositionLabel(entry)}</span>
                                <span>D{entry.depth}</span>
                                <span>O{entry.order}</span>
                                <span
                                    >{entry.useProbability
                                        ? `${entry.probability}%`
                                        : "100%"}</span
                                >
                            </div>
                        </div>
                    </li>
                {/each}
            </ul>
        </div>

        <!-- Right: Entry Editor -->
        <div class="editor-column">
            {#if currentEntry}
                <WorldEntryEditor
                    bind:entry={data.entries[currentIndex]}
                    {onEntryChange}
                />
                <div class="editor-actions">
                    <button class="btn btn-secondary" onclick={duplicateEntry}>
                        复制条目
                    </button>
                    <button class="btn btn-danger" onclick={deleteEntry}>
                        删除条目
                    </button>
                </div>
            {:else}
                <div class="no-entry">（无条目）</div>
            {/if}
        </div>
    </div>

    {#snippet footer()}
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick={hide}>取消</button>
            <button class="btn btn-primary" onclick={saveWorld}>保存</button>
        </div>
    {/snippet}
</Modal>

<style>
    .world-editor-body {
        display: flex;
        gap: 16px;
        min-height: 400px;
        max-height: 70vh;
    }

    /* Entries List Column */
    .entries-column {
        width: 240px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        border-right: 1px solid #e2e8f0;
        padding-right: 16px;
    }

    .entries-toolbar {
        margin-bottom: 10px;
    }

    .entries-list {
        list-style: none;
        padding: 0;
        margin: 0;
        overflow-y: auto;
        flex: 1;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
    }

    .entry-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.15s;
    }

    .entry-item:last-child {
        border-bottom: none;
    }

    .entry-item:hover {
        background: #f8fafc;
    }

    .entry-item.active {
        background: #e0f2fe;
        border-left: 3px solid #019aff;
    }

    .entry-lights {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .light {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #e2e8f0;
    }

    .light.green {
        background: #22c55e;
    }
    .light.red {
        background: #ef4444;
    }
    .light.blue {
        background: #3b82f6;
    }

    .entry-main {
        flex: 1;
        min-width: 0;
    }

    .entry-title {
        font-weight: 600;
        font-size: 13px;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .entry-meta {
        display: flex;
        gap: 8px;
        font-size: 11px;
        color: #64748b;
        margin-top: 2px;
    }

    /* Editor Column */
    .editor-column {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }

    .editor-actions {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        margin-top: auto;
    }

    .no-entry {
        color: #94a3b8;
        padding: 20px;
        text-align: center;
    }

    /* Modal Actions */
    .modal-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
    }

    /* Buttons */
    .btn {
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        border: 1px solid transparent;
    }

    .btn-primary {
        background: #019aff;
        color: #fff;
        border-color: #019aff;
    }

    .btn-primary:hover {
        background: #0284c7;
        border-color: #0284c7;
    }

    .btn-secondary {
        background: #f5f5f5;
        color: #334155;
        border-color: #e2e8f0;
    }

    .btn-secondary:hover {
        background: #e2e8f0;
    }

    .btn-danger {
        background: #fee2e2;
        color: #b91c1c;
        border-color: #fecaca;
    }

    .btn-danger:hover {
        background: #fecaca;
    }
</style>
