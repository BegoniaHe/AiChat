<script>
    /**
     * Regex Rule Card Component
     * - Collapsible card for editing a single regex rule
     * - Used by both RegexPanel and RegexSessionPanel
     */
    import {
        PLACEMENT_OPTIONS,
        SUBSTITUTE_OPTIONS,
        getRuleSubtitle,
        getRuleTitle,
    } from "./regex-types.js";

    /** @type {{ rule: import('./regex-types.js').RegexRule, onUpdate?: () => void, onDelete?: () => void }} */
    let { rule = $bindable(), onUpdate, onDelete } = $props();

    // Local state
    let collapsed = $state(true);
    let trimStringsText = $state((rule.trimStrings || []).join("\n"));

    // Computed
    const title = $derived(getRuleTitle(rule));
    const subtitle = $derived(getRuleSubtitle(rule));

    /**
     * Toggle collapsed state
     */
    function toggleCollapsed() {
        collapsed = !collapsed;
    }

    /**
     * Handle enabled checkbox change (inverts disabled)
     */
    function handleEnabledChange(e) {
        rule.disabled = !e.target.checked;
        onUpdate?.();
    }

    /**
     * Handle placement checkbox change
     */
    function handlePlacementChange(value, checked) {
        const val = Number(value);
        if (checked) {
            if (!rule.placement.includes(val)) {
                rule.placement = [...rule.placement, val];
            }
        } else {
            rule.placement = rule.placement.filter((p) => p !== val);
        }
        onUpdate?.();
    }

    /**
     * Handle trim strings textarea change
     */
    function handleTrimStringsChange(e) {
        trimStringsText = e.target.value;
        rule.trimStrings = trimStringsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        onUpdate?.();
    }

    /**
     * Handle number input with null support
     */
    function handleDepthChange(field, value) {
        const v = String(value).trim();
        rule[field] = v === "" ? null : Number(v);
        onUpdate?.();
    }
</script>

<div
    class="rule-card"
    class:collapsed
    class:disabled={rule.disabled}
    data-rule-id={rule.id}
>
    <!-- Header (always visible) -->
    <div class="rule-header" onclick={toggleCollapsed}>
        <div class="rule-left">
            <span class="toggle-icon">{collapsed ? "▸" : "▾"}</span>
            <div class="rule-info">
                <div class="rule-title">{title}</div>
                <div class="rule-subtitle">{subtitle}</div>
            </div>
        </div>
        <div class="rule-right" onclick={(e) => e.stopPropagation()}>
            <label class="enabled-label">
                <input
                    type="checkbox"
                    checked={!rule.disabled}
                    onchange={handleEnabledChange}
                />
                启用
            </label>
            <button class="btn-delete" onclick={onDelete}>删除</button>
        </div>
    </div>

    <!-- Body (collapsible) -->
    {#if !collapsed}
        <div class="rule-body">
            <!-- Name and Find Regex Row -->
            <div class="form-row">
                <div class="form-col" style="flex: 1; min-width: 220px;">
                    <label>脚本名称</label>
                    <input
                        type="text"
                        bind:value={rule.scriptName}
                        oninput={() => onUpdate?.()}
                    />
                </div>
                <div class="form-col" style="flex: 1.5; min-width: 280px;">
                    <label>Find Regex</label>
                    <input
                        type="text"
                        class="monospace"
                        spellcheck="false"
                        bind:value={rule.findRegex}
                        oninput={() => onUpdate?.()}
                    />
                </div>
            </div>

            <!-- Replace and Trim Row -->
            <div class="form-row">
                <div class="form-col" style="flex: 1; min-width: 260px;">
                    <label>Replace With</label>
                    <textarea
                        class="monospace"
                        rows="3"
                        spellcheck="false"
                        bind:value={rule.replaceString}
                        oninput={() => onUpdate?.()}
                    ></textarea>
                    <div class="hint">
                        支持 {"{{match}}"}、$1/$2…、$&lt;name&gt;。
                    </div>
                </div>
                <div class="form-col" style="flex: 1; min-width: 260px;">
                    <label>Trim Out（每行一个）</label>
                    <textarea
                        rows="3"
                        spellcheck="false"
                        value={trimStringsText}
                        oninput={handleTrimStringsChange}
                    ></textarea>
                </div>
            </div>

            <!-- Affects and Options Row -->
            <div class="form-row">
                <!-- Affects Section -->
                <div class="form-section" style="flex: 1; min-width: 260px;">
                    <label class="section-title">影响条目（Affects）</label>
                    <div class="checkbox-group">
                        {#each PLACEMENT_OPTIONS as opt}
                            <label class="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={rule.placement.includes(opt.value)}
                                    onchange={(e) =>
                                        handlePlacementChange(
                                            opt.value,
                                            e.target.checked,
                                        )}
                                />
                                {opt.label}
                            </label>
                        {/each}
                    </div>

                    <div class="depth-row">
                        <span class="depth-label">深度</span>
                        <input
                            type="number"
                            min="-1"
                            max="9999"
                            placeholder="Min"
                            value={rule.minDepth ?? ""}
                            oninput={(e) =>
                                handleDepthChange("minDepth", e.target.value)}
                        />
                        <input
                            type="number"
                            min="0"
                            max="9999"
                            placeholder="Max"
                            value={rule.maxDepth ?? ""}
                            oninput={(e) =>
                                handleDepthChange("maxDepth", e.target.value)}
                        />
                        <span class="hint">0=最后一条，1=倒数第二条…</span>
                    </div>
                </div>

                <!-- Options Section -->
                <div class="form-section" style="flex: 1; min-width: 260px;">
                    <label class="section-title">其他选项</label>
                    <div class="options-list">
                        <label class="checkbox-label">
                            <input
                                type="checkbox"
                                bind:checked={rule.disabled}
                                onchange={() => onUpdate?.()}
                            />
                            停用（Disabled）
                        </label>
                        <label class="checkbox-label">
                            <input
                                type="checkbox"
                                bind:checked={rule.runOnEdit}
                                onchange={() => onUpdate?.()}
                            />
                            编辑消息时执行（Run On Edit）
                        </label>

                        <div class="select-row">
                            <span>Find Regex 宏</span>
                            <select
                                bind:value={rule.substituteRegex}
                                onchange={() => onUpdate?.()}
                            >
                                {#each SUBSTITUTE_OPTIONS as opt}
                                    <option value={opt.value}
                                        >{opt.label}</option
                                    >
                                {/each}
                            </select>
                        </div>

                        <div class="ephemerality-section">
                            <label class="section-subtitle"
                                >暂时性（Ephemerality）</label
                            >
                            <label class="checkbox-label">
                                <input
                                    type="checkbox"
                                    bind:checked={rule.markdownOnly}
                                    onchange={() => onUpdate?.()}
                                />
                                仅影响聊天显示（不改存档）
                            </label>
                            <label class="checkbox-label">
                                <input
                                    type="checkbox"
                                    bind:checked={rule.promptOnly}
                                    onchange={() => onUpdate?.()}
                                />
                                仅影响发送给 LLM 的 prompt（不改存档）
                            </label>
                            <div class="hint">
                                两者都不勾选：将直接修改聊天存档内容（不可逆）。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .rule-card {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 12px;
        background: #fff;
        overflow: hidden;
        transition:
            opacity 0.15s,
            filter 0.15s;
    }

    .rule-card.disabled {
        opacity: 0.62;
        filter: grayscale(1);
    }

    .rule-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        background: rgba(248, 250, 252, 0.85);
        cursor: pointer;
    }

    .rule-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
    }

    .toggle-icon {
        font-size: 16px;
        color: #64748b;
        user-select: none;
        width: 18px;
    }

    .rule-info {
        min-width: 0;
    }

    .rule-title {
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .rule-subtitle {
        color: #64748b;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .rule-right {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .enabled-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #334155;
        cursor: pointer;
    }

    .enabled-label input {
        width: 16px;
        height: 16px;
    }

    .btn-delete {
        padding: 6px 10px;
        border: 1px solid #fecaca;
        border-radius: 10px;
        background: #fee2e2;
        color: #b91c1c;
        cursor: pointer;
        font-size: 12px;
    }

    .btn-delete:hover {
        background: #fecaca;
    }

    .rule-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .form-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .form-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .form-section {
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        padding: 10px;
    }

    label {
        font-weight: 700;
        color: #0f172a;
        font-size: 13px;
    }

    .section-title {
        font-weight: 800;
        margin-bottom: 8px;
        display: block;
    }

    .section-subtitle {
        font-weight: 700;
        margin-bottom: 6px;
        display: block;
    }

    input[type="text"],
    input[type="number"],
    textarea,
    select {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 13px;
    }

    input[type="text"]:focus,
    input[type="number"]:focus,
    textarea:focus,
    select:focus {
        outline: none;
        border-color: #019aff;
    }

    .monospace {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
    }

    textarea {
        resize: vertical;
    }

    .hint {
        color: #64748b;
        font-size: 12px;
        margin-top: 4px;
    }

    .checkbox-group {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        color: #334155;
        font-size: 13px;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-weight: 400;
    }

    .checkbox-label input {
        width: 16px;
        height: 16px;
    }

    .depth-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
        align-items: center;
    }

    .depth-label {
        font-size: 13px;
        color: #334155;
        font-weight: 700;
    }

    .depth-row input[type="number"] {
        width: 120px;
    }

    .options-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        color: #334155;
        font-size: 13px;
    }

    .select-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .select-row span {
        font-weight: 700;
    }

    .select-row select {
        width: auto;
    }

    .ephemerality-section {
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
</style>
