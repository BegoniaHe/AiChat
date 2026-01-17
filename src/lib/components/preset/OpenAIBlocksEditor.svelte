<script>
    /**
     * OpenAI Blocks Editor - Custom prompt blocks with drag-drop reorder
     * @component
     */
    import { OPENAI_KNOWN_BLOCKS, roleIdToName } from "./preset-types.js";

    /** @type {{ preset: Object, onUpdate?: (data: Object) => void }} */
    let { preset = {}, onUpdate = () => {} } = $props();

    // Extract prompt data
    function pickPromptOrderBlock(p) {
        const arr = Array.isArray(p.prompt_order) ? p.prompt_order : [];
        const byId = (id) =>
            arr.find(
                (b) =>
                    b &&
                    typeof b === "object" &&
                    String(b.character_id) === String(id),
            );
        // ST PromptManager global dummyId=100001, keep 100000 as fallback.
        return byId(100001) || byId(100000) || arr[0] || null;
    }

    let prompts = $state(Array.isArray(preset.prompts) ? preset.prompts : []);
    let promptById = $state(new Map());
    let blocks = $state([]);

    $effect(() => {
        prompts = Array.isArray(preset.prompts) ? preset.prompts : [];
        promptById = new Map();
        prompts.forEach((pr) => {
            if (pr?.identifier) promptById.set(pr.identifier, pr);
        });

        const orderBlock = pickPromptOrderBlock(preset);
        const order = Array.isArray(orderBlock?.order) ? orderBlock.order : [];

        blocks = order.length
            ? order.map((o) => ({
                  identifier: o.identifier,
                  enabled: o.enabled !== false,
                  collapsed: true,
              }))
            : prompts
                  .filter((pr) => pr?.identifier)
                  .map((pr) => ({
                      identifier: pr.identifier,
                      enabled: true,
                      collapsed: true,
                  }));
    });

    // Drag state
    let draggedId = $state(null);
    let dropTargetId = $state(null);

    function getBlockData(identifier) {
        const pr = promptById.get(identifier);
        const known = OPENAI_KNOWN_BLOCKS[identifier];
        const isMarker = Boolean(pr?.marker) || Boolean(known?.marker);
        const canEdit = !isMarker && (typeof pr?.content === "string" || !pr);
        const title = pr?.name || known?.label || identifier;
        const roleName = roleIdToName(pr?.role || "system");
        const sysPrompt =
            typeof pr?.system_prompt === "boolean" ? pr.system_prompt : true;
        const content = pr?.content || "";

        return {
            pr,
            known,
            isMarker,
            canEdit,
            title,
            roleName,
            sysPrompt,
            content,
        };
    }

    function toggleCollapsed(identifier) {
        blocks = blocks.map((b) =>
            b.identifier === identifier ? { ...b, collapsed: !b.collapsed } : b,
        );
    }

    function toggleEnabled(identifier, enabled) {
        blocks = blocks.map((b) =>
            b.identifier === identifier ? { ...b, enabled } : b,
        );
    }

    function deleteBlock(identifier) {
        if (!confirm(`删除区块「${identifier}」？`)) return;
        blocks = blocks.filter((b) => b.identifier !== identifier);
        promptById.delete(identifier);
    }

    function updateBlockName(identifier, name) {
        const pr = promptById.get(identifier) || { identifier };
        promptById.set(identifier, { ...pr, name });
    }

    function updateBlockRole(identifier, role) {
        const pr = promptById.get(identifier) || { identifier };
        promptById.set(identifier, { ...pr, role });
    }

    function updateBlockSystemPrompt(identifier, systemPrompt) {
        const pr = promptById.get(identifier) || { identifier };
        promptById.set(identifier, { ...pr, system_prompt: systemPrompt });
    }

    function updateBlockContent(identifier, content) {
        const pr = promptById.get(identifier) || { identifier };
        promptById.set(identifier, { ...pr, content });
    }

    // Drag handlers
    function handleDragStart(e, identifier) {
        draggedId = identifier;
        e.dataTransfer?.setData("text/plain", identifier);
        e.target.style.opacity = "0.6";
    }

    function handleDragEnd(e) {
        draggedId = null;
        dropTargetId = null;
        e.target.style.opacity = "";
    }

    function handleDragOver(e, identifier) {
        e.preventDefault();
        dropTargetId = identifier;
    }

    function handleDragLeave(e, identifier) {
        if (dropTargetId === identifier) {
            dropTargetId = null;
        }
    }

    function handleDrop(e, targetIdentifier) {
        e.preventDefault();
        const fromId = draggedId;
        dropTargetId = null;

        if (!fromId || fromId === targetIdentifier) return;

        const fromIndex = blocks.findIndex((b) => b.identifier === fromId);
        const toIndex = blocks.findIndex(
            (b) => b.identifier === targetIdentifier,
        );

        if (fromIndex < 0 || toIndex < 0) return;

        const newBlocks = [...blocks];
        const [moved] = newBlocks.splice(fromIndex, 1);
        newBlocks.splice(toIndex, 0, moved);
        blocks = newBlocks;
    }

    function addBlock() {
        const identifier = prompt(
            "区块 identifier（唯一，如 myPrompt）",
            `custom_${Date.now()}`,
        );
        if (!identifier) return;

        const exists = blocks.some((b) => b.identifier === identifier);
        if (exists) {
            window.toastr?.warning?.("identifier 已存在");
            return;
        }

        const name = prompt("区块名称", identifier) || identifier;
        const role = (
            prompt("role: system/user/assistant", "system") || "system"
        ).toLowerCase();
        const content = prompt("区块内容（可稍后再改）", "") ?? "";

        promptById.set(identifier, {
            identifier,
            name,
            role,
            system_prompt: true,
            marker: false,
            content,
        });

        blocks = [...blocks, { identifier, enabled: true, collapsed: false }];
    }

    export function collectData() {
        // Build prompts array from promptById
        const newPrompts = [];

        blocks.forEach(({ identifier }) => {
            if (!identifier) return;
            if (promptById.has(identifier)) {
                newPrompts.push(promptById.get(identifier));
            } else {
                const known = OPENAI_KNOWN_BLOCKS[identifier];
                if (known?.marker) {
                    newPrompts.push({
                        identifier,
                        name: known.label,
                        system_prompt: true,
                        marker: true,
                    });
                }
            }
        });

        // Build order array
        const order = blocks
            .filter((b) => b?.identifier)
            .map((b) => ({ identifier: b.identifier, enabled: b.enabled }));

        // Per requirement: only keep ST global dummyId=100001 block
        const prompt_order = [{ character_id: 100001, order }];

        return {
            ...preset,
            prompts: newPrompts,
            prompt_order,
        };
    }
</script>

<div class="editor-section">
    <div class="section-header">
        <div class="section-title">自定义提示词区块（Prompt Blocks）</div>
        <div class="section-desc">
            与 ST 类似：区块默认折叠，点击展开；可拖拽排序并可新增自定义区块
        </div>
    </div>

    <div class="blocks-header">
        <div class="blocks-info">
            <div class="blocks-title">提示词区块（可拖拽排序）</div>
            <div class="blocks-hint">
                与 ST 相同：可拖拽调整顺序；marker（如 Chat History/World
                Info）不显示内容
            </div>
        </div>
        <button type="button" class="add-btn" onclick={addBlock}>
            ＋ 新增区块
        </button>
    </div>

    <div class="blocks-list">
        {#each blocks as block (block.identifier)}
            {@const { isMarker, canEdit, title, roleName, sysPrompt, content } =
                getBlockData(block.identifier)}
            <div
                class="block-card"
                class:drop-target={dropTargetId === block.identifier}
                class:disabled={!block.enabled}
                draggable="true"
                ondragstart={(e) => handleDragStart(e, block.identifier)}
                ondragend={handleDragEnd}
                ondragover={(e) => handleDragOver(e, block.identifier)}
                ondragleave={(e) => handleDragLeave(e, block.identifier)}
                ondrop={(e) => handleDrop(e, block.identifier)}
            >
                <div
                    class="block-header"
                    onclick={() => toggleCollapsed(block.identifier)}
                >
                    <div class="block-left">
                        <span class="collapse-toggle"
                            >{block.collapsed ? "▸" : "▾"}</span
                        >
                        <span class="drag-handle">☰</span>
                        <div class="block-info">
                            <div class="block-title">{title}</div>
                            <div class="block-subtitle">
                                {isMarker
                                    ? "marker（自动填充）"
                                    : `role: ${roleName}`}
                            </div>
                        </div>
                    </div>
                    <div class="block-right">
                        <label
                            class="enable-label"
                            onclick={(e) => e.stopPropagation()}
                        >
                            <input
                                type="checkbox"
                                checked={block.enabled}
                                onchange={(e) =>
                                    toggleEnabled(
                                        block.identifier,
                                        e.target.checked,
                                    )}
                            />
                            启用
                        </label>
                        {#if canEdit}
                            <button
                                type="button"
                                class="delete-btn"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    deleteBlock(block.identifier);
                                }}
                            >
                                删除
                            </button>
                        {/if}
                    </div>
                </div>

                {#if !block.collapsed}
                    {#if canEdit}
                        <div class="block-body">
                            <div class="meta-row">
                                <div class="meta-cell">
                                    <input
                                        type="text"
                                        class="field-input"
                                        placeholder="区块名称"
                                        value={promptById.get(block.identifier)
                                            ?.name || title}
                                        oninput={(e) =>
                                            updateBlockName(
                                                block.identifier,
                                                e.target.value,
                                            )}
                                    />
                                </div>
                                <div class="meta-cell-right">
                                    <select
                                        class="field-select"
                                        value={roleName}
                                        onchange={(e) =>
                                            updateBlockRole(
                                                block.identifier,
                                                e.target.value,
                                            )}
                                    >
                                        <option value="system">system</option>
                                        <option value="user">user</option>
                                        <option value="assistant"
                                            >assistant</option
                                        >
                                    </select>
                                    <label class="sys-prompt-label">
                                        <input
                                            type="checkbox"
                                            checked={sysPrompt}
                                            onchange={(e) =>
                                                updateBlockSystemPrompt(
                                                    block.identifier,
                                                    e.target.checked,
                                                )}
                                        />
                                        system_prompt
                                    </label>
                                </div>
                            </div>
                            <div class="content-group">
                                <label class="field-label"
                                    >{block.identifier}</label
                                >
                                <textarea
                                    class="field-textarea"
                                    value={content}
                                    oninput={(e) =>
                                        updateBlockContent(
                                            block.identifier,
                                            e.target.value,
                                        )}
                                    spellcheck="false"
                                ></textarea>
                            </div>
                        </div>
                    {:else}
                        <div class="block-body marker-hint">
                            该区块为 marker，将在构建 prompt
                            时自动填充内容（不在此处编辑）。
                        </div>
                    {/if}
                {/if}
            </div>
        {/each}
    </div>
</div>

<style>
    .editor-section {
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        padding: 12px;
        background: rgba(248, 250, 252, 0.6);
    }

    .section-header {
        margin-bottom: 12px;
    }

    .section-title {
        font-weight: 800;
        color: #0f172a;
    }

    .section-desc {
        color: #64748b;
        font-size: 12px;
        margin-top: 4px;
    }

    .blocks-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding-top: 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.06);
    }

    .blocks-info {
        min-width: 0;
    }

    .blocks-title {
        font-weight: 800;
        color: #0f172a;
    }

    .blocks-hint {
        color: #64748b;
        font-size: 12px;
        margin-top: 4px;
    }

    .add-btn {
        padding: 8px 10px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        cursor: pointer;
        font-size: 12px;
    }

    .add-btn:hover {
        background: #f8fafc;
    }

    .blocks-list {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .block-card {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 12px;
        background: #fff;
        overflow: hidden;
        transition:
            opacity 0.2s,
            filter 0.2s;
    }

    .block-card.disabled {
        opacity: 0.62;
        filter: grayscale(1);
        background: #f1f5f9;
    }

    .block-card.disabled .block-header {
        background: #e2e8f0;
    }

    .block-card.drop-target {
        border-color: #019aff;
        box-shadow: 0 0 0 2px rgba(1, 154, 255, 0.2);
    }

    .block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        background: rgba(248, 250, 252, 0.85);
        cursor: pointer;
    }

    .block-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }

    .collapse-toggle {
        font-size: 16px;
        color: #64748b;
        user-select: none;
        width: 18px;
    }

    .drag-handle {
        font-size: 16px;
        color: #64748b;
        cursor: grab;
        user-select: none;
    }

    .block-info {
        min-width: 0;
    }

    .block-title {
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .block-subtitle {
        color: #64748b;
        font-size: 12px;
    }

    .block-right {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .enable-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #334155;
        cursor: pointer;
    }

    .enable-label input {
        width: 16px;
        height: 16px;
    }

    .delete-btn {
        padding: 6px 10px;
        border: 1px solid #fecaca;
        border-radius: 10px;
        background: #fee2e2;
        color: #b91c1c;
        cursor: pointer;
        font-size: 12px;
    }

    .delete-btn:hover {
        background: #fecaca;
    }

    .block-body {
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .block-body.marker-hint {
        color: #64748b;
        font-size: 12px;
    }

    .meta-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .meta-cell {
        flex: 1;
        min-width: 180px;
    }

    .meta-cell-right {
        flex: 1;
        min-width: 180px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .field-input {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .field-select {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .sys-prompt-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #334155;
        cursor: pointer;
    }

    .sys-prompt-label input {
        width: 16px;
        height: 16px;
    }

    .content-group {
        margin-top: 6px;
    }

    .field-label {
        display: block;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 6px;
    }

    .field-textarea {
        width: 100%;
        min-height: 120px;
        resize: vertical;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.45;
        background: #ffffff;
        color: #0f172a;
        box-sizing: border-box;
    }

    .field-textarea:focus,
    .field-input:focus,
    .field-select:focus {
        outline: none;
        border-color: #019aff;
    }
</style>
